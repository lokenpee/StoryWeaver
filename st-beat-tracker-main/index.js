import applicationFunctionManager from './manager.js';
import { StoryBeatEngine } from './StoryBeatEngine.js';
import { LLMApiService } from './LLMApiService.js';
import * as stateManager from './stateManager.js';
import { eventBus } from './src/EventBus.js';
import * as textUtils from './utils/textUtils.js';
import * as jsonUtils from './utils/jsonExtractor.js';
import { updateDashboard } from './ui/renderers.js';
import { getCharacterBoundWorldbookEntries } from './genesis-worldbook/worldbookManager.js';
import { ExecutionContext } from './src/ExecutionContext.js';
import { ENGINE_STATUS } from './src/constants.js';
import { setupUI, initializeUIManager, populateSettingsUI } from './ui/uiManager.js';
import { consoleManager } from './ui/ConsoleManager.js';
import { createLogger } from './utils/logger.js';
import { showNarrativeFocusPopup } from './ui/popups/proposalPopup.js';
import { initializeGenesisSourceUI, onCharacterChanged, onChatChanged } from './genesis-worldbook/genesisSourceBindings.js';

const { eventSource, event_types} = applicationFunctionManager;
const logger = createLogger('剧情节拍器');

applicationFunctionManager.eventSource.on(applicationFunctionManager.event_types.APP_READY, async () => {
    logger.info('正在启动... (SillyTavern应用已就绪)');

    // 初始化前端控制台
    consoleManager.init();

    // 暴露到全局，方便调试
    window.sbtConsoleManager = consoleManager;

    // 创建统一的日志实例供所有模块使用
    const sbtLogger = createLogger('SBT');

    const normalizeToastOptions = (type, options = {}) => {
        if (!options || typeof options !== 'object') {
            options = {};
        }
        // 如果明确传入 timeOut/extendedTimeOut=0，保留不自动关闭
        if (options.timeOut === 0 || options.extendedTimeOut === 0) {
            return options;
        }
        const base = {
            info: { timeOut: 3200, extendedTimeOut: 1200, closeButton: false, progressBar: false, tapToDismiss: true },
            success: { timeOut: 2400, extendedTimeOut: 1000, closeButton: false, progressBar: false, tapToDismiss: true },
            warning: { timeOut: 3800, extendedTimeOut: 1400, closeButton: false, progressBar: false, tapToDismiss: true },
            error: { timeOut: 6500, extendedTimeOut: 2000, closeButton: true, progressBar: false, tapToDismiss: true }
        };
        return { ...base[type], ...options };
    };

    const sbtToastr = {
        info: (message, detail = '', options = {}) => toastr.info(message, detail, normalizeToastOptions('info', options)),
        success: (message, detail = '', options = {}) => toastr.success(message, detail, normalizeToastOptions('success', options)),
        warning: (message, detail = '', options = {}) => toastr.warning(message, detail, normalizeToastOptions('warning', options)),
        error: (message, detail = '', options = {}) => toastr.error(message, detail, normalizeToastOptions('error', options)),
        clear: (toast) => {
            if (toastr && typeof toastr.clear === 'function' && toast) {
                toastr.clear(toast);
            }
        }
    };

    // 暴露给其他模块（例如 engine-adapter）
    window.sbtToastr = sbtToastr;

    const applicationDependencies = {
        applicationFunctionManager,
        LLMApiService,
        toastr: sbtToastr,
        ...stateManager,
        ...textUtils,
        ...jsonUtils,
        updateDashboard,
        getCharacterBoundWorldbookEntries,
        showNarrativeFocusPopup,
        // 统一日志接口 - 使用新的 Logger 类
        log: sbtLogger.debug.bind(sbtLogger),    // 调试日志
        info: sbtLogger.info.bind(sbtLogger),     // 重要信息
        warn: sbtLogger.warn.bind(sbtLogger),     // 警告
        error: sbtLogger.error.bind(sbtLogger),   // 错误
        // 【诊断日志】始终输出，用于错误追踪
        diagnose: (message, ...args) => sbtLogger.error(`[DIAGNOSE] ${message}`, ...args),
        eventBus: eventBus
    };

    stateManager.loadApiSettings();
    stateManager.loadNarrativeModeSettings(); // V7.0: 加载叙事模式全局配置

    // 1. 创建引擎实例
    const engine = new StoryBeatEngine(applicationDependencies);
    await engine.start();
    setTimeout(() => {
        populateSettingsUI(applicationDependencies);
        // V8.0: 初始化创世纪资料源UI
        initializeGenesisSourceUI();
    }, 0);
    window.storyBeatEngine = engine;

    const { eventSource, event_types } = applicationFunctionManager;

    // 2.将引擎的方法绑定到SillyTavern的事件上
    // 使用 .bind(engine) 来确保 onPromptReady 方法内部的 'this' 永远指向 engine 实例
    // onPromptReady is bound inside StoryBeatEngine.start()

    // V8.0: 监听角色和聊天切换事件，更新创世纪资料源
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onCharacterChanged);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    logger.info('引擎启动完成');
});
