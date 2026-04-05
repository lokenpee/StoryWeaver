/**
 * 创世纪资料源管理器 - V8.0
 * 管理创世纪时AI读取的世界书资料来源
 * 支持自动读取（角色绑定）和手动精选两种模式
 */

import { loadWorldInfo } from '/scripts/world-info.js';
import { USER } from '../src/engine-adapter.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenesisSource');
const EXTENSION_NAME = 'st-beat-tracker';

// 创世纪资料源配置
let genesisSourceConfig = {
    mode: 'auto', // 'auto' 自动读取 | 'manual' 手动精选
    manualBooks: [], // 手动精选的世界书名称列表
    manualEntries: {}, // { bookName: [entryId1, entryId2, ...] }
};

/**
 * 从角色设置中加载配置
 */
export function loadGenesisSourceConfig() {
    try {
        const context = USER.getContext();
        const characterId = context?.characterId;

        if (characterId && context.characters && context.characters[characterId]) {
            const charData = context.characters[characterId].data;
            if (charData?.extensions?.[EXTENSION_NAME]?.genesisSource) {
                const saved = charData.extensions[EXTENSION_NAME].genesisSource;
                genesisSourceConfig = { ...genesisSourceConfig, ...saved };
                logger.info('已加载角色专属创世纪资料源配置');
            }
        } else {
            // 从extension_settings加载全局配置
            if (context?.extensionSettings?.[EXTENSION_NAME]?.genesisSource) {
                const saved = context.extensionSettings[EXTENSION_NAME].genesisSource;
                genesisSourceConfig = { ...genesisSourceConfig, ...saved };
                logger.info('已加载全局创世纪资料源配置');
            }
        }
    } catch (e) {
        logger.error('加载创世纪资料源配置失败', e);
    }
}

/**
 * 保存配置到角色设置
 */
export async function saveGenesisSourceConfig() {
    try {
        const context = USER.getContext();
        const characterId = context?.characterId;

        if (characterId && context.characters && context.characters[characterId]) {
            // 保存到角色卡
            const charData = context.characters[characterId].data;
            if (!charData.extensions) charData.extensions = {};
            if (!charData.extensions[EXTENSION_NAME]) charData.extensions[EXTENSION_NAME] = {};
            charData.extensions[EXTENSION_NAME].genesisSource = { ...genesisSourceConfig };

            // 调用SillyTavern的保存函数
            if (typeof context.saveCharacterDebounced === 'function') {
                context.saveCharacterDebounced();
            }
            logger.info('创世纪资料源配置已保存到角色卡');
        } else {
            // 保存到extension_settings（全局）
            if (!context.extensionSettings[EXTENSION_NAME]) {
                context.extensionSettings[EXTENSION_NAME] = {};
            }
            context.extensionSettings[EXTENSION_NAME].genesisSource = { ...genesisSourceConfig };

            if (context.saveSettingsDebounced) {
                context.saveSettingsDebounced();
            }
            logger.info('创世纪资料源配置已保存到全局设置');
        }
    } catch (e) {
        logger.error('保存创世纪资料源配置失败', e);
    }
}

/**
 * 获取当前配置
 */
export function getGenesisSourceConfig() {
    return { ...genesisSourceConfig };
}

/**
 * 更新配置
 */
export function updateGenesisSourceConfig(updates) {
    genesisSourceConfig = { ...genesisSourceConfig, ...updates };
}

/**
 * 获取所有可用的世界书列表
 */
export async function fetchAvailableWorldBooks() {
    try {
        // 动态导入 world_names，避免在模块加载时出错
        const worldInfoModule = await import('/scripts/world-info.js');
        const worldNames = worldInfoModule.world_names;

        if (!worldNames || !Array.isArray(worldNames)) {
            logger.warn('world_names 不可用或不是数组');
            return [];
        }

        // world_names 可能包含重复项，需要去重
        const uniqueBooks = [...new Set(worldNames)].filter(name => name && name.trim());
        logger.info(`找到 ${uniqueBooks.length} 个世界书`);
        return uniqueBooks;
    } catch (e) {
        logger.error('获取世界书列表失败', e);
        return [];
    }
}

/**
 * 获取指定世界书的所有条目
 */
export async function fetchBookEntries(bookName) {
    try {
        const bookContent = await loadWorldInfo(bookName);

        if (!bookContent || !bookContent.entries) {
            logger.warn(`世界书 "${bookName}" 没有条目`);
            return [];
        }

        const entries = Object.entries(bookContent.entries).map(([uid, rawEntry]) => ({
            uid: uid,
            key: rawEntry.key || [],
            content: rawEntry.content || '',
            enabled: !rawEntry.disable,
            comment: rawEntry.comment || '无标题条目',
            constant: rawEntry.constant || false,
        }));

        logger.info(`从 "${bookName}" 加载了 ${entries.length} 个条目`);
        return entries;
    } catch (e) {
        logger.error(`加载世界书 "${bookName}" 的条目失败`, e);
        return [];
    }
}

/**
 * 获取角色绑定的世界书列表
 */
export async function fetchCharacterBoundBooks() {
    try {
        const context = USER.getContext();
        const characterId = context?.characterId;

        if (!characterId || !context.characters || !context.characters[characterId]) {
            logger.warn('无法获取当前角色信息');
            return [];
        }

        const character = context.characters[characterId];
        const bookNames = [];

        // 获取主世界书
        const primaryBook = character.data?.extensions?.world;
        if (primaryBook) {
            bookNames.push(primaryBook);
        }

        // 获取额外世界书（如果有的话）
        const additionalBooks = character.data?.extensions?.additionalWorldBooks || [];
        bookNames.push(...additionalBooks);

        logger.info(`角色绑定了 ${bookNames.length} 个世界书:`, bookNames);
        return bookNames;
    } catch (e) {
        logger.error('获取角色绑定世界书失败', e);
        return [];
    }
}

/**
 * 根据当前配置获取应该使用的世界书条目
 * 这是给 Genesis 使用的主函数
 */
export async function getGenesisWorldBookEntries() {
    try {
        let bookNames = [];

        if (genesisSourceConfig.mode === 'manual') {
            // 手动精选模式：使用用户选择的世界书
            bookNames = genesisSourceConfig.manualBooks || [];
            logger.info('使用手动精选的世界书:', bookNames);
        } else {
            // 自动模式：使用角色绑定的世界书
            bookNames = await fetchCharacterBoundBooks();
            logger.info('使用角色绑定的世界书:', bookNames);
        }

        if (bookNames.length === 0) {
            logger.info('没有选择任何世界书');
            return [];
        }

        // 加载所有世界书的条目
        const allEntries = [];
        for (const bookName of bookNames) {
            const entries = await fetchBookEntries(bookName);
            entries.forEach(entry => {
                allEntries.push({ ...entry, bookName });
            });
        }

        // 如果是手动模式，只返回用户选中的条目
        if (genesisSourceConfig.mode === 'manual') {
            const manualEntriesMap = genesisSourceConfig.manualEntries || {};
            const filtered = allEntries.filter(entry => {
                if (!entry.enabled) return false; // 只包含启用的条目
                const bookConfig = manualEntriesMap[entry.bookName];
                return bookConfig && (bookConfig.includes(entry.uid) || bookConfig.includes(String(entry.uid)));
            });
            logger.info(`手动精选模式：筛选后剩余 ${filtered.length} / ${allEntries.length} 个条目`);
            return filtered;
        } else {
            // 自动模式：返回所有启用的条目
            const enabled = allEntries.filter(entry => entry.enabled);
            logger.info(`自动模式：返回 ${enabled.length} / ${allEntries.length} 个已启用条目`);
            return enabled;
        }
    } catch (e) {
        logger.error('获取创世纪世界书条目失败', e);
        return [];
    }
}

/**
 * 切换资料源模式
 */
export function setGenesisSourceMode(mode) {
    if (mode !== 'auto' && mode !== 'manual') {
        logger.error('无效的资料源模式:', mode);
        return;
    }
    genesisSourceConfig.mode = mode;
    logger.info('资料源模式已切换为:', mode);
}

/**
 * 添加世界书到精选列表
 */
export function addBookToManualList(bookName) {
    if (!genesisSourceConfig.manualBooks.includes(bookName)) {
        genesisSourceConfig.manualBooks.push(bookName);
        logger.info('已添加世界书到精选列表:', bookName);
    }
}

/**
 * 从精选列表移除世界书
 */
export function removeBookFromManualList(bookName) {
    const index = genesisSourceConfig.manualBooks.indexOf(bookName);
    if (index > -1) {
        genesisSourceConfig.manualBooks.splice(index, 1);
        // 同时清除该世界书的条目选择
        delete genesisSourceConfig.manualEntries[bookName];
        logger.info('已从精选列表移除世界书:', bookName);
    }
}

/**
 * 切换条目的选中状态
 */
export function toggleEntryInManualList(bookName, entryUid, isSelected) {
    if (!genesisSourceConfig.manualEntries[bookName]) {
        genesisSourceConfig.manualEntries[bookName] = [];
    }

    const uidStr = String(entryUid);
    const entries = genesisSourceConfig.manualEntries[bookName];
    const index = entries.indexOf(uidStr);

    if (isSelected && index === -1) {
        entries.push(uidStr);
        logger.debug(`已选中条目: ${bookName} -> ${uidStr}`);
    } else if (!isSelected && index > -1) {
        entries.splice(index, 1);
        logger.debug(`已取消选中条目: ${bookName} -> ${uidStr}`);
    }

    // 如果该世界书没有选中的条目了，删除这个key
    if (entries.length === 0) {
        delete genesisSourceConfig.manualEntries[bookName];
    }
}

/**
 * 检查条目是否被选中
 */
export function isEntryInManualList(bookName, entryUid) {
    const entries = genesisSourceConfig.manualEntries[bookName];
    if (!entries) return false;
    const uidStr = String(entryUid);
    return entries.includes(uidStr) || entries.includes(entryUid);
}

/**
 * 全选某个世界书的所有条目
 */
export async function selectAllEntriesInBook(bookName) {
    const entries = await fetchBookEntries(bookName);
    const enabledEntries = entries.filter(e => e.enabled);
    genesisSourceConfig.manualEntries[bookName] = enabledEntries.map(e => String(e.uid));
    logger.info(`已全选世界书 "${bookName}" 的 ${enabledEntries.length} 个条目`);
}

/**
 * 取消选择某个世界书的所有条目
 */
export function deselectAllEntriesInBook(bookName) {
    delete genesisSourceConfig.manualEntries[bookName];
    logger.info(`已取消选择世界书 "${bookName}" 的所有条目`);
}
