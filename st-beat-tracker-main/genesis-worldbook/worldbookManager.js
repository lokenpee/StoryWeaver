
import { loadWorldInfo } from '/scripts/world-info.js';
import { sbtConsole } from '../utils/sbtConsole.js';

let warn = (message, ...args) => sbtConsole.warn(`[SBT-WARN] ${message}`, ...args);
let info = (message, ...args) => sbtConsole.info(`[SBT-INFO] ${message}`, ...args);
let diagnose = (message, ...args) => sbtConsole.error(`[SBT-DIAGNOSE] ${message}`, ...args);

async function safeCharLorebooks(context) {
    diagnose("[Compat Layer] Executing safeCharLorebooks...");
    try {
        if (!context || !context.characterId || !context.characters) {
            warn("[Compat Layer] safeCharLorebooks: 上下文无效，无法获取角色数据。");
            return { primary: null, additional: [] };
        }
        const currentCharacter = context.characters[context.characterId];
        const primaryBook = currentCharacter?.data?.extensions?.world || null;
        diagnose(`[Compat Layer] safeCharLorebooks: Found primary book -> ${primaryBook}`);
        return { primary: primaryBook, additional: [] };
    } catch (error) {
        diagnose("[Compat Layer] safeCharLorebooks failed:", error);
        return { primary: null, additional: [] };
    }
}

async function safeLorebookEntries(lorebookName) {
    diagnose(`[Compat Layer] Executing safeLorebookEntries for "${lorebookName}"...`);
    try {
        const bookContent = await loadWorldInfo(lorebookName);

        if (!bookContent || !bookContent.entries) {
            warn(`[Compat Layer] safeLorebookEntries: No content or entries found for "${lorebookName}".`);
            return [];
        }

        const standardizedEntries = Object.entries(bookContent.entries).map(([id, rawEntry]) => {
            return {
                id: id,
                key: rawEntry.key || [],
                content: rawEntry.content || '',
                // 【关键修复】将 raw.disable 改为 rawEntry.disable
                enabled: !rawEntry.disable,
                comment: rawEntry.comment || '',
                constant: rawEntry.constant || false,
                position: rawEntry.position || '4'
            };
        });

        diagnose(`[Compat Layer] safeLorebookEntries: Successfully loaded and standardized ${standardizedEntries.length} entries from "${lorebookName}".`);
        return standardizedEntries;
    } catch (error) {
        diagnose(`[Compat Layer] safeLorebookEntries for "${lorebookName}" failed:`, error);
        return [];
    }
}

/**
 * @description 【主导出函数】获取角色绑定的所有已启用的世界书条目。
 * @param {object} context - SillyTavern 的上下文对象。
 * @returns {Promise<object[]>}
 */
export async function getCharacterBoundWorldbookEntries(context) {
    diagnose("[Main Process] Executing getCharacterBoundWorldbookEntries...");
    
    const charLorebooks = await safeCharLorebooks(context);
    
    const bookNames = [];
    if (charLorebooks.primary) {
        bookNames.push(charLorebooks.primary);
    }
    if (charLorebooks.additional?.length) {
        bookNames.push(...charLorebooks.additional);
    }

    if (bookNames.length === 0) {
        info("[Main Process] No character-bound worldbooks found.");
        return [];
    }
    diagnose(`[Main Process] Identified ${bookNames.length} worldbook(s) to load:`, bookNames);

    let allEntries = [];
    for (const name of bookNames) {
        const entries = await safeLorebookEntries(name);
        allEntries = allEntries.concat(entries);
    }

    const enabledEntries = allEntries.filter(entry => entry.enabled);
    
    info(`[Main Process] Process complete. Total enabled entries found: ${enabledEntries.length}`);
    return enabledEntries;
}

/**
 * @description 【V8.0新增】使用创世纪资料源管理器获取世界书条目
 * 根据用户的选择模式（自动/手动）返回相应的世界书条目
 * @returns {Promise<object[]>}
 */
export async function getWorldbookEntriesForGenesis() {
    try {
        // 动态导入，避免循环依赖
        const { getGenesisWorldBookEntries } = await import('./genesisSourceManager.js');
        const entries = await getGenesisWorldBookEntries();
        info(`[Genesis Source] 为创世纪获取了 ${entries.length} 个世界书条目`);
        return entries;
    } catch (error) {
        warn('[Genesis Source] 获取世界书条目失败，回退到传统方法:', error);
        // 回退到传统方法
        const { USER } = await import('../src/engine-adapter.js');
        const context = USER.getContext();
        return await getCharacterBoundWorldbookEntries(context);
    }
}
