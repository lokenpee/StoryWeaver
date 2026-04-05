import { USER } from './src/engine-adapter.js';
import { createLogger } from './utils/logger.js';
import { getDefaultDossierSchema, normalizeDossierSchema } from './utils/dossierSchema.js';

const logger = createLogger('StateManager');
const EXTENSION_NAME = 'st-beat-tracker';
const API_SETTINGS_KEY = 'sbt-api-settings-v2'; // 本地备份（如果 extension_settings 不可用）

let apiSettings = {
    main: { apiUrl: '', apiKey: '', modelName: 'gemini-pro' },
    conductor: { apiUrl: '', apiKey: '', modelName: 'gemini-1.5-flash' }
};

// V7.0: 叙事模式现在保存在角色卡中，这里只是备用默认值
let narrativeModeSettings = {
    default_mode: 'classic_rpg' // 默认为正剧模式
};

const getCurrentCharacterRef = () => {
    const context = USER.getContext();
    if (!context || !Array.isArray(context.characters)) {
        return { id: null, character: null };
    }
    const currentCharId = context.characterId;
    if (currentCharId === undefined || currentCharId === null) {
        return { id: null, character: null };
    }
    const character = context.characters[currentCharId] || null;
    return { id: currentCharId, character };
};


/**
 * 保存 API 设置到 SillyTavern 的 extension_settings（用户云端存储）
 * @param {Object} settings - API 设置对象
 */
export function saveApiSettings(settings) {
    try {
        const context = USER.getContext();

        // 优先保存到 extension_settings（SillyTavern 云端）
        if (context && context.extensionSettings) {
            if (!context.extensionSettings[EXTENSION_NAME]) {
                context.extensionSettings[EXTENSION_NAME] = {};
            }
            context.extensionSettings[EXTENSION_NAME].apiSettings = settings;

            // 调用 SillyTavern 的保存函数
            if (context.saveSettingsDebounced) {
                context.saveSettingsDebounced();
            }
            logger.info("API设置已保存到 extension_settings（用户云端）");
        } else {
            // 降级：保存到 localStorage
            logger.warn("extension_settings 不可用，降级使用 localStorage");
            localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
        }

        apiSettings = settings;
    } catch (e) {
        logger.error("保存API设置失败！", e);
        // 尝试降级保存
        try {
            localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
        } catch (fallbackError) {
            logger.error("localStorage 降级保存也失败！", fallbackError);
        }
    }
}

/**
 * 从 SillyTavern 的 extension_settings 加载 API 设置
 */
export function loadApiSettings() {
    try {
        const context = USER.getContext();
        let loaded = false;

        // 优先从 extension_settings 加载
        if (context && context.extensionSettings && context.extensionSettings[EXTENSION_NAME]?.apiSettings) {
            const parsed = context.extensionSettings[EXTENSION_NAME].apiSettings;
            apiSettings.main = { ...apiSettings.main, ...parsed.main };
            apiSettings.conductor = { ...apiSettings.conductor, ...parsed.conductor };
            logger.info("已从 extension_settings 加载API设置（用户云端）");
            loaded = true;
        }

        // 降级：从 localStorage 加载
        if (!loaded) {
            const storedSettings = localStorage.getItem(API_SETTINGS_KEY);
            if (storedSettings) {
                const parsed = JSON.parse(storedSettings);
                apiSettings.main = { ...apiSettings.main, ...parsed.main };
                apiSettings.conductor = { ...apiSettings.conductor, ...parsed.conductor };
                logger.info("已从 localStorage 加载API设置（降级）");
            }
        }
    } catch (e) {
        logger.error("加载API设置失败！", e);
    }
}

export const getApiSettings = () => apiSettings;

/**
 * 保存叙事模式到当前角色卡（角色专属设置）
 * @param {Object} settings - 叙事模式设置
 * @returns {Promise<boolean>} 是否保存成功
 */
export async function saveNarrativeModeToCharacter(settings) {
    try {
        const context = USER.getContext();

        // 获取当前角色
        if (!context.characters || !Array.isArray(context.characters)) {
            logger.warn("无法获取角色列表");
            return false;
        }

        const currentCharId = context.characterId;
        if (currentCharId === undefined || currentCharId === null) {
            logger.warn("没有选中的角色");
            return false;
        }

        const character = context.characters[currentCharId];
        if (!character) {
            logger.warn("无法获取当前角色数据");
            return false;
        }

        // 初始化扩展数据结构
        if (!character.data) character.data = {};
        if (!character.data.extensions) character.data.extensions = {};
        if (!character.data.extensions[EXTENSION_NAME]) {
            character.data.extensions[EXTENSION_NAME] = {};
        }

        // 保存叙事模式
        character.data.extensions[EXTENSION_NAME].narrativeMode = settings;

        // 调用 SillyTavern API 合并到角色文件
        const response = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...context.getRequestHeaders?.() || {}
            },
            body: JSON.stringify({
                avatar: character.avatar,
                data: {
                    extensions: {
                        [EXTENSION_NAME]: character.data.extensions[EXTENSION_NAME]
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logger.info("叙事模式已保存到角色卡:", character.name, settings.default_mode);
        return true;
    } catch (e) {
        logger.error("保存叙事模式到角色卡失败！", e);
        return false;
    }
}

/**
 * 从当前角色卡加载叙事模式
 * @returns {Object} 叙事模式设置，如果未找到则返回默认值
 */
export function loadNarrativeModeFromCharacter() {
    try {
        const context = USER.getContext();

        if (!context.characters || !Array.isArray(context.characters)) {
            logger.warn("无法获取角色列表，使用默认叙事模式");
            return { ...narrativeModeSettings };
        }

        const currentCharId = context.characterId;
        if (currentCharId === undefined || currentCharId === null) {
            logger.warn("没有选中的角色，使用默认叙事模式");
            return { ...narrativeModeSettings };
        }

        const character = context.characters[currentCharId];
        if (!character) {
            logger.warn("无法获取当前角色数据，使用默认叙事模式");
            return { ...narrativeModeSettings };
        }

        // 从角色卡读取叙事模式
        const savedMode = character.data?.extensions?.[EXTENSION_NAME]?.narrativeMode;
        if (savedMode) {
            logger.info("已从角色卡加载叙事模式:", character.name, savedMode.default_mode);
            return savedMode;
        } else {
            logger.info("角色卡未设置叙事模式，使用默认值:", character.name);
            return { ...narrativeModeSettings };
        }
    } catch (e) {
        logger.error("从角色卡加载叙事模式失败！", e);
        return { ...narrativeModeSettings };
    }
}

/**
 * 加载叙事模式设置（初始化时调用）
 * 实际上从角色卡读取，这里提供一个初始化接口
 */
export function loadNarrativeModeSettings() {
    const settings = loadNarrativeModeFromCharacter();
    narrativeModeSettings = settings;
    logger.info("叙事模式设置已初始化:", settings.default_mode);
    return settings;
}

/**
 * 兼容旧版：获取叙事模式设置（现在从角色卡读取）
 */
export const getNarrativeModeSettings = () => {
    return loadNarrativeModeFromCharacter();
};

/**
 * 从当前角色卡加载角色档案字段方案
 * @returns {object} DossierSchema
 */
export function loadDossierSchemaFromCharacter() {
    try {
        const { character } = getCurrentCharacterRef();
        const schema = character?.data?.extensions?.[EXTENSION_NAME]?.dossier_schema;
        if (schema) {
            return normalizeDossierSchema(schema);
        }
    } catch (e) {
        logger.error("加载角色档案字段方案失败", e);
    }
    return getDefaultDossierSchema();
}

/**
 * 保存角色档案字段方案到当前角色卡
 * @param {object} schema - DossierSchema
 * @returns {Promise<boolean>}
 */
export async function saveDossierSchemaToCharacter(schema) {
    try {
        const { character } = getCurrentCharacterRef();
        if (!character) {
            logger.warn("无法获取当前角色卡，保存字段方案失败");
            return false;
        }

        if (!character.data) character.data = {};
        if (!character.data.extensions) character.data.extensions = {};
        if (!character.data.extensions[EXTENSION_NAME]) {
            character.data.extensions[EXTENSION_NAME] = {};
        }
        character.data.extensions[EXTENSION_NAME].dossier_schema = normalizeDossierSchema(schema);

        const context = USER.getContext();
        const response = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...context.getRequestHeaders?.() || {}
            },
            body: JSON.stringify({
                avatar: character.avatar,
                data: {
                    extensions: {
                        [EXTENSION_NAME]: character.data.extensions[EXTENSION_NAME]
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logger.info("角色档案字段方案已保存到角色卡", character.name);
        return true;
    } catch (e) {
        logger.error("保存角色档案字段方案失败", e);
        return false;
    }
}
