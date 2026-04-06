import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';

const extensionName = 'storyweaver';
const setupEventNamespace = '.storyweaver';

const defaultSettings = {
    panelCollapsed: true,
};

let settings = {};
let txtToWorldbookModule = null;
let txtToWorldbookInitPromise = null;
let directorPromptReadyHandler = null;
let directorMessageSentHandler = null;
let directorGenerationStartedHandler = null;
const directorPromptGate = {
    pendingUserSend: false,
    lastUserSendAt: 0,
    lastGeneration: null,
    lastHandledAt: 0,
    inProgress: false,
};

function isDirectorTraceEnabled() {
    try {
        return localStorage.getItem('storyweaver-director-debug') === 'true';
    } catch (_) {
        return false;
    }
}

function directorTrace(message) {
    if (!isDirectorTraceEnabled()) return;
    console.debug(`[StoryWeaver][DirectorGate] ${message}`);
}

function getExtensionFolderName() {
    const match = /\/scripts\/extensions\/third-party\/([^/]+)\//.exec(import.meta.url);
    return match?.[1] ? decodeURIComponent(match[1]) : 'StoryWeaver';
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mountDrawerHtml(html) {
    const existingWrapper = document.getElementById('storyweaver-wrapper');

    const topbarAnchor = $('#extensions-settings-button');
    if (topbarAnchor.length > 0) {
        if (existingWrapper) {
            topbarAnchor.after(existingWrapper);
        } else {
            topbarAnchor.after(html);
        }
        return true;
    }

    const settingsPanel = $('#extensions_settings2');
    if (settingsPanel.length > 0) {
        if (existingWrapper) {
            settingsPanel.append(existingWrapper);
        } else {
            settingsPanel.append(html);
        }
        return true;
    }

    return false;
}

async function mountDrawerWithRetry(html, maxAttempts = 30, intervalMs = 200) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (mountDrawerHtml(html)) {
            return true;
        }
        await delay(intervalMs);
    }
    return false;
}

async function loadTxtToWorldbookModule() {
    if (!txtToWorldbookModule) {
        txtToWorldbookModule = await import('./txtToWorldbook/main.js');
    }
    return txtToWorldbookModule;
}

async function ensureTxtToWorldbookReady() {
    if (!txtToWorldbookInitPromise) {
        txtToWorldbookInitPromise = (async () => {
            const moduleRef = await loadTxtToWorldbookModule();
            await moduleRef.initTxtToWorldbookBridge();
            return moduleRef;
        })();
    }
    return txtToWorldbookInitPromise;
}

function getTxtToWorldbookApiSafe() {
    return txtToWorldbookModule?.getTxtToWorldbookApi?.();
}

function extractGenerationContext(eventData) {
    if (eventData && typeof eventData === 'object') {
        return {
            type: eventData.type ?? eventData.generationType ?? directorPromptGate.lastGeneration?.type,
            params: eventData.params ?? eventData.generationParams ?? directorPromptGate.lastGeneration?.params,
            dryRun: eventData.dryRun ?? directorPromptGate.lastGeneration?.dryRun,
        };
    }
    return directorPromptGate.lastGeneration || {};
}

function getDirectorSkipReason(eventData) {
    if (!eventData || typeof eventData !== 'object' || eventData.dryRun) {
        return 'invalid-or-dryrun';
    }

    const ctx = extractGenerationContext(eventData);
    const params = ctx.params || {};
    const type = String(ctx.type || '').toLowerCase();

    const isQuiet = type === 'quiet'
        || !!params.quiet_prompt
        || params.quiet === true
        || params.is_quiet === true;
    const isAuto = !!params.automatic_trigger
        || !!params.background
        || !!params.is_background;
    if (isQuiet || isAuto) {
        return `quiet-or-background(type=${type || 'unknown'})`;
    }

    const isRegenerate = type === 'regenerate' || type === 'swipe' || !!params.regenerate || !!params.swipe;
    const recentUserSend = directorPromptGate.lastUserSendAt > 0
        && (Date.now() - directorPromptGate.lastUserSendAt) < 45000;

    if (!directorPromptGate.pendingUserSend && !recentUserSend && !isRegenerate) {
        return 'no-recent-user-input';
    }

    return null;
}

function registerDirectorPromptHook() {
    if (!eventSource || !event_types?.CHAT_COMPLETION_PROMPT_READY) {
        directorTrace('eventSource or CHAT_COMPLETION_PROMPT_READY missing, skip register');
        return;
    }

    if (!directorMessageSentHandler && event_types?.MESSAGE_SENT) {
        directorMessageSentHandler = () => {
            directorPromptGate.pendingUserSend = true;
            directorPromptGate.lastUserSendAt = Date.now();
            directorTrace('MESSAGE_SENT received, mark pendingUserSend=true');
        };
    }

    if (!directorGenerationStartedHandler && event_types?.GENERATION_STARTED) {
        directorGenerationStartedHandler = (type, params, dryRun) => {
            directorPromptGate.lastGeneration = {
                type,
                params,
                dryRun,
                at: Date.now(),
            };
            const isRegenerate = type === 'regenerate' || type === 'swipe' || !!params?.regenerate || !!params?.swipe;
            if (isRegenerate) {
                directorPromptGate.pendingUserSend = true;
                directorPromptGate.lastUserSendAt = Date.now();
                directorTrace(`GENERATION_STARTED(${type}) treated as user-triggered regenerate/swipe`);
            }
        };
    }

    if (!directorPromptReadyHandler) {
        directorPromptReadyHandler = async (eventData) => {
            if (directorPromptGate.inProgress) {
                directorTrace('skip: inProgress lock active');
                return;
            }
            if (Date.now() - directorPromptGate.lastHandledAt < 800) {
                directorTrace('skip: throttled within 800ms');
                return;
            }
            const skipReason = getDirectorSkipReason(eventData);
            if (skipReason) {
                directorTrace(`skip: ${skipReason}`);
                return;
            }

            directorPromptGate.inProgress = true;
            directorPromptGate.lastHandledAt = Date.now();
            try {
                const api = getTxtToWorldbookApiSafe();
                if (!api || typeof api.runDirectorBeforeGeneration !== 'function') {
                    directorTrace('skip: txtToWorldbook api not ready or missing runDirectorBeforeGeneration');
                    return;
                }
                await api.runDirectorBeforeGeneration(eventData);
                directorTrace('runDirectorBeforeGeneration completed');
            } catch (error) {
                console.warn('[StoryWeaver] director hook failed:', error?.message || error);
            } finally {
                directorPromptGate.inProgress = false;
                directorPromptGate.pendingUserSend = false;
            }
        };
    }

    if (event_types?.MESSAGE_SENT && directorMessageSentHandler) {
        eventSource.off?.(event_types.MESSAGE_SENT, directorMessageSentHandler);
        eventSource.on(event_types.MESSAGE_SENT, directorMessageSentHandler);
    }

    if (event_types?.GENERATION_STARTED && directorGenerationStartedHandler) {
        eventSource.off?.(event_types.GENERATION_STARTED, directorGenerationStartedHandler);
        eventSource.on(event_types.GENERATION_STARTED, directorGenerationStartedHandler);
    }

    eventSource.off?.(event_types.CHAT_COMPLETION_PROMPT_READY, directorPromptReadyHandler);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, directorPromptReadyHandler);
    directorTrace('director prompt hook registered');
}

function ensureSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = { ...defaultSettings };
    }
    settings = {
        ...defaultSettings,
        ...extension_settings[extensionName],
    };
    extension_settings[extensionName] = settings;
}

function persistSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

function updateDrawerUI() {
    const iconEl = document.getElementById('storyweaver-icon');
    const panelEl = document.getElementById('storyweaver-content-panel');
    if (!iconEl) return;

    if (settings.panelCollapsed) {
        iconEl.classList.remove('openIcon');
        iconEl.classList.add('closedIcon');
        if (panelEl) {
            panelEl.classList.remove('openDrawer');
            panelEl.classList.add('closedDrawer');
        }
    } else {
        iconEl.classList.remove('closedIcon');
        iconEl.classList.add('openIcon');
        if (panelEl) {
            panelEl.classList.remove('closedDrawer');
            panelEl.classList.add('openDrawer');
        }
    }
}

async function openTxtToWorldbookPanel() {
    try {
        await ensureTxtToWorldbookReady();
        const api = getTxtToWorldbookApiSafe();
        if (!api || typeof api.open !== 'function') {
            toastr.error('StoryWeaver converter is not ready yet.');
            return;
        }
        api.open();
    } catch (error) {
        console.error('[StoryWeaver] failed to open TXT converter:', error);
        toastr.error('StoryWeaver converter failed to load.');
    }
}

async function setupUI() {
    const extensionFolder = getExtensionFolderName();

    // Load template using detected folder first, then fallback to the canonical name.
    let html = '';
    try {
        html = await renderExtensionTemplateAsync(`third-party/${extensionFolder}`, 'drawer-component');
    } catch (error) {
        if (extensionFolder !== 'StoryWeaver') {
            html = await renderExtensionTemplateAsync('third-party/StoryWeaver', 'drawer-component');
        } else {
            throw error;
        }
    }

    if (!html || !String(html).trim()) {
        throw new Error('StoryWeaver drawer template is empty.');
    }

    const mounted = await mountDrawerWithRetry(html, 60, 250);
    if (!mounted) {
        // Fallback mount so the icon can still appear even if target selectors change.
        const existingWrapper = document.getElementById('storyweaver-wrapper');
        if (!existingWrapper) {
            document.body.insertAdjacentHTML('beforeend', html);
        }
        console.warn('[StoryWeaver] mount target not found, mounted to body fallback.');
    }

    // Rebind with namespace to avoid duplicated handlers on reload.
    $(document).off(`click${setupEventNamespace}`);
    $(document).on(`click${setupEventNamespace}`, '#storyweaver-wrapper .drawer-toggle', async (e) => {
        e.stopPropagation();
        await openTxtToWorldbookPanel();
    });
}

async function bootstrap() {
    ensureSettings();
    try {
        await setupUI();
    } catch (error) {
        console.error('[StoryWeaver] UI mount failed:', error);
        toastr.error('StoryWeaver UI mount failed. Please reload extensions.');
    }

    try {
        await ensureTxtToWorldbookReady();
        registerDirectorPromptHook();
        window.StoryWeaver = {
            openTxtConverter: openTxtToWorldbookPanel,
            getTxtToWorldbookApi: getTxtToWorldbookApiSafe,
        };
        console.log('[StoryWeaver] Plugin initialized successfully');
    } catch (error) {
        console.error('[StoryWeaver] txtToWorldbook init failed:', error);
        toastr.error('StoryWeaver failed to initialize TXT converter.');
    }
}

jQuery(() => {
    bootstrap();
});
