import { mergeContentByFieldFusion } from './nameNormalizationService.js';

export function createWorldbookService(deps = {}) {
    const {
        getIncrementalMode = () => false,
        saveHistory = async () => {},
        debugLog = () => {},
    } = deps;

    function normalizeWorldbookEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        if (entry.content !== undefined && entry['内容'] !== undefined) {
            const contentLen = String(entry.content || '').length;
            const neirongLen = String(entry['内容'] || '').length;
            if (contentLen > neirongLen) entry['内容'] = entry.content;
            delete entry.content;
        } else if (entry.content !== undefined) {
            entry['内容'] = entry.content;
            delete entry.content;
        }

        if (entry['角色类型'] !== undefined) {
            const roleType = normalizeRoleType(entry['角色类型']);
            if (roleType) {
                entry['角色类型'] = roleType;
            } else {
                delete entry['角色类型'];
            }
        }

        return entry;
    }

    function normalizeRoleType(value) {
        const text = String(value || '').trim();
        if (!text) return '';

        if (text.includes('主角')) return '主角';
        if (text.includes('重要配角')) return '重要配角';
        if (text.includes('普通配角') || text.includes('配角')) return '普通配角';
        if (text.toUpperCase() === 'NPC' || text.includes('路人') || text.includes('龙套') || text.includes('NPC')) return 'NPC';
        return '';
    }

    function normalizeWorldbookData(data) {
        if (!data || typeof data !== 'object') return data;
        for (const category in data) {
            if (typeof data[category] === 'object' && data[category] !== null && !Array.isArray(data[category])) {
                if (data[category]['关键词'] || data[category]['内容'] || data[category].content) {
                    normalizeWorldbookEntry(data[category]);
                } else {
                    for (const entryName in data[category]) {
                        if (typeof data[category][entryName] === 'object') {
                            normalizeWorldbookEntry(data[category][entryName]);
                            if (category === '角色' && !data[category][entryName]['角色类型']) {
                                data[category][entryName]['角色类型'] = '普通配角';
                            }
                        }
                    }
                }
            }
        }
        return data;
    }

    function mergeWorldbookData(target, source) {
        normalizeWorldbookData(source);
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                mergeWorldbookData(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }

    function mergeWorldbookDataIncremental(target, source) {
        normalizeWorldbookData(source);
        for (const category in source) {
            if (typeof source[category] !== 'object' || source[category] === null) continue;
            if (!target[category]) target[category] = {};
            for (const entryName in source[category]) {
                const sourceEntry = source[category][entryName];
                if (typeof sourceEntry !== 'object' || sourceEntry === null) continue;
                if (target[category][entryName]) {
                    const targetEntry = target[category][entryName];
                    if (Array.isArray(sourceEntry['关键词']) && Array.isArray(targetEntry['关键词'])) {
                        targetEntry['关键词'] = [...new Set([...targetEntry['关键词'], ...sourceEntry['关键词']])];
                    } else if (Array.isArray(sourceEntry['关键词'])) {
                        targetEntry['关键词'] = sourceEntry['关键词'];
                    }
                    if (sourceEntry['内容']) {
                        const existingContent = targetEntry['内容'] || '';
                        const newContent = sourceEntry['内容'];
                        targetEntry['内容'] = mergeContentByFieldFusion(existingContent, newContent);
                    }

                    if (category === '角色') {
                        const sourceRoleType = normalizeRoleType(sourceEntry['角色类型']);
                        const targetRoleType = normalizeRoleType(targetEntry['角色类型']);
                        if (sourceRoleType) {
                            targetEntry['角色类型'] = sourceRoleType;
                        } else if (!targetRoleType) {
                            targetEntry['角色类型'] = '普通配角';
                        }
                    }
                } else {
                    target[category][entryName] = JSON.parse(JSON.stringify(sourceEntry));
                    if (category === '角色' && !target[category][entryName]['角色类型']) {
                        target[category][entryName]['角色类型'] = '普通配角';
                    }
                }
            }
        }
    }

    function findChangedEntries(oldWorldbook, newWorldbook) {
        const changes = [];
        for (const category in newWorldbook) {
            const oldCategory = oldWorldbook[category] || {};
            const newCategory = newWorldbook[category];
            for (const entryName in newCategory) {
                const oldEntry = oldCategory[entryName];
                const newEntry = newCategory[entryName];
                if (!oldEntry) {
                    changes.push({ type: 'add', category, entryName, oldValue: null, newValue: newEntry });
                } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
                    changes.push({ type: 'modify', category, entryName, oldValue: oldEntry, newValue: newEntry });
                }
            }
        }
        for (const category in oldWorldbook) {
            const oldCategory = oldWorldbook[category];
            const newCategory = newWorldbook[category] || {};
            for (const entryName in oldCategory) {
                if (!newCategory[entryName]) {
                    changes.push({ type: 'delete', category, entryName, oldValue: oldCategory[entryName], newValue: null });
                }
            }
        }
        return changes;
    }

    async function mergeWorldbookDataWithHistory(options) {
        const { target, source, memoryIndex, memoryTitle } = options;
        debugLog(`合并世界书[${memoryTitle}] 开始, 深拷贝快照...`);
        const previousWorldbook = JSON.parse(JSON.stringify(target));

        if (getIncrementalMode()) {
            mergeWorldbookDataIncremental(target, source);
        } else {
            mergeWorldbookData(target, source);
        }

        debugLog(`合并世界书[${memoryTitle}] 合并完成, 计算差异...`);
        const changedEntries = findChangedEntries(previousWorldbook, target);

        if (changedEntries.length > 0) {
            debugLog(`合并世界书[${memoryTitle}] 发现${changedEntries.length}处变更, 保存历史...`);
            await saveHistory(memoryIndex, memoryTitle, previousWorldbook, target, changedEntries);
        }

        debugLog(`合并世界书[${memoryTitle}] 全部完成`);
        return changedEntries;
    }

    return {
        normalizeWorldbookEntry,
        normalizeWorldbookData,
        mergeWorldbookData,
        mergeWorldbookDataIncremental,
        findChangedEntries,
        mergeWorldbookDataWithHistory,
    };
}
