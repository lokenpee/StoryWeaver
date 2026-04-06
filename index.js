import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { initTxtToWorldbookBridge, getTxtToWorldbookApi } from './txtToWorldbook/main.js';

const extensionName = 'storyweaver';

const defaultSettings = {
    panelCollapsed: true,
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

function updateDrawerUI() {
    const iconEl = document.getElementById('storyweaver-icon');
    const panelEl = document.getElementById('storyweaver-content-panel');
    if (!iconEl || !panelEl) return;

    if (settings.panelCollapsed) {
        iconEl.classList.remove('openIcon');
        iconEl.classList.add('closedIcon');
        panelEl.classList.remove('openDrawer');
        panelEl.classList.add('closedDrawer');
    } else {
        iconEl.classList.remove('closedIcon');
        iconEl.classList.add('openIcon');
        panelEl.classList.remove('closedDrawer');
        panelEl.classList.add('openDrawer');
    }
}

function toggleDrawer() {
    settings.panelCollapsed = !settings.panelCollapsed;
    persistSettings();
    updateDrawerUI();
}

function openTxtToWorldbookPanel() {
    const api = getTxtToWorldbookApi();
    if (!api || typeof api.open !== 'function') {
        toastr.error('StoryWeaver converter is not ready yet.');
        return;
    }
    api.open();
}

async function setupUI() {
    // 加载抽屉组件模板
    const html = await renderExtensionTemplateAsync('third-party/StoryWeaver', 'drawer-component');
    
    // 挂载到顶部功能栏（在 extensions-settings-button 后面）
    const topbarAnchor = $('#extensions-settings-button');
    if (topbarAnchor.length > 0) {
        topbarAnchor.after(html);
    } else {
        // 回退到插件设置面板
        $('#extensions_settings2').append(html);
    }

    // 绑定抽屉开关事件
    $(document).on('click', '#storyweaver-wrapper .drawer-toggle', (e) => {
        e.stopPropagation();
        toggleDrawer();
    });

    // 绑定打开转换器按钮
    $(document).on('click', '#storyweaver-open-converter', () => {
        openTxtToWorldbookPanel();
    });

    // 点击面板外部关闭抽屉
    $(document).on('click', (e) => {
        if (!settings.panelCollapsed) {
            const wrapper = document.getElementById('storyweaver-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                settings.panelCollapsed = true;
                persistSettings();
                updateDrawerUI();
            }
        }
    });

    // 初始化 UI 状态
    updateDrawerUI();
}

async function bootstrap() {
    ensureSettings();
    await setupUI();

    try {
        await initTxtToWorldbookBridge();
        window.StoryWeaver = {
            openTxtConverter: openTxtToWorldbookPanel,
            getTxtToWorldbookApi,
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
