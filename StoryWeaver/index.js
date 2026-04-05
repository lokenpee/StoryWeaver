import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { initTxtToWorldbookBridge, getTxtToWorldbookApi } from './txtToWorldbook/main.js';

const extensionName = 'storyweaver';
const panelId = 'storyweaver-panel';
const contentId = 'storyweaver-content';

const defaultSettings = {
    panelCollapsed: false,
};

let settings = {};

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

function updateCollapseUI() {
    const contentEl = document.getElementById(contentId);
    const iconEl = document.getElementById('storyweaver-collapse-icon');
    if (!contentEl || !iconEl) return;

    contentEl.style.display = settings.panelCollapsed ? 'none' : 'block';
    iconEl.textContent = settings.panelCollapsed ? '▶' : '▼';
}

function openTxtToWorldbookPanel() {
    const api = getTxtToWorldbookApi();
    if (!api || typeof api.open !== 'function') {
        toastr.error('StoryWeaver converter is not ready yet.');
        return;
    }
    api.open();
}

function mountUI() {
    if (document.getElementById(panelId)) return;

    const html = `
<div id="${panelId}" class="inline-drawer storyweaver-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>StoryWeaver</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down" id="storyweaver-collapse-icon">▼</div>
    </div>
    <div id="${contentId}" class="inline-drawer-content">
        <div class="storyweaver-summary">
            <p>Import TXT and export worldbook/character card.</p>
        </div>
        <div class="storyweaver-actions">
            <button id="storyweaver-open-ttw" class="menu_button storyweaver-primary-btn">Open TXT Converter</button>
        </div>
    </div>
</div>`;

    $('#extensions_settings2').append(html);

    $(document).on('click', '#storyweaver-open-ttw', openTxtToWorldbookPanel);
    $(document).on('click', `#${panelId} .inline-drawer-toggle`, () => {
        settings.panelCollapsed = !settings.panelCollapsed;
        persistSettings();
        updateCollapseUI();
    });

    updateCollapseUI();
}

async function bootstrap() {
    ensureSettings();
    mountUI();

    try {
        await initTxtToWorldbookBridge();
        window.StoryWeaver = {
            openTxtConverter: openTxtToWorldbookPanel,
            getTxtToWorldbookApi,
        };
    } catch (error) {
        console.error('[StoryWeaver] txtToWorldbook init failed:', error);
        toastr.error('StoryWeaver failed to initialize TXT converter.');
    }
}

jQuery(() => {
    bootstrap();
});
