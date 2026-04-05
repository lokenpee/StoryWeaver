// FILE: src/EntityContextManager.js

import { simpleHash } from '../utils/textUtils.js';
import { DebugLogger } from './utils/DebugLogger.js';

export class EntityContextManager {
    constructor(engine) {
        this.engine = engine;
        this.logger = new DebugLogger('EntityContextManager');
        this.entityManifestCache = null;
        this.lastStaticMatricesChecksum = null;
    }

    getOrGenerateEntityManifest() {
        const { currentChapter } = this.engine;
        this.logger.group('[ENGINE-V2-PROBE] 实体清单缓存管理');

        if (!currentChapter || !currentChapter.staticMatrices) {
            this.logger.warn('⚠️ Chapter 的 staticMatrices 不存在，无法生成清单');
            this.logger.groupEnd();
            return { content: '', totalCount: 0 };
        }

        const currentChecksum = simpleHash(JSON.stringify(currentChapter.staticMatrices));

        if (this.entityManifestCache && this.lastStaticMatricesChecksum === currentChecksum) {
            this.logger.log('✅ 缓存命中，直接返回已缓存的实体清单');
            this.logger.groupEnd();
            return this.entityManifestCache;
        }

        this.logger.log('♻️ 缓存失效或不存在，正在重新生成实体清单...');
        const manifest = this.generateEntityManifest(currentChapter.staticMatrices);

        this.entityManifestCache = manifest;
        this.lastStaticMatricesChecksum = currentChecksum;

        this.logger.log(`📦 清单已生成并缓存，共 ${manifest.totalCount} 条实体`);
        this.logger.groupEnd();

        return manifest;
    }

    generateEntityManifest(staticMatrices) {
        const manifestLines = [];
        let count = 0;

        if (staticMatrices.characters) {
            for (const charId in staticMatrices.characters) {
                const char = staticMatrices.characters[charId];
                const keywords = char.core?.keywords || char.keywords || [];
                manifestLines.push(`- ${charId}: ${char.core?.name || char.name || '未命名'} (${keywords.join(', ')})`);
                count++;
            }
        }

        if (staticMatrices.worldview) {
            ['locations', 'items', 'factions', 'concepts', 'events', 'races'].forEach(category => {
                if (staticMatrices.worldview[category]) {
                    for (const entityId in staticMatrices.worldview[category]) {
                        const entity = staticMatrices.worldview[category][entityId];
                        const keywords = entity.keywords || [];
                        const name = entity.name || entity.title || '未命名';
                        manifestLines.push(`- ${entityId}: ${name} (${keywords.join(', ')})`);
                        count++;
                    }
                }
            });
        }

        if (staticMatrices.storylines) {
            ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'].forEach(category => {
                if (staticMatrices.storylines[category]) {
                    for (const storylineId in staticMatrices.storylines[category]) {
                        const storyline = staticMatrices.storylines[category][storylineId];
                        manifestLines.push(`- ${storylineId}: ${storyline.title || '未命名'}`);
                        count++;
                    }
                }
            });
        }

        return {
            content: manifestLines.join('\n'),
            totalCount: count
        };
    }

    generateFullWorldviewContext() {
        const { currentChapter } = this.engine;
        this.logger.group('[ENGINE-FREE-ROAM] 生成完整世界观档案');

        const chapter = currentChapter;
        if (!chapter || !chapter.staticMatrices) {
            this.logger.warn('❌ 错误：无法获取章节数据');
            this.logger.groupEnd();
            return '';
        }

        const allEntityIds = [];

        if (chapter.staticMatrices.characters) {
            allEntityIds.push(...Object.keys(chapter.staticMatrices.characters));
        }

        if (chapter.staticMatrices.worldview) {
            for (const category of ['locations', 'items', 'factions', 'concepts', 'events', 'races']) {
                if (chapter.staticMatrices.worldview[category]) {
                    allEntityIds.push(...Object.keys(chapter.staticMatrices.worldview[category]));
                }
            }
        }

        if (chapter.staticMatrices.storylines) {
            for (const category of ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs']) {
                if (chapter.staticMatrices.storylines[category]) {
                    allEntityIds.push(...Object.keys(chapter.staticMatrices.storylines[category]));
                }
            }
        }

        this.logger.log(`📚 收集到 ${allEntityIds.length} 个实体ID`);

        const contextContent = this.retrieveEntitiesByIdsInternal(
            allEntityIds,
            '自由章模式完整档案'
        );

        const finalContent = contextContent ? contextContent : '';

        this.logger.log(`✅ 完整世界观档案生成完成，长度: ${finalContent.length} 字符`);
        this.logger.groupEnd();

        return finalContent;
    }

    generateChapterStaticContext(chapterContextIds, sourceChapter = null) {
        
        this.logger.group('[ENGINE-V3-PROBE] 章节级静态上下文生成');
        this.logger.log('章节规划实体ID列表:', chapterContextIds);

        if (!chapterContextIds || chapterContextIds.length === 0) {
            this.logger.log('ℹ️ 本章无预设实体');
            this.logger.groupEnd();
            return '';
        }

        const contextContent = this.retrieveEntitiesByIdsInternal(
            chapterContextIds,
            '章节级静态上下文',
            sourceChapter
        );

        const finalContent = contextContent ? [
            ``,
            `### 📂 章节级核心实体档案 (Chapter-Level Entity Archive)`,
            ``,
            `以下是本章规划涉及的核心实体。这些实体在整个章节中始终可用，你可以随时引用：`,
            ``,
            contextContent
        ].join('\n') : '';

        this.logger.log(`✅ 章节级静态上下文生成完成，长度 ${finalContent.length} 字符`);
        this.logger.log('生成的内容预览（前 200 字符）', finalContent.substring(0, 200));
        this.logger.groupEnd();

        return finalContent;
    }

    retrieveEntitiesByIdsInternal(entityIds, contextLabel = '上下文', sourceChapter = null) {
        const { currentChapter } = this.engine;
        this.logger.group(`[ENGINE-V3-PROBE] ${contextLabel}召回`);
        this.logger.log('需要召回的实体ID列表:', entityIds);

        if (!entityIds || entityIds.length === 0) {
            this.logger.log('ℹ️ 无需召回');
            this.logger.groupEnd();
            return '';
        }

        const chapter = sourceChapter || currentChapter;
        if (!chapter || !chapter.staticMatrices) {
            this.logger.warn('❌ 错误：无法获取 staticMatrices，章节对象为空');
            this.logger.groupEnd();
            return '';
        }

        const staticMatrices = chapter.staticMatrices;
        const retrievedEntities = [];

        for (const entityId of entityIds) {
            let entity = null;
            let category = '';

            if (staticMatrices.characters?.[entityId]) {
                entity = staticMatrices.characters[entityId];
                category = 'characters';
            }

            if (!entity && staticMatrices.worldview) {
                for (const worldCategory of ['locations', 'items', 'factions', 'concepts', 'events', 'races']) {
                    if (staticMatrices.worldview[worldCategory]?.[entityId]) {
                        entity = staticMatrices.worldview[worldCategory][entityId];
                        category = `worldview.${worldCategory}`;
                        break;
                    }
                }
            }

            if (!entity && staticMatrices.storylines) {
                let categoriesToSearch = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];

                if (entityId.startsWith('quest_')) {
                    categoriesToSearch = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];
                } else if (entityId.startsWith('arc_')) {
                    categoriesToSearch = ['relationship_arcs', 'personal_arcs', 'main_quests', 'side_quests'];
                }

                for (const storylineCategory of categoriesToSearch) {
                    if (staticMatrices.storylines[storylineCategory]?.[entityId]) {
                        entity = staticMatrices.storylines[storylineCategory][entityId];
                        category = `storylines.${storylineCategory}`;
                        break;
                    }
                }
            }

            if (entity) {
                if (entity.isHidden === true) {
                    this.logger.log(`🙈 跳过隐藏实体: ${entityId} (${category})`);
                    continue;
                }

                this.logger.log(`✅ 找到实体: ${entityId} (${category})`);
                retrievedEntities.push({
                    id: entityId,
                    category: category,
                    data: entity
                });
            } else {
                this.logger.warn(`⚠️ 未找到实体 ${entityId}`);

                if (entityId.startsWith('quest_') || entityId.startsWith('arc_')) {
                    this.logger.group('🔍 故事线ID诊断');
                    this.logger.log('当前 staticMatrices.storylines 结构:');
                    if (staticMatrices.storylines) {
                        for (const cat of ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs']) {
                            const ids = staticMatrices.storylines[cat] ? Object.keys(staticMatrices.storylines[cat]) : [];
                            this.logger.log(`  ${cat}:`, ids.length > 0 ? ids : '(空)');
                        }
                    } else {
                        this.logger.log('  storylines不存在');
                    }
                    this.logger.log('💡 建议: 如果这是新故事线，ID应该使用 NEW: 前缀');
                    this.logger.groupEnd();
                }
            }
        }

        this.logger.log(`📦 成功召回 ${retrievedEntities.length}/${entityIds.length} 个实体`);
        this.logger.groupEnd();

        if (retrievedEntities.length === 0) {
            return '';
        }

        return retrievedEntities.map(({ id, category, data }) => {
            return `### ${id} (${category})\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
        }).join('\n\n');
    }

    retrieveEntitiesByIds(realtimeContextIds) {
        const { currentChapter } = this.engine;
        this.logger.group('[ENGINE-V3-PROBE] 回合级动态上下文召回');
        this.logger.log('turnConductor 识别的实体ID:', realtimeContextIds);

        if (!realtimeContextIds || realtimeContextIds.length === 0) {
            this.logger.log('ℹ️ 无需召回');
            this.logger.groupEnd();
            return '';
        }

        const chapterContextIds = currentChapter?.chapter_blueprint?.chapter_context_ids || [];
        const outOfPlanIds = realtimeContextIds.filter(id => !chapterContextIds.includes(id));

        this.logger.log(`章节规划实体: ${chapterContextIds.length} 个`);
        this.logger.log(`规划外实体 ${outOfPlanIds.length} 个`, outOfPlanIds);

        if (outOfPlanIds.length === 0) {
            this.logger.log('✅ 所有识别的实体均已在章节级注入，无需额外召回');
            this.logger.groupEnd();
            return '';
        }

        const contextContent = this.retrieveEntitiesByIdsInternal(outOfPlanIds, '回合级动态上下文');
        this.logger.groupEnd();

        return contextContent;
    }
}
