// DatabaseAdapter.js
import applicationFunctionManager from './manager.js';
import { loadWorldInfo, world_info } from '/scripts/world-info.js';
import { getCharaFilename, onlyUnique } from '/scripts/utils.js';

const STORAGE_KEY = 'sbt-db-adapter-enabled';
const SUMMARY_TABLE_NAME = '总结表';
const OUTLINE_TABLE_NAME = '总体大纲';

const safeLocalStorageGet = (key) => {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        return null;
    }
};

const safeLocalStorageSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        // ignore
    }
};

const getRootWindow = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.parent || window;
    } catch (error) {
        return window;
    }
};

const getAutoCardUpdaterApi = () => {
    const root = getRootWindow();
    return root?.AutoCardUpdaterAPI || null;
};

const normalizeCellText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return Number.isNaN(value) ? '' : String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
};

const findTableByName = (data, targetName) => {
    if (!data || typeof data !== 'object') return null;
    const sheetKeys = Object.keys(data).filter((key) => key.startsWith('sheet_'));
    for (const key of sheetKeys) {
        const table = data[key];
        const name = typeof table?.name === 'string' ? table.name.trim() : '';
        if (name === targetName) {
            return table;
        }
    }
    return null;
};

const formatTableBlock = (table, options = {}) => {
    const label = options.label || '表格';
    const limit = Number.isFinite(options.limit) ? Math.max(0, Math.trunc(options.limit)) : null;
    const tail = options.tail === true;
    const emptyMessage = options.emptyMessage || '未找到/无数据';

    if (!table || !Array.isArray(table.content) || table.content.length === 0) {
        return `## 表格: ${label}\n${emptyMessage}`;
    }

    const headerRow = Array.isArray(table.content[0]) ? table.content[0] : [];
    const columnNames = headerRow.slice(1).map((header, idx) => {
        const name = normalizeCellText(header);
        return name || `列${idx + 1}`;
    });

    const dataRows = table.content.slice(1);
    if (dataRows.length === 0) {
        return `## 表格: ${label}\n${emptyMessage}`;
    }

    let rows = dataRows;
    if (limit !== null && limit > 0) {
        rows = tail ? dataRows.slice(-limit) : dataRows.slice(0, limit);
    }

    const rowStartIndex = tail ? (dataRows.length - rows.length) : 0;
    const lines = [`## 表格: ${label}`, `Columns: ${columnNames.join(', ')}`];

    rows.forEach((row, idx) => {
        const rowIndex = rowStartIndex + idx + 1;
        const cells = columnNames.map((colName, colIdx) => {
            const raw = Array.isArray(row) ? row[colIdx + 1] : '';
            const valueText = normalizeCellText(raw);
            return `${colName}: ${valueText || '（空）'}`;
        });
        lines.push(`- [${rowIndex}] ${cells.join(' | ')}`);
    });

    return lines.join('\n');
};

const getCharacterLorebookNames = () => {
    const context = applicationFunctionManager.getContext?.();
    const characters = context?.characters;
    const characterId = context?.characterId;

    if (!characters || characterId === null || characterId === undefined) return [];

    const character = Array.isArray(characters)
        ? characters[characterId]
        : characters[characterId];

    if (!character) return [];

    const bookNames = [];
    const primary = character?.data?.extensions?.world;
    if (primary) bookNames.push(String(primary));

    if (Array.isArray(characters)) {
        const charIndex = characters.indexOf(character);
        if (charIndex >= 0) {
            const fileName = getCharaFilename(charIndex);
            const extraCharLore = world_info?.charLore?.find((entry) => entry?.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                bookNames.push(...extraCharLore.extraBooks);
            }
        }
    }

    return bookNames.filter(onlyUnique).filter(Boolean);
};

export const DatabaseAdapter = {
    STORAGE_KEY,
    SUMMARY_TABLE_NAME,
    OUTLINE_TABLE_NAME,

    isEnabled() {
        return safeLocalStorageGet(STORAGE_KEY) === 'true';
    },

    setEnabled(enabled) {
        safeLocalStorageSet(STORAGE_KEY, enabled ? 'true' : 'false');
    },

    isDatabaseApiAvailable() {
        const api = getAutoCardUpdaterApi();
        return !!(api && typeof api.exportTableAsJson === 'function');
    },

    exportTables() {
        const api = getAutoCardUpdaterApi();
        if (!api || typeof api.exportTableAsJson !== 'function') {
            return null;
        }
        try {
            return api.exportTableAsJson() || null;
        } catch (error) {
            return null;
        }
    },

    buildDatabaseContextText(options = {}) {
        const summaryLimit = Number.isFinite(options.summaryLimit)
            ? Math.max(0, Math.trunc(options.summaryLimit))
            : 10;
        const data = this.exportTables();
        if (!data) {
            return '未找到/无数据（未检测到数据库插件或无表格数据）。';
        }

        const outlineTable = findTableByName(data, OUTLINE_TABLE_NAME);
        const summaryTable = findTableByName(data, SUMMARY_TABLE_NAME);

        const outlineBlock = formatTableBlock(outlineTable, {
            label: OUTLINE_TABLE_NAME,
            emptyMessage: '未找到/无数据'
        });
        const summaryBlock = formatTableBlock(summaryTable, {
            label: `${SUMMARY_TABLE_NAME}（最新${summaryLimit}条）`,
            limit: summaryLimit,
            tail: true,
            emptyMessage: '未找到/无数据'
        });

        return [outlineBlock, summaryBlock].join('\n\n');
    },

    async buildWorldbookContextText() {
        try {
            const bookNames = getCharacterLorebookNames();
            if (!bookNames.length) {
                return '未找到/无数据（当前角色未绑定世界书）。';
            }

            const blocks = [];
            for (const name of bookNames) {
                blocks.push(`## 世界书: ${name}`);
                const bookContent = await loadWorldInfo(name);
                const entriesObj = bookContent?.entries || {};
                const entries = Object.entries(entriesObj).map(([id, rawEntry]) => ({
                    id,
                    comment: rawEntry?.comment || '',
                    content: rawEntry?.content || '',
                    keys: rawEntry?.key || [],
                    enabled: !rawEntry?.disable
                }));

                const enabledEntries = entries.filter((entry) => entry.enabled);
                if (!enabledEntries.length) {
                    blocks.push('未找到/无数据');
                    blocks.push('');
                    continue;
                }

                enabledEntries.forEach((entry) => {
                    const comment = entry.comment ? entry.comment.trim() : '未命名条目';
                    const keys = Array.isArray(entry.keys) && entry.keys.length
                        ? ` | Keys: ${entry.keys.join(', ')}`
                        : '';
                    blocks.push(`- [${entry.id}] ${comment}${keys}`);
                    blocks.push(entry.content ? entry.content.trim() : '（空）');
                    blocks.push('');
                });
            }

            return blocks.join('\n').trim();
        } catch (error) {
            return '未找到/无数据（世界书读取失败）。';
        }
    },

    buildRecentContextText(limit = 6) {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 6;
        const chat = applicationFunctionManager.getContext?.()?.chat || [];
        const recentAiMessages = [];

        for (let i = chat.length - 1; i >= 0 && recentAiMessages.length < safeLimit; i--) {
            const msg = chat[i];
            if (!msg || msg.is_user) continue;
            if (typeof msg.mes === 'string' && msg.mes.trim()) {
                recentAiMessages.unshift(msg.mes.trim());
            }
        }

        if (!recentAiMessages.length) {
            return '未找到/无数据（无可用AI前文）。';
        }

        const lines = ['## 前文上下文（最近AI）'];
        recentAiMessages.forEach((text, idx) => {
            lines.push(`[${idx + 1}] ${text}`);
        });
        return lines.join('\n');
    },

    async buildExternalContexts(options = {}) {
        const externalDatabaseContext = this.buildDatabaseContextText(options);
        const externalWorldbookContext = await this.buildWorldbookContextText();
        const externalRecentContext = this.buildRecentContextText(options.recentLimit || 6);

        return {
            externalDatabaseContext,
            externalWorldbookContext,
            externalRecentContext
        };
    }
};
