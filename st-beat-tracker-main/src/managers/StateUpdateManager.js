/**
 * FILE: StateUpdateManager.js
 *
 * 状态更新管理器 - 负责应用AI返回的状态增量到章节对象
 *
 * 职责：
 * - 应用史官返回的Delta到Chapter对象
 * - 处理实体创建、更新、删除
 * - 管理故事线、角色、关系图谱的状态变化
 * - 固化章节事件
 *
 * @created 2025-12-07
 * @phase Phase 3 - 状态更新模块提取
 */

import { DebugLogger } from '../utils/DebugLogger.js';
import { TextSanitizer } from '../utils/TextSanitizer.js';
import { deepmerge } from '../../utils/deepmerge.js';
import { StorylineValidator } from '../../utils/storylineValidator.js';

const normalizeSummaryLines = (text) => {
    if (!text) return [];
    const rawLines = String(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line === '故事梗概') continue;
        if (/^\d+[\.\、)]?$/.test(line)) {
            const nextLine = rawLines[i + 1];
            if (nextLine && !/^\d+[\.\、)]?$/.test(nextLine)) {
                lines.push(nextLine.replace(/^\d+[\.\、)]\s*/, '').trim());
                i += 1;
            }
            continue;
        }
        lines.push(line.replace(/^\d+[\.\、)]\s*/, '').trim());
    }
    return lines.filter(Boolean);
};

const mergeLongTermSummary = (previous, incoming) => {
    const prevLines = normalizeSummaryLines(previous);
    const nextLines = normalizeSummaryLines(incoming);

    if (nextLines.length === 0) return prevLines.join('\n');
    if (prevLines.length === 0) return nextLines.join('\n');

    const seen = new Set();
    const merged = [];
    const addLine = (line) => {
        const key = line.replace(/\s+/g, '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(line);
    };

    prevLines.forEach(addLine);
    nextLines.forEach(addLine);
    return merged.join('\n');
};

/**
 * 状态更新管理器
 * 负责将史官返回的Delta应用到Chapter对象
 */
export class StateUpdateManager {
    /**
     * @param {Object} engine - StoryBeatEngine实例引用
     * @param {Object} dependencies - 依赖注入
     */
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('StateUpdateManager');

        // 快捷访问
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
    }

    /**
     * V10.1 在所有故事线分类中查找指定的storylineId，以应对AI分类错误
     * @param {Chapter} chapter - 要搜索的章节对象
     * @param {string} storylineId - 要查找的故事线ID
     * @returns {{category: string, staticStoryline: object, dynamicStoryline: object}|null}
     */
    findStorylineAcrossCategories(chapter, storylineId) {
        const categories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];
        for (const category of categories) {
            if (chapter.staticMatrices.storylines[category] && chapter.staticMatrices.storylines[category][storylineId]) {
                return {
                    category: category,
                    staticStoryline: chapter.staticMatrices.storylines[category][storylineId],
                    dynamicStoryline: chapter.dynamicState.storylines[category]?.[storylineId]
                };
            }
        }
        return null;
    }

    /**
     * 固化章节事件 - 将多条关系事件合并为一条总结事件
     * @param {Array} log - 事件日志数组
     * @param {number} startIndex - 起始消息索引
     * @param {number} endIndex - 结束消息索引
     * @returns {Array} 固化后的事件日志
     */
    consolidateChapterEvents(log, startIndex, endIndex) {
        this.info(`[Event Consolidation] 正在固化消息索引 ${startIndex} 到 ${endIndex} 之间的关系事件...`);

        const chapterEvents = log.filter(event =>
            event.sourceMessageIndex >= startIndex && event.sourceMessageIndex <= endIndex
        );

        const relationshipUpdates = chapterEvents.filter(
            e => e.event_type === 'RELATIONSHIP_UPDATE' || e.event_type === 'RELATIONSHIP_AFFINITY_MODIFIED'
        );

        if (relationshipUpdates.length === 0) {
            this.info("[Event Consolidation] 本章无关系变化事件可固化。");
            return log; // 如果没有关系事件，直接返回原日志
        }

        const netChanges = {}; // 用于存储净变化

        for (const event of relationshipUpdates) {
            const { character_a, character_b, affinity_change } = event.payload;
            const key = [character_a, character_b].sort().join('-'); // 创建一个唯一的键来代表一对关系

            if (!netChanges[key]) {
                netChanges[key] = { character_a, character_b, total_change: 0 };
            }
            netChanges[key].total_change += parseInt(affinity_change, 10) || 0;
        }

        // 创建一个新的、总结性的事件
        const consolidationEvent = {
            event_type: 'CHAPTER_RELATIONSHIP_SUMMARY',
            sourceChapterRange: { start: startIndex, end: endIndex },
            payload: {
                summary: `本章的关系动态已固化。`,
                net_changes: Object.values(netChanges).filter(c => c.total_change !== 0)
            },
            reasoning: "此事件取代了本章内所有独立的RELATIONSHIP_UPDATE事件，以压缩状态大小。"
        };

        // 从原始日志中，过滤掉所有被固化的独立事件
        const consolidatedLog = log.filter(event =>
            !(event.sourceMessageIndex >= startIndex && event.sourceMessageIndex <= endIndex && (event.event_type === 'RELATIONSHIP_UPDATE' || event.event_type === 'RELATIONSHIP_AFFINITY_MODIFIED'))
        );

        // 将新的总结性事件添加进去
        consolidatedLog.push(consolidationEvent);

        this.info(`[Event Consolidation] 固化完成！已将 ${relationshipUpdates.length} 条独立事件合并为1条总结事件。`);
        return consolidatedLog;
    }

    /**
     * 应用状态更新Delta到章节对象
     * @param {Chapter} workingChapter - 工作章节对象
     * @param {Object} delta - 状态增量对象
     * @returns {Chapter} 更新后的章节对象
     */
    applyStateUpdates(workingChapter, delta) {
        this.info("--- 引擎核心：开始应用状态更新Delta ---");
        const collectedStorylineDeltas = [];
        const collectedRelationshipDeltas = [];

        // V10.1 步骤零：预处理和防御
        // 🛡️ 防御1: 清理顶层摘要
        if (delta.new_long_term_summary) {
            delta.new_long_term_summary = TextSanitizer.sanitizeText(delta.new_long_term_summary);
        }

        // 步骤一：处理新实体的创生 (Creations)
        if (delta.creations && delta.creations.staticMatrices) {
            this.info(" -> 检测到新实体创生请求...");

            // 🛡️ 防御2: 防止创建已存在于其他分类的故事线
            if (delta.creations.staticMatrices.storylines) {
                const creators = delta.creations.staticMatrices.storylines;
                for (const category in creators) {
                    for (const storylineId in creators[category]) {
                        const found = this.findStorylineAcrossCategories(workingChapter, storylineId);
                        if (found) {
                            this.warn(`🛡️ [防污染] 史官尝试在 ${category} 中创建一个已存在的故事线 ${storylineId} (实际位于 ${found.category})。已拦截该创建操作。`);
                            delete creators[category][storylineId]; // 从创建请求中移除
                        }
                    }
                }
            }

            // 🛡️ [新增] 故事线创建审查机制
            if (delta.creations.staticMatrices.storylines) {
                const newStorylines = delta.creations.staticMatrices.storylines;

                // 定义只允许用户手动创建的"高抽象"分类
                const RESTRICTED_CATEGORIES = ['personal_arcs', 'relationship_arcs'];

                for (const category of RESTRICTED_CATEGORIES) {
                    if (newStorylines[category]) {
                        this.warn(`🛡️ [权限拦截] 阻止 AI 自动创建 ${category}。该分类仅限用户手动管理，或 AI 仅能更新已有项。`);
                        // 直接删除 AI 的创建请求，把它扼杀在摇篮里
                        delete newStorylines[category];
                    }
                }
            }

            // 关系图谱: 合并新增边，避免覆盖旧图谱
            const createdRelationshipGraph = delta.creations.staticMatrices.relationship_graph;
            if (createdRelationshipGraph && Array.isArray(createdRelationshipGraph.edges)) {
                const existingGraph = workingChapter.staticMatrices.relationship_graph || { edges: [] };
                const existingEdges = Array.isArray(existingGraph.edges) ? existingGraph.edges : [];
                const incomingEdges = createdRelationshipGraph.edges;
                const mergedEdges = [...existingEdges];

                const buildParticipantsKey = (edge) => {
                    const participants = Array.isArray(edge?.participants) ? edge.participants.slice() : [];
                    if (participants.length < 2) return null;
                    return participants.sort().join('|');
                };

                for (const incomingEdge of incomingEdges) {
                    if (!incomingEdge || typeof incomingEdge !== 'object') continue;
                    const incomingId = incomingEdge.id;
                    let index = -1;
                    if (incomingId) {
                        index = mergedEdges.findIndex(edge => edge?.id === incomingId);
                    }
                    if (index === -1) {
                        const key = buildParticipantsKey(incomingEdge);
                        if (key) {
                            index = mergedEdges.findIndex(edge => buildParticipantsKey(edge) === key);
                        }
                    }
                    if (index === -1) {
                        mergedEdges.push(incomingEdge);
                    } else {
                        mergedEdges[index] = deepmerge(mergedEdges[index], incomingEdge);
                    }
                }

                workingChapter.staticMatrices.relationship_graph = deepmerge(existingGraph, {
                    ...createdRelationshipGraph,
                    edges: mergedEdges
                });

                // 防止 deepmerge 再次覆盖已合并的关系图谱
                delete delta.creations.staticMatrices.relationship_graph;
                this.info(` -> 已合并关系图谱新增边: +${incomingEdges.length}, 总计 ${mergedEdges.length}`);
            }

            // 使用深度合并，将新创建的静态档案安全地并入现有的staticMatrices中
            workingChapter.staticMatrices = deepmerge(workingChapter.staticMatrices, delta.creations.staticMatrices);
            this.diagnose(" -> 新的静态实体档案已合并。", delta.creations.staticMatrices);
        }

        // 步骤二：处理已存在实体的状态更新 (Updates)
        if (delta.updates) {
            this.info(" -> 检测到实体状态更新请求...");
            const updates = delta.updates;

            // 更新角色动态和静态
            if (updates.characters) {
                for (const charId in updates.characters) {
                    const charUpdates = updates.characters[charId];

                    // 确保角色在 staticMatrices 和 dynamicState 中都存在
                    if (!workingChapter.staticMatrices.characters[charId]) {
                        this.warn(`警告：尝试更新不存在的角色 ${charId}，跳过此角色的更新`);
                        continue;
                    }
                    if (!workingChapter.dynamicState.characters[charId]) {
                        workingChapter.dynamicState.characters[charId] = {};
                    }

                    // 处理 social.relationships 的特殊逻辑（动态数据）
                    if (charUpdates.social?.relationships) {
                        if (!workingChapter.dynamicState.characters[charId].relationships) {
                            workingChapter.dynamicState.characters[charId].relationships = {};
                        }
                        for (const targetCharId in charUpdates.social.relationships) {
                            const relUpdate = charUpdates.social.relationships[targetCharId];
                            if (!workingChapter.dynamicState.characters[charId].relationships[targetCharId]) {
                                workingChapter.dynamicState.characters[charId].relationships[targetCharId] = { history: [] };
                            }
                            const targetRel = workingChapter.dynamicState.characters[charId].relationships[targetCharId];

                            if (relUpdate.current_affinity !== undefined) {
                                targetRel.current_affinity = relUpdate.current_affinity;
                            }
                            if (relUpdate.history_entry) {
                                // V3.1: 只保留最新的完整reasoning，避免UI过长
                                // 将完整的reasoning存储到latest_reasoning字段（替换模式）
                                targetRel.latest_reasoning = relUpdate.history_entry;

                                // 在history中只保留简化的数值变化记录（可选：限制长度）
                                const simplifiedEntry = {
                                    timestamp: relUpdate.history_entry.timestamp,
                                    change: relUpdate.history_entry.change,
                                    final_affinity: relUpdate.history_entry.final_affinity,
                                    source_chapter_uid: relUpdate.history_entry.source_chapter_uid
                                };
                                targetRel.history.push(simplifiedEntry);

                                // 限制history长度，只保留最近10条数值记录
                                if (targetRel.history.length > 10) {
                                    targetRel.history = targetRel.history.slice(-10);
                                }
                            }

                            // 🔧 [关键修复] 双向关系同步：确保目标角色的静态档案中也有对源角色的关系引用
                            // 这样当查看目标角色档案时，也能看到这个关系
                            if (workingChapter.staticMatrices.characters[targetCharId]) {
                                // 确保目标角色有social.relationships结构
                                if (!workingChapter.staticMatrices.characters[targetCharId].social) {
                                    workingChapter.staticMatrices.characters[targetCharId].social = {};
                                }
                                if (!workingChapter.staticMatrices.characters[targetCharId].social.relationships) {
                                    workingChapter.staticMatrices.characters[targetCharId].social.relationships = {};
                                }

                                // 如果目标角色的静态档案中没有对源角色的关系，自动创建一个
                                if (!workingChapter.staticMatrices.characters[targetCharId].social.relationships[charId]) {
                                    // 从源角色的静态关系中查找描述
                                    const sourceStaticRel = workingChapter.staticMatrices.characters[charId]?.social?.relationships?.[targetCharId];

                                    workingChapter.staticMatrices.characters[targetCharId].social.relationships[charId] = {
                                        relation_type: sourceStaticRel?.relation_type || '相识',
                                        description: sourceStaticRel?.description || '建立了关系',
                                        affinity: relUpdate.current_affinity || 50
                                    };
                                    this.info(`  ✓ 自动创建反向关系引用: ${targetCharId} -> ${charId}`);
                                }
                            }
                        }
                    }

                    // 处理旧版 relationships 格式（兼容性）
                    if (charUpdates.relationships) {
                        if (!workingChapter.dynamicState.characters[charId].relationships) {
                            workingChapter.dynamicState.characters[charId].relationships = {};
                        }
                        for (const targetCharId in charUpdates.relationships) {
                            const relUpdate = charUpdates.relationships[targetCharId];
                            if (!workingChapter.dynamicState.characters[charId].relationships[targetCharId]) {
                                workingChapter.dynamicState.characters[charId].relationships[targetCharId] = { history: [] };
                            }
                            const targetRel = workingChapter.dynamicState.characters[charId].relationships[targetCharId];

                            if (relUpdate.current_affinity !== undefined) {
                                targetRel.current_affinity = relUpdate.current_affinity;
                            }
                            if (relUpdate.history_entry) {
                                // V3.1: 只保留最新的完整reasoning，避免UI过长
                                // 将完整的reasoning存储到latest_reasoning字段（替换模式）
                                targetRel.latest_reasoning = relUpdate.history_entry;

                                // 在history中只保留简化的数值变化记录（可选：限制长度）
                                const simplifiedEntry = {
                                    timestamp: relUpdate.history_entry.timestamp,
                                    change: relUpdate.history_entry.change,
                                    final_affinity: relUpdate.history_entry.final_affinity,
                                    source_chapter_uid: relUpdate.history_entry.source_chapter_uid
                                };
                                targetRel.history.push(simplifiedEntry);

                                // 限制history长度，只保留最近10条数值记录
                                if (targetRel.history.length > 10) {
                                    targetRel.history = targetRel.history.slice(-10);
                                }
                            }

                            // 🔧 [关键修复] 双向关系同步（旧版格式兼容）
                            if (workingChapter.staticMatrices.characters[targetCharId]) {
                                if (!workingChapter.staticMatrices.characters[targetCharId].social) {
                                    workingChapter.staticMatrices.characters[targetCharId].social = {};
                                }
                                if (!workingChapter.staticMatrices.characters[targetCharId].social.relationships) {
                                    workingChapter.staticMatrices.characters[targetCharId].social.relationships = {};
                                }

                                if (!workingChapter.staticMatrices.characters[targetCharId].social.relationships[charId]) {
                                    const sourceStaticRel = workingChapter.staticMatrices.characters[charId]?.social?.relationships?.[targetCharId];

                                    workingChapter.staticMatrices.characters[targetCharId].social.relationships[charId] = {
                                        relation_type: sourceStaticRel?.relation_type || '相识',
                                        description: sourceStaticRel?.description || '建立了关系',
                                        affinity: relUpdate.current_affinity || 50
                                    };
                                    this.info(`  ✓ 自动创建反向关系引用(旧版): ${targetCharId} -> ${charId}`);
                                }
                            }
                        }
                    }

                    // 更新心理档案
                    if (charUpdates.dossier_updates && Array.isArray(charUpdates.dossier_updates)) {
                        if (!workingChapter.dynamicState.characters[charId].dossier_updates) {
                            workingChapter.dynamicState.characters[charId].dossier_updates = [];
                        }
                        workingChapter.dynamicState.characters[charId].dossier_updates.push(...charUpdates.dossier_updates);
                    }

                    // 【关键修复】更新角色的静态字段（核心身份、外貌、性格、能力等）
                    // 将更新合并到 staticMatrices.characters
                    const staticChar = workingChapter.staticMatrices.characters[charId];
                    const fieldsToMerge = [
                        'core', 'appearance', 'personality', 'background', 'goals',
                        'capabilities', 'equipment', 'experiences', 'secrets', 'custom'
                    ];

                    // 字符串类型字段（直接覆盖）
                    const stringFields = ['appearance', 'secrets'];
                    // 对象类型字段（深度合并）
                    const objectFields = ['core', 'personality', 'background', 'goals', 'capabilities', 'equipment', 'experiences', 'custom'];

                    for (const field of fieldsToMerge) {
                        if (charUpdates[field]) {
                            // 判断字段类型
                            if (stringFields.includes(field)) {
                                // 字符串字段：直接覆盖
                                staticChar[field] = charUpdates[field];
                                this.diagnose(`  -> 已更新角色 ${charId} 的 ${field} 字段（字符串）`);
                            } else if (objectFields.includes(field)) {
                                // 对象字段：深度合并
                                let fieldValue = charUpdates[field];

                                // 处理字段值 - 检查是否有 operation 结构（向后兼容）
                                if (typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
                                    // 遍历子字段，处理可能的 operation 结构
                                    for (const subKey in fieldValue) {
                                        const subValue = fieldValue[subKey];

                                        // 如果是 {operation: 'append', values: [...]} 格式，转换为直接数组
                                        if (subValue && typeof subValue === 'object' && subValue.operation === 'append' && Array.isArray(subValue.values)) {
                                            this.warn(`警告：检测到旧格式的 operation 结构 (${field}.${subKey})，自动转换为完整数组`);

                                            // 获取原有值
                                            const existingValue = staticChar[field]?.[subKey];
                                            if (Array.isArray(existingValue)) {
                                                // 合并原有值和新值
                                                fieldValue[subKey] = [...existingValue, ...subValue.values];
                                            } else {
                                                // 只使用新值
                                                fieldValue[subKey] = subValue.values;
                                            }
                                        }
                                    }
                                }

                                // 确保原字段存在且为对象
                                if (!staticChar[field] || typeof staticChar[field] !== 'object') {
                                    staticChar[field] = {};
                                }

                                // 使用深度合并
                                staticChar[field] = deepmerge(staticChar[field], fieldValue);
                                this.diagnose(`  -> 已更新角色 ${charId} 的 ${field} 字段（对象）`);
                            }
                        }
                    }

                    // 更新 social 字段（除了 relationships，因为那是动态的）
                    if (charUpdates.social) {
                        if (!staticChar.social) {
                            staticChar.social = {};
                        }
                        // 合并除了 relationships 之外的 social 字段
                        const socialUpdates = { ...charUpdates.social };
                        delete socialUpdates.relationships; // relationships 已经在上面处理
                        staticChar.social = deepmerge(staticChar.social, socialUpdates);
                    }
                }
            }

            // 更新世界观动态 (此处逻辑可根据未来需求扩展，目前框架已备好)
            if (updates.worldview) {
                for (const category in updates.worldview) { // 遍历 locations, items...
                    if (!workingChapter.dynamicState.worldview[category]) {
                        workingChapter.dynamicState.worldview[category] = {};
                    }
                    for (const entityId in updates.worldview[category]) {
                        const entityUpdate = updates.worldview[category][entityId];
                        if (!workingChapter.dynamicState.worldview[category][entityId]) {
                            workingChapter.dynamicState.worldview[category][entityId] = { updates: [] };
                        }
                        const targetEntity = workingChapter.dynamicState.worldview[category][entityId];

                        // 如果史官直接提供了更新后的描述，我们也可以更新它
                        if (entityUpdate.current_description) {
                            targetEntity.current_description = entityUpdate.current_description;
                        }

                        // 追加历史记录
                        if (entityUpdate.update_entry && typeof entityUpdate.update_entry === 'object') {
                            targetEntity.updates.push(entityUpdate.update_entry);
                        }
                    }
                }
            }

            // V10.1 更新故事线（重构逻辑）
            if (updates.storylines) {
                this.logger.group('[SBE-CORE] 故事线更新 - ID优先寻址模式');

                // 1. 构建本地全局 ID 索引表 (Registry)
                // 目的：无论 AI 把 ID 扔到哪个分类下，我们都能瞬间找到它在数据库里的真实老家
                const localIdRegistry = {};
                const validCategories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];

                validCategories.forEach(realCat => {
                    if (workingChapter.staticMatrices.storylines[realCat]) {
                        Object.keys(workingChapter.staticMatrices.storylines[realCat]).forEach(id => {
                            localIdRegistry[id] = realCat; // 映射关系: id -> 真实分类
                        });
                    }
                });

                // 2. 扁平化 AI 的输入流
                // 我们不关心 AI 把数据放进了 updates.storylines.main_quests 还是 personal_arcs
                // 我们只把它们看作一堆待处理的 { id, data } 数据包
                const flatUpdateQueue = [];

                for (const aiCat in updates.storylines) {
                    for (const id in updates.storylines[aiCat]) {
                        flatUpdateQueue.push({
                            id: id,
                            data: updates.storylines[aiCat][id],
                            aiSuggestedCat: aiCat // 仅作为参考或新建时的默认值
                        });
                    }
                }

                // 3. 处理队列
                for (const item of flatUpdateQueue) {
                    const { id, data, aiSuggestedCat } = item;

                    // 🔒 [架构优化 - 方案A] ID命名规范验证
                    const validation = StorylineValidator.validateIdCategoryMatch(id, aiSuggestedCat);

                    if (!validation.valid) {
                        this.warn(`🚫 [ID验证失败] ${validation.reason}`);

                        if (validation.suggestedCategory && validation.confidence > 0.7) {
                            // 置信度高时，尝试自动纠正（但仅限已存在的ID）
                            if (localIdRegistry[id] === validation.suggestedCategory) {
                                this.warn(`   💡 自动纠正: ${aiSuggestedCat} → ${validation.suggestedCategory}`);
                                item.aiSuggestedCat = validation.suggestedCategory; // 修正分类
                            } else {
                                this.warn(`   💡 建议分类: ${validation.suggestedCategory} (置信度: ${(validation.confidence * 100).toFixed(0)}%)`);
                                this.warn(`   ❌ 拒绝处理，请AI使用正确的ID格式: ${StorylineValidator.getExampleId(aiSuggestedCat)}`);
                                continue; // 丢弃不符合规范的数据
                            }
                        } else {
                            this.warn(`   ❌ 无法推断正确分类，丢弃此条目`);
                            this.warn(`   💡 期望格式: ${StorylineValidator.getExampleId(aiSuggestedCat)}`);
                            continue;
                        }
                    }

                    // --- 核心修复：寻址逻辑 ---
                    let targetCategory = localIdRegistry[id];
                    let isNewCreation = false;

                    if (targetCategory) {
                        // Case A: ID 已存在于数据库中
                        if (targetCategory !== aiSuggestedCat) {
                            this.warn(`🛡️ [架构纠偏] 修正 ID 归属: ${id} (AI误判: ${aiSuggestedCat} -> 修正为: ${targetCategory})`);
                        }
                    } else {
                        // Case B: ID 不存在 (这可能是一个真正的 New Creation，或者是彻底的幻觉)
                        // 只有当提供了 title 时，我们才认可它是创建操作，否则视为幻觉丢弃
                        if (data.title) {
                            // 🛡️ [架构优化 - 方案C] 严格的创建/更新分离检查
                            const RESTRICTED_CATEGORIES = ['personal_arcs', 'relationship_arcs'];
                            if (RESTRICTED_CATEGORIES.includes(aiSuggestedCat)) {
                                this.error(`🚫 [协议违规] 禁止在 updates 中创建受限分类故事线！`);
                                this.error(`   分类: ${aiSuggestedCat}, ID: ${id}`);
                                this.error(`   请AI改用: creations.staticMatrices.storylines.${aiSuggestedCat}["${id}"]`);
                                continue; // 跳过此条目
                            }

                            // ⚠️ 允许在updates中创建main_quests和side_quests（用于突发事件）
                            // 但记录警告，提醒最佳实践是使用creations
                            this.warn(`⚠️ [最佳实践警告] 检测到在 updates 中创建新故事线`);
                            this.warn(`   ID: ${id}, 分类: ${aiSuggestedCat}`);
                            this.warn(`   建议: 应使用 creations.staticMatrices.storylines.${aiSuggestedCat} 创建新故事线`);

                            isNewCreation = true;
                            targetCategory = aiSuggestedCat; // 新建时，暂时信任 AI 的分类
                            this.info(`✨ [新线创建] 接纳新 ID: ${id} 归入 ${targetCategory}`);

                            // 初始化结构
                            if (!workingChapter.staticMatrices.storylines[targetCategory]) {
                                workingChapter.staticMatrices.storylines[targetCategory] = {};
                            }
                            if (!workingChapter.dynamicState.storylines[targetCategory]) {
                                workingChapter.dynamicState.storylines[targetCategory] = {};
                            }

                            // 注册到静态库 (防止后续循环报错)
                            workingChapter.staticMatrices.storylines[targetCategory][id] = {
                                title: data.title,
                                summary: data.summary || "（暂无摘要）",
                                status: data.status || "active",
                                type: targetCategory
                            };

                            // 🔧 [关键修复] 立即更新注册表，防止后续队列项重复创建同一个ID
                            localIdRegistry[id] = targetCategory;
                        } else {
                            this.warn(`🗑️ [幻觉过滤] 丢弃无效更新: ${id} (ID不存在且未提供title，无法创建)`);
                            continue; // 跳过此条目
                        }
                    }

                    // --- 数据应用逻辑 (此时 targetCategory 绝对正确) ---

                    // 确保动态库存在
                    if (!workingChapter.dynamicState.storylines[targetCategory]) {
                        workingChapter.dynamicState.storylines[targetCategory] = {};
                    }

                    // 初始化动态对象
                    if (!workingChapter.dynamicState.storylines[targetCategory][id]) {
                        workingChapter.dynamicState.storylines[targetCategory][id] = { history: [] };
                    }

                    const dynamicObj = workingChapter.dynamicState.storylines[targetCategory][id];
                    const staticObj = workingChapter.staticMatrices.storylines[targetCategory][id];

                    // 数据清洗
                    const cleanStr = (s) => {
                        if (!s || typeof s !== 'string') return null;
                        // 过滤掉特定乱码字符
                        if (s.includes('δ׫') || s.includes('дժ')) return null;
                        // 过滤掉纯空白字符串
                        if (s.trim() === '') return null;
                        return s;
                    };

                    // 1. 更新动态字段
                    if (data.current_status) dynamicObj.current_status = data.current_status;
                    if (data.current_summary) dynamicObj.current_summary = cleanStr(data.current_summary);
                    if (data.advancement) {
                        // 收集给控制塔
                        collectedStorylineDeltas.push({
                            storyline_id: id,
                            category: targetCategory,
                            ...data.advancement
                        });

                        // [新增] 同时更新本地动态状态，方便 Prompt 和 UI 读取
                        if (data.advancement.new_stage) {
                            dynamicObj.current_stage = data.advancement.new_stage;
                        }
                    }

                    // 2. 更新历史记录
                    if (data.history_entry) {
                        dynamicObj.latest_reasoning = data.history_entry;
                        dynamicObj.history.push({
                            timestamp: data.history_entry.timestamp || new Date().toISOString(),
                            status: data.history_entry.status || dynamicObj.current_status || 'active',
                            summary: cleanStr(data.history_entry.summary) || "（进度推进）",
                            chapter: workingChapter.meta.chapterNumber || 1
                        });
                        if (dynamicObj.history.length > 10) dynamicObj.history = dynamicObj.history.slice(-10);
                    }

                    // 3. 更新静态字段 (如果 AI 提供了修改)
                    if (data.title) staticObj.title = data.title;
                    if (data.summary) staticObj.summary = cleanStr(data.summary);
                    if (data.status) staticObj.status = data.status;

                    this.info(`  ✅ ID [${id}] 更新完成 (Hash: ${targetCategory})`);
                }
                this.logger.groupEnd();
            } else {
                this.info("史官未提供任何故事线更新（updates.storylines 为空）");
            }
            this.diagnose(" -> 实体动态状态已更新。", updates);
        }

        // 步骤三：更新元数据
        if (delta.new_long_term_summary) {
            this.info(" -> 正在更新长篇故事摘要...");
            workingChapter.meta.longTermStorySummary = mergeLongTermSummary(
                workingChapter.meta?.longTermStorySummary || '',
                delta.new_long_term_summary
            ); // 已经在顶部清理过
        }

        // V6.0 步骤三B：更新年表时间
        if (delta.chronology_update) {
            this.logger.group('[ENGINE-V6-CHRONOLOGY] 时间流逝更新流程');
            this.info(" -> 检测到年表更新请求...");

            const chronUpdate = delta.chronology_update;
            this.logger.log('收到时间更新:', chronUpdate);

            if (!workingChapter.dynamicState.chronology) {
                workingChapter.dynamicState.chronology = {
                    day_count: 1,
                    time_slot: "evening",
                    weather: null,
                    last_rest_chapter: null
                };
                this.info(" -> 已初始化年表系统");
            }

            const chron = workingChapter.dynamicState.chronology;

            // 应用时间更新
            if (chronUpdate.new_day_count !== undefined) {
                chron.day_count = chronUpdate.new_day_count;
                this.info(`  ✓ 天数更新: ${chronUpdate.new_day_count}`);
            }
            if (chronUpdate.new_time_slot) {
                const oldSlot = chron.time_slot;
                chron.time_slot = chronUpdate.new_time_slot;
                this.info(`  ✓ 时段更新: ${oldSlot} -> ${chronUpdate.new_time_slot}`);
            }
            if (chronUpdate.new_weather !== undefined) {
                chron.weather = chronUpdate.new_weather;
                this.info(`  ✓ 天气更新: ${chronUpdate.new_weather || '清除'}`);
            }

            // 如果是时间跳跃,应用生理状态变更
            if (chronUpdate.transition_type === 'time_jump' && chronUpdate.physiological_effects) {
                this.info("  -> 检测到时间跳跃,应用生理状态变更...");
                let hasRest = false;
                for (const charId in chronUpdate.physiological_effects) {
                    const effects = chronUpdate.physiological_effects[charId];
                    if (!workingChapter.dynamicState.characters[charId]) {
                        workingChapter.dynamicState.characters[charId] = {};
                    }
                    Object.assign(workingChapter.dynamicState.characters[charId], effects);
                    this.info(`    ✓ 角色 ${charId}: ${JSON.stringify(effects)}`);

                    // 检查是否有角色休息
                    if (effects.fatigue === 'rested' || effects.fatigue === 'refreshed') {
                        hasRest = true;
                    }
                }

                // 更新last_rest_chapter
                if (hasRest) {
                    chron.last_rest_chapter = workingChapter.uid;
                    this.info(`  ✓ 记录休息章节: ${workingChapter.uid}`);
                }
            }

            this.logger.log('最终时间状态:', JSON.parse(JSON.stringify(chron)));
            this.logger.log('时间转换类型:', chronUpdate.transition_type);
            this.logger.log('推理:', chronUpdate.reasoning);
            this.logger.groupEnd();
        }

        // V2.0 步骤四：更新宏观叙事弧光
        if (delta.updates?.meta?.active_narrative_arcs) {
            this.logger.group('[ENGINE-V2-PROBE] 宏观叙事弧光更新流程');
            this.info(" -> 检测到宏观叙事弧光更新请求...");

            if (!workingChapter.meta.active_narrative_arcs) {
                workingChapter.meta.active_narrative_arcs = [];
                this.info(" -> 已初始化 meta.active_narrative_arcs 数组");
            }

            const arcUpdates = delta.updates.meta.active_narrative_arcs;
            this.logger.log(`收到 ${arcUpdates.length} 条弧光更新`, arcUpdates);

            for (const arcUpdate of arcUpdates) {
                const existingArcIndex = workingChapter.meta.active_narrative_arcs.findIndex(
                    arc => arc.arc_id === arcUpdate.arc_id
                );

                if (existingArcIndex !== -1) {
                    // 更新现有弧光
                    const existingArc = workingChapter.meta.active_narrative_arcs[existingArcIndex];

                    if (arcUpdate.impact_type === 'close') {
                        // 弧光完成，从活跃列表中移除
                        workingChapter.meta.active_narrative_arcs.splice(existingArcIndex, 1);
                        this.info(`  ✓ 弧光 ${arcUpdate.arc_id} 已完成，已从活跃列表移除`);
                    } else {
                        // 更新弧光状态
                        if (arcUpdate.current_stage) existingArc.current_stage = arcUpdate.current_stage;
                        if (arcUpdate.stage_description) existingArc.stage_description = arcUpdate.stage_description;
                        if (arcUpdate.progression_note) {
                            if (!existingArc.progression_history) existingArc.progression_history = [];
                            existingArc.progression_history.push({
                                timestamp: new Date().toISOString(),
                                note: arcUpdate.progression_note
                            });
                        }
                        existingArc.last_updated = new Date().toISOString();
                        this.info(`  ✓ 弧光 ${arcUpdate.arc_id} 已更新 (类型: ${arcUpdate.impact_type || 'progress'})`);
                    }
                } else {
                    // 新弧光，添加到列表
                    if (arcUpdate.impact_type !== 'close') {
                        const newArc = {
                            arc_id: arcUpdate.arc_id,
                            title: arcUpdate.title || '未命名弧光',
                            long_term_goal: arcUpdate.long_term_goal || '',
                            current_stage: arcUpdate.current_stage || 'initial',
                            stage_description: arcUpdate.stage_description || '',
                            involved_entities: arcUpdate.involved_entities || [],
                            created_at: new Date().toISOString(),
                            last_updated: new Date().toISOString(),
                            progression_history: arcUpdate.progression_note ? [{
                                timestamp: new Date().toISOString(),
                                note: arcUpdate.progression_note
                            }] : []
                        };
                        workingChapter.meta.active_narrative_arcs.push(newArc);
                        this.info(`  ✓ 新弧光 ${arcUpdate.arc_id} 已添加到活跃列表`);
                    }
                }
            }

            this.logger.log(`当前活跃弧光数量: ${workingChapter.meta.active_narrative_arcs.length}`);
            this.logger.groupEnd();
        }

        // [V10.1 Fix] 步骤五：处理关系图谱更新 (Relationship Graph Updates)
        if (delta.relationship_updates && Array.isArray(delta.relationship_updates)) {
            this.logger.group('[ENGINE-V3-PROBE] 关系图谱更新流程');
            this.info(" -> 检测到关系图谱更新请求...");

            // 确保relationship_graph存在
            if (!workingChapter.staticMatrices.relationship_graph) {
                workingChapter.staticMatrices.relationship_graph = { edges: [] };
                this.info(" -> 已初始化 staticMatrices.relationship_graph");
            }

            const relationshipUpdates = delta.relationship_updates;
            this.logger.log(`收到 ${relationshipUpdates.length} 条关系边更新`, relationshipUpdates);

            for (const relUpdate of relationshipUpdates) {
                // 1. [Fix] ID 兼容性处理：同时支持 standard ID 和 edge_id
                const relationship_id = relUpdate.relationship_id || relUpdate.edge_id;

                if (!relationship_id) {
                    this.warn(`警告：发现一条缺少 ID 的关系更新记录，跳过。`);
                    continue;
                }

                // 2. [Fix] 核心修复：数据源兼容性处理
                // AI 有时会忘记把数据包裹在 "updates" 字段里，直接写在根节点
                let updatesToApply = relUpdate.updates;

                if (!updatesToApply) {
                    // 降级策略：尝试从根对象提取非保留字段
                    updatesToApply = { ...relUpdate };
                    // 移除元数据字段，剩下的认为是数据字段
                    delete updatesToApply.relationship_id;
                    delete updatesToApply.edge_id;
                    delete updatesToApply.narrative_advancement; // 这是给控制塔用的，不直接写入图谱

                    // 如果过滤后还有内容，就当做 updates 使用
                    if (Object.keys(updatesToApply).length > 0) {
                        this.logger.log(`[兼容模式] 检测到扁平化数据结构，已自动提取字段作为更新源:`, Object.keys(updatesToApply));
                    } else {
                        updatesToApply = null; // 真的没数据
                    }
                }

                // 查找对应的关系边
                const edgeIndex = workingChapter.staticMatrices.relationship_graph.edges.findIndex(
                    edge => edge.id === relationship_id
                );

                if (edgeIndex === -1) {
                    this.warn(`警告：尝试更新不存在的关系边 ${relationship_id}，跳过此更新`);
                    continue;
                }

                const edge = workingChapter.staticMatrices.relationship_graph.edges[edgeIndex];

                // 3. [Feature] 捕获叙事权重 (如果存在)
                // 确保 collectedRelationshipDeltas 在函数开头已定义，否则这里加个类型检查
                if (relUpdate.narrative_advancement && typeof collectedRelationshipDeltas !== 'undefined') {
                    collectedRelationshipDeltas.push({
                        relationship_id: relationship_id,
                        participants: edge.participants,
                        ...relUpdate.narrative_advancement
                    });
                    this.info(`  📊 捕获关系权重: ${relationship_id} (Weight: ${relUpdate.narrative_advancement.weight})`);
                }

                // 4. [Fix] 安全应用更新 (防止 updatesToApply 为 null 导致崩溃)
                if (updatesToApply && typeof updatesToApply === 'object') {
                    this.logger.log(`正在更新关系边: ${relationship_id}`, updatesToApply);

                    // 应用更新 - 使用点标记法路径
                    for (const [path, value] of Object.entries(updatesToApply)) {
                        // 这里的 try-catch 是为了防止极端畸形路径导致 split 报错
                        try {
                            const keys = path.split('.');
                            let target = edge;

                            // 遍历到倒数第二层
                            for (let i = 0; i < keys.length - 1; i++) {
                                const key = keys[i];
                                if (!target[key]) {
                                    target[key] = {};
                                }
                                target = target[key];
                            }

                            // 设置最终值
                            const finalKey = keys[keys.length - 1];
                            target[finalKey] = value;

                            this.info(`  ✓ 已更新 ${relationship_id}.${path}`);
                        } catch (err) {
                            this.warn(`  ⚠️ 应用字段 ${path} 失败: ${err.message}`);
                        }
                    }
                } else {
                    this.logger.log(`  ℹ️ 关系 ${relationship_id} 没有实质性内容更新 (可能仅包含 narrative_advancement)`);
                }

                // 处理占位符替换
                const currentChapterUid = workingChapter.uid;

                function replacePlaceholders(obj) {
                    if (typeof obj === 'string') {
                        return obj.replace(/\{\{current_chapter_uid\}\}/g, currentChapterUid);
                    } else if (Array.isArray(obj)) {
                        return obj.map(replacePlaceholders);
                    } else if (obj && typeof obj === 'object' && obj !== null) { // 增加 null 检查
                        const result = {};
                        for (const [key, value] of Object.entries(obj)) {
                            result[key] = replacePlaceholders(value);
                        }
                        return result;
                    }
                    return obj;
                }

                workingChapter.staticMatrices.relationship_graph.edges[edgeIndex] = replacePlaceholders(edge);
            }

            this.logger.log(`关系图谱当前边数: ${workingChapter.staticMatrices.relationship_graph.edges.length}`);
            this.logger.groupEnd();
        }

        // V2.0 步骤六：合并文体档案更新
        if (delta.stylistic_analysis_delta) {
            this.logger.group('[ENGINE-V2-PROBE] 文体档案合并流程');
            this.info(" -> 检测到文体档案更新请求...");

            if (!workingChapter.dynamicState.stylistic_archive) {
                workingChapter.dynamicState.stylistic_archive = {
                    imagery_and_metaphors: [],
                    frequent_descriptors: { adjectives: [], adverbs: [] },
                    sensory_patterns: []
                };
                this.info(" -> 已初始化 dynamicState.stylistic_archive");
            }

            const stylisticDelta = delta.stylistic_analysis_delta;
            const archive = workingChapter.dynamicState.stylistic_archive;

            // 合并意象和隐喻
            if (stylisticDelta.new_imagery && Array.isArray(stylisticDelta.new_imagery)) {
                archive.imagery_and_metaphors.push(...stylisticDelta.new_imagery);
                this.info(`  ✓ 已添加 ${stylisticDelta.new_imagery.length} 条新意象/隐喻`);
            }

            // 合并描述词
            if (stylisticDelta.new_descriptors) {
                if (stylisticDelta.new_descriptors.adjectives) {
                    for (const newAdj of stylisticDelta.new_descriptors.adjectives) {
                        const existing = archive.frequent_descriptors.adjectives.find(
                            item => item.word === newAdj.word
                        );
                        if (existing) {
                            existing.count += newAdj.count || 1;
                            existing.overused = existing.count > 5; // 阈值可配置
                        } else {
                            archive.frequent_descriptors.adjectives.push(newAdj);
                        }
                    }
                    this.info(`  ✓ 已合并 ${stylisticDelta.new_descriptors.adjectives.length} 条形容词`);
                }

                if (stylisticDelta.new_descriptors.adverbs) {
                    for (const newAdv of stylisticDelta.new_descriptors.adverbs) {
                        const existing = archive.frequent_descriptors.adverbs.find(
                            item => item.word === newAdv.word
                        );
                        if (existing) {
                            existing.count += newAdv.count || 1;
                            existing.overused = existing.count > 5;
                        } else {
                            archive.frequent_descriptors.adverbs.push(newAdv);
                        }
                    }
                    this.info(`  ✓ 已合并 ${stylisticDelta.new_descriptors.adverbs.length} 条副词`);
                }
            }

            // 合并感官模式
            if (stylisticDelta.new_sensory_patterns && Array.isArray(stylisticDelta.new_sensory_patterns)) {
                for (const newPattern of stylisticDelta.new_sensory_patterns) {
                    const existing = archive.sensory_patterns.find(
                        p => p.type === newPattern.type && p.pattern === newPattern.pattern
                    );
                    if (existing) {
                        existing.used_count = (existing.used_count || 1) + (newPattern.used_count || 1);
                    } else {
                        archive.sensory_patterns.push(newPattern);
                    }
                }
                this.info(`  ✓ 已合并 ${stylisticDelta.new_sensory_patterns.length} 条感官模式`);
            }

            // 记录诊断信息
            if (stylisticDelta.stylistic_diagnosis) {
                this.diagnose('[文体诊断]', stylisticDelta.stylistic_diagnosis);
            }

            this.logger.groupEnd();
        }

        // V4.0 步骤七：更新叙事控制塔 (Narrative Control Tower)
        // 【修复】将收集的故事线进度增量传递给控制塔
        if (collectedStorylineDeltas.length > 0) {
            delta.storyline_progress_deltas = collectedStorylineDeltas;
            this.info(`✓ 已收集 ${collectedStorylineDeltas.length} 条故事线进度增量，准备传递给控制塔`);
        }

        if (delta.rhythm_assessment || delta.storyline_progress_deltas) {
            this.engine.narrativeControlTowerManager.update(workingChapter, delta);
        }

        this.info("--- 状态更新Delta应用完毕 ---");
        return workingChapter;
    }
}
