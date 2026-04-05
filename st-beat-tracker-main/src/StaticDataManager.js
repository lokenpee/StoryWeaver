// FILE: src/StaticDataManager.js
import { sbtConsole } from '../utils/sbtConsole.js';

const STATIC_DATABASE_KEY = 'sbt-static-character-database';
const STATIC_BASELINE_KEY = 'sbt-static-character-baseline';

/**
 * 白名单：staticMatrices 允许的字段
 * 任何不在此列表中的字段都会被过滤
 */
const ALLOWED_STATIC_FIELDS = [
    'characters',
    'worldview',
    'storylines',
    'relationship_graph',
    'longTermStorySummary',      // meta.longTermStorySummary 的兼容保存
    'narrative_control_tower'     // meta.narrative_control_tower 的兼容保存
];

/**
 * 清理单个静态数据对象，移除不允许的字段
 * @param {object} staticData - 待清理的数据
 * @returns {object} - 清理后的数据
 */
function sanitizeStaticData(staticData) {
    if (!staticData || typeof staticData !== 'object') {
        return {};
    }

    const cleaned = {};

    // 只保留白名单中的字段
    for (const field of ALLOWED_STATIC_FIELDS) {
        if (staticData.hasOwnProperty(field)) {
            cleaned[field] = staticData[field];
        }
    }

    // 确保必需的结构存在
    if (!cleaned.characters) cleaned.characters = {};
    if (!cleaned.worldview) cleaned.worldview = {};
    if (!cleaned.storylines) cleaned.storylines = {};
    if (!cleaned.relationship_graph) cleaned.relationship_graph = { edges: [] };

    return cleaned;
}

/**
 * 加载一个角色的静态数据。
 * @param {string|number} characterId - 要加载数据的角色ID。
 * @returns {object|null} - 如果找到，返回 staticMatrices 对象；否则返回 null。
 */
export function loadStaticData(characterId) {
    if (characterId === undefined || characterId === null || characterId === '') return null;
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        return db[characterId] || null;
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to load static data for ${characterId}`, e);
        return null;
    }
}

/**
 * Load baseline static data for a character (immutable snapshot).
 * @param {string|number} characterId
 * @returns {object|null}
 */
export function loadStaticBaseline(characterId) {
    if (characterId === undefined || characterId === null || characterId === '') return null;
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_BASELINE_KEY) || '{}');
        return db[characterId] || null;
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to load baseline for ${characterId}`, e);
        return null;
    }
}


/**
 * 保存一个角色的静态数据。
 * @param {string|number} characterId - 要保存数据的角色ID。
 * @param {object} staticData - 要保存的 staticMatrices 对象。
 */
export function saveStaticData(characterId, staticData) {
    if (characterId === undefined || characterId === null || characterId === '' || !staticData) return;
    'use strict';
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');

        // 🔧 修复：使用白名单过滤，防止污染字段被保存
        const cleanedData = sanitizeStaticData(staticData);

        // 检测是否过滤了字段（用于诊断）
        const originalKeys = Object.keys(staticData);
        const cleanedKeys = Object.keys(cleanedData);
        const removedKeys = originalKeys.filter(key => !cleanedKeys.includes(key));

        if (removedKeys.length > 0) {
            sbtConsole.warn(`[StaticDataManager] 已过滤不允许的字段: ${removedKeys.join(', ')}`);
        }

        db[characterId] = cleanedData;
        localStorage.setItem(STATIC_DATABASE_KEY, JSON.stringify(db));
        sbtConsole.log(`[StaticDataManager] Static data for character ${characterId} has been saved.`);
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to save static data for ${characterId}`, e);
    }
}

/**
 * Save baseline static data for a character (does not overwrite by default).
 * @param {string|number} characterId
 * @param {object} staticData
 * @param {object} [options]
 * @param {boolean} [options.overwrite=false]
 * @returns {boolean}
 */
export function saveStaticBaseline(characterId, staticData, options = {}) {
    const { overwrite = false } = options;
    if (characterId === undefined || characterId === null || characterId === '' || !staticData) return false;
    'use strict';
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_BASELINE_KEY) || '{}');
        if (!overwrite && db[characterId]) {
            sbtConsole.log(`[StaticDataManager] Baseline exists for ${characterId}; skip save.`);
            return false;
        }

        const cleanedData = sanitizeStaticData(staticData);
        db[characterId] = cleanedData;
        localStorage.setItem(STATIC_BASELINE_KEY, JSON.stringify(db));
        sbtConsole.log(`[StaticDataManager] Baseline for character ${characterId} has been saved.`);
        return true;
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to save baseline for ${characterId}`, e);
        return false;
    }
}

/**
 * Ensure baseline exists; do not overwrite.
 * @param {string|number} characterId
 * @param {object} staticData
 * @returns {boolean}
 */
export function ensureStaticBaseline(characterId, staticData) {
    return saveStaticBaseline(characterId, staticData, { overwrite: false });
}

function hasMeaningfulStaticCache(staticData) {
    if (!staticData || typeof staticData !== 'object') return false;
    const charactersCount = Object.keys(staticData.characters || {}).length;
    return charactersCount > 0;
}

function resolveProtagonistName(staticData) {
    const chars = staticData?.characters || {};
    for (const [id, data] of Object.entries(chars)) {
        if (data?.core?.isProtagonist || data?.isProtagonist) {
            return data?.core?.name || data?.name || id;
        }
    }
    return null;
}

/**
 * Auto-migrate baseline from cached static data when missing.
 * @param {string|number} characterId
 * @param {object} [options]
 * @param {string} [options.expectedName]
 * @returns {{migrated:boolean, reason:string, protagonistName:string|null}}
 */
export function autoMigrateBaselineIfMissing(characterId, options = {}) {
    const expectedName = options?.expectedName || '';
    if (characterId === undefined || characterId === null || characterId === '') {
        return { migrated: false, reason: 'invalid_character', protagonistName: null };
    }

    const baseline = loadStaticBaseline(characterId);
    const baselineCount = Object.keys(baseline?.characters || {}).length;
    if (baseline && baselineCount > 0) {
        return { migrated: false, reason: 'baseline_exists', protagonistName: resolveProtagonistName(baseline) };
    }

    const cached = loadStaticData(characterId);
    if (!hasMeaningfulStaticCache(cached)) {
        return { migrated: false, reason: 'cached_empty', protagonistName: null };
    }

    const protagonistName = resolveProtagonistName(cached);
    if (expectedName && protagonistName && protagonistName !== expectedName) {
        return { migrated: false, reason: 'name_mismatch', protagonistName };
    }

    const shouldOverwrite = !!baseline && baselineCount === 0;
    const migrated = saveStaticBaseline(characterId, cached, { overwrite: shouldOverwrite });
    return { migrated, reason: migrated ? 'migrated' : 'baseline_exists', protagonistName };
}

/**
 * Auto-backfill static database from baseline when missing.
 * @param {string|number} characterId
 * @param {object} [options]
 * @param {string} [options.expectedName]
 * @returns {{backfilled:boolean, reason:string, protagonistName:string|null}}
 */
export function autoBackfillStaticDataFromBaselineIfMissing(characterId, options = {}) {
    const expectedName = options?.expectedName || '';
    if (characterId === undefined || characterId === null || characterId === '') {
        return { backfilled: false, reason: 'invalid_character', protagonistName: null };
    }

    const cached = loadStaticData(characterId);
    if (hasMeaningfulStaticCache(cached)) {
        return { backfilled: false, reason: 'static_exists', protagonistName: resolveProtagonistName(cached) };
    }

    const baseline = loadStaticBaseline(characterId);
    if (!hasMeaningfulStaticCache(baseline)) {
        return { backfilled: false, reason: 'baseline_empty', protagonistName: null };
    }

    const protagonistName = resolveProtagonistName(baseline);
    if (expectedName && protagonistName && protagonistName !== expectedName) {
        return { backfilled: false, reason: 'name_mismatch', protagonistName };
    }

    saveStaticData(characterId, baseline);
    return { backfilled: true, reason: 'backfilled', protagonistName };
}


/**
 * 导出指定角色的静态数据
 * @param {string|number} characterId - 角色ID
 * @returns {object|null} 静态数据对象
 */
export function exportStaticData(characterId) {
    return loadStaticData(characterId);
}

/**
 * 导入指定角色的静态数据
 * @param {string|number} characterId - 角色ID
 * @param {object} staticData - 静态数据对象
 * @param {object} [options]
 * @param {boolean} [options.replace=true] - 是否覆盖保存
 * @returns {boolean} 是否导入成功
 */
export function importStaticData(characterId, staticData, options = {}) {
    const { replace = true } = options;
    if (characterId === undefined || characterId === null || characterId === '' || !staticData) return false;
    if (replace) {
        saveStaticData(characterId, staticData);
        return true;
    }
    // 默认行为仍是覆盖，避免误合并污染
    saveStaticData(characterId, staticData);
    return true;
}

/**
 * 获取所有已缓存的角色ID列表。
 * @returns {string[]} - 角色ID数组。
 */
export function getAllCharacterIds() {
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        return Object.keys(db);
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to get character IDs`, e);
        return [];
    }
}

/**
 * 删除指定角色的静态数据。
 * @param {string|number} characterId - 要删除数据的角色ID。
 * @returns {boolean} - 删除是否成功。
 */
export function deleteStaticData(characterId) {
    // 修复：数字 0 也是有效的 characterId，不应该被判断为 falsy
    if (characterId === undefined || characterId === null || characterId === '') {
        sbtConsole.warn(`[StaticDataManager] Invalid characterId: ${characterId}`);
        return false;
    }
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        // 检查角色是否存在
        if (db.hasOwnProperty(characterId)) {
            delete db[characterId];
            localStorage.setItem(STATIC_DATABASE_KEY, JSON.stringify(db));
            sbtConsole.log(`[StaticDataManager] Static data for character ${characterId} has been deleted.`);

            // Also remove baseline snapshot for this character (if any)
            try {
                const baselineDb = JSON.parse(localStorage.getItem(STATIC_BASELINE_KEY) || '{}');
                if (baselineDb.hasOwnProperty(characterId)) {
                    delete baselineDb[characterId];
                    localStorage.setItem(STATIC_BASELINE_KEY, JSON.stringify(baselineDb));
                    sbtConsole.log(`[StaticDataManager] Baseline for character ${characterId} has been deleted.`);
                }
            } catch (baselineError) {
                sbtConsole.warn(`[StaticDataManager] Failed to delete baseline for ${characterId}`, baselineError);
            }

            return true;
        } else {
            sbtConsole.warn(`[StaticDataManager] Character ${characterId} not found in database.`);
            return false;
        }
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to delete static data for ${characterId}`, e);
        return false;
    }
}

/**
 * 清空所有角色的静态数据。
 * @returns {boolean} - 清空是否成功。
 */
export function clearAllStaticData() {
    try {
        localStorage.removeItem(STATIC_DATABASE_KEY);
        localStorage.removeItem(STATIC_BASELINE_KEY);
        sbtConsole.log(`[StaticDataManager] All static data has been cleared.`);
        sbtConsole.log(`[StaticDataManager] All baseline data has been cleared.`);
        return true;
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to clear all static data`, e);
        return false;
    }
}

/**
 * 获取完整的静态数据库对象（用于调试/展示）。
 * @returns {object} - 完整的数据库对象。
 */
export function getFullDatabase() {
    try {
        return JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] Failed to get full database`, e);
        return {};
    }
}

/**
 * 🔧 自动清理函数：扫描并清理所有角色的污染字段
 * 此函数应在系统启动时自动调用，确保所有玩家的数据都被修复
 * @returns {object} - 清理报告 { totalCharacters, cleanedCharacters, removedFields }
 */
export function autoCleanStaticDatabase() {
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        const characterIds = Object.keys(db);

        if (characterIds.length === 0) {
            sbtConsole.log('[StaticDataManager] 数据库为空，无需清理。');
            return { totalCharacters: 0, cleanedCharacters: 0, removedFields: {} };
        }

        let cleanedCount = 0;
        const removedFieldsReport = {};

        for (const charId of characterIds) {
            const originalData = db[charId];
            const cleanedData = sanitizeStaticData(originalData);

            // 检测是否有字段被移除
            const originalKeys = Object.keys(originalData);
            const cleanedKeys = Object.keys(cleanedData);
            const removedKeys = originalKeys.filter(key => !cleanedKeys.includes(key));

            if (removedKeys.length > 0) {
                cleanedCount++;
                removedFieldsReport[charId] = removedKeys;
                db[charId] = cleanedData;
                sbtConsole.warn(`[StaticDataManager] 角色 ${charId} 检测到污染字段: ${removedKeys.join(', ')}`);
            }
        }

        // 如果有数据被清理，保存回 localStorage
        if (cleanedCount > 0) {
            localStorage.setItem(STATIC_DATABASE_KEY, JSON.stringify(db));
            sbtConsole.log(`[StaticDataManager] ✅ 自动清理完成：共 ${characterIds.length} 个角色，清理了 ${cleanedCount} 个角色的污染数据。`);
        } else {
            sbtConsole.log(`[StaticDataManager] ✅ 数据完整性检查通过，无需清理。`);
        }

        return {
            totalCharacters: characterIds.length,
            cleanedCharacters: cleanedCount,
            removedFields: removedFieldsReport
        };
    } catch (e) {
        sbtConsole.error(`[StaticDataManager] 自动清理失败:`, e);
        return { totalCharacters: 0, cleanedCharacters: 0, removedFields: {}, error: e.message };
    }
}
