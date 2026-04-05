// FILE: src/NarrativeControlTowerManager.js

import { DebugLogger } from './utils/DebugLogger.js';

export class NarrativeControlTowerManager {
    constructor(engine) {
        this.engine = engine;
        this.logger = new DebugLogger('NarrativeControlTowerManager');
    }

    // V11.0: 新的统一推进处理入口
    processAdvancement(advancementData, workingChapter) {
        const { info } = this.engine;
        info(`[NCT] 接收到推进信号: source=${advancementData.source}`);
        if (advancementData.source === 'storyline') {
            this._processStorylineAdvancement(advancementData, workingChapter);
        } else if (advancementData.source === 'relationship') {
            this._processRelationshipAdvancement(advancementData, workingChapter);
        }
    }

    _processStorylineAdvancement(data, chapter) {
        const { storyline_id, progress_delta, new_stage, reasoning } = data;
        const { info } = this.engine;

        if (!storyline_id || progress_delta === undefined) return;

        const tower = chapter.meta.narrative_control_tower;
        if (!tower.storyline_progress[storyline_id]) {
            tower.storyline_progress[storyline_id] = {
                current_progress: 0,
                current_stage: "unknown",
                pacing_curve: "default",
                last_increment: 0,
                threshold_alerts: []
            };
        }

        const sp = tower.storyline_progress[storyline_id];
        const previous_progress = sp.current_progress;
        sp.current_progress = Math.min(100, sp.current_progress + progress_delta);
        sp.last_increment = progress_delta;
        
        if (new_stage) {
            sp.current_stage = new_stage;
        }

        info(`  ✓ [NCT-Storyline] ${storyline_id} 进度: ${previous_progress}% -> ${sp.current_progress}% (+${progress_delta}%)。理由: ${reasoning}`);
    }

    _processRelationshipAdvancement(data, chapter) {
        const { char_id_from, char_id_to, weight, significance, reasoning } = data;
        const { info, warn } = this.engine;

        if (!char_id_from || !char_id_to || weight === undefined) return;
        
        info(`  ✓ [NCT-Relationship] ${char_id_from}-${char_id_to} 关系事件权重: ${weight}。性质: ${significance}。理由: ${reasoning}`);

        // 未来扩展：在这里添加逻辑，将关系事件的权重应用到相关的 `relationship_arc` 进度上，或影响全局节奏。
        warn(`[NCT-Stub] _processRelationshipAdvancement 功能暂未完全实现，仅记录信号。`);
    }


    update(workingChapter, delta) {
        const { info } = this.engine;
        this.logger.group('[ENGINE-V4] 更新空间控制塔流程');
        info(" -> 开始更新空间档案...");

        if (!workingChapter.meta.narrative_control_tower) {
            workingChapter.meta.narrative_control_tower = {
                recent_chapters_intensity: [],
                last_chapter_rhythm: null,
                storyline_progress: {},
                global_story_phase: {
                    phase: "setup",
                    phase_description: "故事刚刚开始，处于建立阶段",
                    overall_progress: 0,
                    distance_to_climax: "far"
                },
                device_cooldowns: {
                    spotlight_protocol: {
                        last_usage_chapter_uid: null,
                        recent_usage_count: 0,
                        usage_history: []
                    },
                    time_dilation: {
                        last_usage_chapter_uid: null,
                        recent_usage_count: 0,
                        usage_history: []
                    }
                },
                chekhov_guns: {},
                rhythm_directive: {
                    mandatory_constraints: [],
                    suggested_chapter_type: "Scene",
                    intensity_range: { min: 1, max: 10 },
                    impending_thresholds: [],
                    rhythm_dissonance_opportunities: [],
                    generated_at: null
                }
            };
            info(" -> 已初始化 narrative_control_tower");
        }

        const tower = workingChapter.meta.narrative_control_tower;

        // 🔧 防御性修复：确保关键字段存在，防止静态缓存数据导致崩溃
        if (!tower.recent_chapters_intensity) tower.recent_chapters_intensity = [];
        if (!tower.device_cooldowns) {
            tower.device_cooldowns = {
                spotlight_protocol: {
                    last_usage_chapter_uid: null,
                    recent_usage_count: 0,
                    usage_history: []
                },
                time_dilation: {
                    last_usage_chapter_uid: null,
                    recent_usage_count: 0,
                    usage_history: []
                }
            };
        }
        if (!tower.device_cooldowns.spotlight_protocol) {
            tower.device_cooldowns.spotlight_protocol = {
                last_usage_chapter_uid: null,
                recent_usage_count: 0,
                usage_history: []
            };
        }
        if (!tower.device_cooldowns.spotlight_protocol.usage_history) {
            tower.device_cooldowns.spotlight_protocol.usage_history = [];
        }
        if (!tower.device_cooldowns.time_dilation) {
            tower.device_cooldowns.time_dilation = {
                last_usage_chapter_uid: null,
                recent_usage_count: 0,
                usage_history: []
            };
        }
        if (!tower.device_cooldowns.time_dilation.usage_history) {
            tower.device_cooldowns.time_dilation.usage_history = [];
        }
        if (!tower.rhythm_directive) {
            tower.rhythm_directive = {
                mandatory_constraints: [],
                suggested_chapter_type: "Scene",
                intensity_range: { min: 1, max: 10 },
                impending_thresholds: [],
                rhythm_dissonance_opportunities: [],
                generated_at: null
            };
        }
        if (!tower.rhythm_directive.mandatory_constraints) tower.rhythm_directive.mandatory_constraints = [];
        if (!tower.rhythm_directive.impending_thresholds) tower.rhythm_directive.impending_thresholds = [];
        if (!tower.rhythm_directive.rhythm_dissonance_opportunities) tower.rhythm_directive.rhythm_dissonance_opportunities = [];
        if (!tower.storyline_progress) tower.storyline_progress = {};

        const rhythmData = delta.rhythm_assessment;

        if (rhythmData) {
            const intensityRecord = {
                chapter_uid: workingChapter.uid,
                emotional_intensity: rhythmData.emotional_intensity || 5,
                chapter_type: rhythmData.chapter_type || "Scene"
            };
            tower.recent_chapters_intensity.push(intensityRecord);
            info(`  ✓ [微调] 新增章节记录: intensity=${intensityRecord.emotional_intensity}, type=${intensityRecord.chapter_type}`);

            if (tower.recent_chapters_intensity.length > 5) {
                tower.recent_chapters_intensity = tower.recent_chapters_intensity.slice(-5);
            }

            tower.last_chapter_rhythm = {
                chapter_type: rhythmData.chapter_type,
                chapter_type_reasoning: rhythmData.chapter_type_reasoning || "",
                emotional_intensity: rhythmData.emotional_intensity,
                intensity_reasoning: rhythmData.intensity_reasoning || "",
                requires_cooldown: rhythmData.requires_cooldown || false,
                cooldown_reasoning: rhythmData.cooldown_reasoning || "",
                narrative_devices_used: rhythmData.narrative_devices_used || {},
                device_usage_details: rhythmData.device_usage_details || ""
            };
            info(`  ✓ [微调] 更新 last_chapter_rhythm`);

            if (rhythmData.recommended_next_phase || rhythmData.phase_transition_triggered) {
                if (!tower.narrative_rhythm_clock) {
                    tower.narrative_rhythm_clock = {
                        current_phase: "inhale",
                        phase_description: {},
                        cycle_count: 0,
                        last_phase_change_chapter: null,
                        current_phase_duration: 0,
                        recommended_next_phase: null,
                        phase_history: []
                    };
                }

                const clock = tower.narrative_rhythm_clock;
                const oldPhase = clock.current_phase;
                const newPhase = rhythmData.recommended_next_phase || oldPhase;
                const narrativeMode = workingChapter.meta?.narrative_control_tower?.narrative_mode;
                const currentMode = narrativeMode?.current_mode || 'classic_rpg';
                const modeConfig = narrativeMode?.mode_config?.[currentMode];

                if (rhythmData.phase_transition_triggered && newPhase !== oldPhase) {
                    if (oldPhase === 'pause' && newPhase === 'inhale') {
                        clock.cycle_count = (clock.cycle_count || 0) + 1;
                        info(`  ✓ [呼吸钟] 完成第 ${clock.cycle_count} 次呼吸循环`);
                    }

                    clock.phase_history.push({
                        phase: newPhase,
                        chapter_uid: workingChapter.uid,
                        reason: rhythmData.phase_transition_reasoning || '史官触发',
                        narrative_mode: currentMode
                    });
                    if (clock.phase_history.length > 5) {
                        clock.phase_history = clock.phase_history.slice(-5);
                    }

                    clock.current_phase = newPhase;
                    clock.last_phase_change_chapter = workingChapter.uid;
                    clock.current_phase_duration = 1;
                    info(`  ✓ [呼吸钟] 相位转换: ${oldPhase} → ${newPhase} [${currentMode === 'web_novel' ? '网文模式' : '经典模式'}]`);
                } else {
                    clock.current_phase_duration = (clock.current_phase_duration || 0) + 1;
                    info(`  ✓ [呼吸钟] 维持相位: ${oldPhase} (持续 ${clock.current_phase_duration} 章)`);

                    if (modeConfig?.phase_duration_modifiers && clock.current_phase_duration > 0) {
                        const modifier = modeConfig.phase_duration_modifiers[clock.current_phase] || 1.0;
                        const baseLimit = {
                            inhale: 3,
                            hold: 2,
                            exhale: 2,
                            pause: 2
                        }[clock.current_phase] || 2;

                        const adjustedLimit = Math.ceil(baseLimit * modifier);

                        if (clock.current_phase_duration >= adjustedLimit) {
                            info(`  ⚠️ [呼吸钟] ${currentMode}模式下,${clock.current_phase}相位已持续${clock.current_phase_duration}章,建议上限为${adjustedLimit}章`);
                        }
                    }
                }

                clock.recommended_next_phase = rhythmData.recommended_next_phase || null;
            }

            if (rhythmData.narrative_devices_used) {
                const cooldowns = tower.device_cooldowns;

                if (rhythmData.narrative_devices_used.spotlight_protocol) {
                    cooldowns.spotlight_protocol.last_usage_chapter_uid = workingChapter.uid;
                    cooldowns.spotlight_protocol.usage_history.push({
                        chapter_uid: workingChapter.uid,
                        emotional_weight: rhythmData.emotional_intensity,
                        trigger_reason: rhythmData.device_usage_details
                    });
                    cooldowns.spotlight_protocol.recent_usage_count = cooldowns.spotlight_protocol.usage_history
                        .filter(h => tower.recent_chapters_intensity.some(c => c.chapter_uid === h.chapter_uid))
                        .length;
                    if (cooldowns.spotlight_protocol.usage_history.length > 10) {
                        cooldowns.spotlight_protocol.usage_history = cooldowns.spotlight_protocol.usage_history.slice(-10);
                    }
                    info(`  ✓ [冷却] 更新 spotlight_protocol (recent_count=${cooldowns.spotlight_protocol.recent_usage_count})`);
                }

                if (rhythmData.narrative_devices_used.time_dilation) {
                    cooldowns.time_dilation.last_usage_chapter_uid = workingChapter.uid;
                    cooldowns.time_dilation.usage_history.push({
                        chapter_uid: workingChapter.uid,
                        emotional_weight: rhythmData.emotional_intensity,
                        trigger_reason: rhythmData.device_usage_details
                    });
                    cooldowns.time_dilation.recent_usage_count = cooldowns.time_dilation.usage_history
                        .filter(h => tower.recent_chapters_intensity.some(c => c.chapter_uid === h.chapter_uid))
                        .length;
                    if (cooldowns.time_dilation.usage_history.length > 10) {
                        cooldowns.time_dilation.usage_history = cooldowns.time_dilation.usage_history.slice(-10);
                    }
                    info(`  ✓ [冷却] 更新 time_dilation (recent_count=${cooldowns.time_dilation.recent_usage_count})`);
                }
            }
        }
        if (delta.storyline_progress_deltas && Array.isArray(delta.storyline_progress_deltas)) {
            delta.storyline_progress_deltas.forEach(item => {
                this.processAdvancement({ 
                    source: 'storyline', 
                    ...item 
                }, workingChapter);
            });
        }

        // 2. 处理关系叙事权重 (如果需要影响全局节奏或关系弧光)
        if (delta.relationship_advancements && Array.isArray(delta.relationship_advancements)) {
            delta.relationship_advancements.forEach(item => {
                this.processAdvancement({ 
                    source: 'relationship', 
                    char_id_from: item.subject_id, // 映射字段名
                    char_id_to: item.target_id,
                    ...item 
                }, workingChapter);
            });
        }
        this.syncStorylineProgressWithStorylines(workingChapter);
        this.calculateRhythmDirective(workingChapter);

        this.logger.log('[V4] 控制塔状态:', {
            recent_intensity: tower.recent_chapters_intensity,
            storyline_progress: tower.storyline_progress,
            rhythm_directive: tower.rhythm_directive
        });
        this.logger.groupEnd();
    }

    syncStorylineProgressWithStorylines(chapter) {
        if (!chapter) return;
        this.normalizeStorylineStaticData(chapter);
        const storylineMap = chapter.meta?.narrative_control_tower?.storyline_progress || {};
        const storylineProgressEntries = Object.entries(storylineMap);
        if (storylineProgressEntries.length === 0) {
            return;
        }
        storylineProgressEntries.forEach(([storylineId, progressInfo]) => {
            this.materializeStorylineProgressEntry(chapter, storylineId, progressInfo);
        });
    }

    normalizeStorylineStaticData(chapter) {
        const storylines = chapter?.staticMatrices?.storylines;
        if (!storylines) return;
        const categories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];
        const toText = (value) => {
            if (typeof value === 'string') return value;
            if (value === undefined || value === null) return '';
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        };

        categories.forEach(category => {
            const bucket = storylines[category];
            if (!bucket) return;
            Object.entries(bucket).forEach(([lineId, entry]) => {
                if (!entry || typeof entry !== 'object') return;
                let patched = false;
                if (!entry.summary || entry.summary === '') {
                    if (entry.initial_summary) {
                        entry.summary = toText(entry.initial_summary);
                        patched = true;
                    } else if (entry.description) {
                        entry.summary = toText(entry.description);
                        patched = true;
                    }
                }
                if (!entry.initial_summary && entry.summary) {
                    entry.initial_summary = entry.summary;
                    patched = true;
                }
                if (patched) {
                    this.logger.log(`[StorylineNormalize] ${category}/${lineId} 摘要字段已校准`);
                }
            });
        });
    }

    materializeStorylineProgressEntry(chapter, storylineId, progressInfo = {}, options = {}) {
        const { warn, info } = this.engine;
        if (!chapter || !storylineId) return;
        const staticStorylines = chapter.staticMatrices?.storylines;
        const dynamicStorylines = chapter.dynamicState?.storylines;
        if (!staticStorylines || !dynamicStorylines) return;

        const metadataSources = [];
        if (options.extraSource) {
            metadataSources.push(options.extraSource);
        }
        if (progressInfo.metadata && typeof progressInfo.metadata === 'object') {
            metadataSources.push(progressInfo.metadata);
        }
        metadataSources.push(progressInfo);

        const pickValue = (keys) => {
            for (const source of metadataSources) {
                if (!source || typeof source !== 'object') continue;
                for (const key of keys) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        const value = source[key];
                        if (value !== undefined && value !== null && value !== '') {
                            return value;
                        }
                    }
                }
            }
            return undefined;
        };

        const title = pickValue(['storyline_title', 'title', 'name']);
        const summary = pickValue(['storyline_summary', 'summary', 'current_summary', 'delta_reasoning']);
        const typeHint = pickValue(['storyline_type', 'type']);
        const categoryHint = pickValue(['storyline_category', 'category']);
        const trigger = pickValue(['storyline_trigger', 'trigger']);
        const involvedChars = pickValue(['involved_chars']);
        const playerSupplement = pickValue(['player_supplement']);
        const currentStatus = pickValue(['current_status']);
        const currentSummary = pickValue(['current_summary', 'delta_reasoning', 'storyline_summary', 'summary']);

        const resolvedCategory = this.resolveStorylineCategory(storylineId, {
            storyline_category: categoryHint,
            storyline_type: typeHint
        });

        if (!resolvedCategory) {
            warn(`[StorylineNetwork] 无法识别故事线 ${storylineId} 的分类，跳过实体化。`);
            return;
        }

        if (!staticStorylines[resolvedCategory]) {
            staticStorylines[resolvedCategory] = {};
        }
        if (!dynamicStorylines[resolvedCategory]) {
            dynamicStorylines[resolvedCategory] = {};
        }

        const staticBucket = staticStorylines[resolvedCategory];
        const dynamicBucket = dynamicStorylines[resolvedCategory];

        const safeTitle = title || storylineId;
        const safeSummary = summary || '建筑师未撰写摘要。';
        const safeType = typeHint || resolvedCategory;
        const safeTrigger = trigger || '剧情触发器';
        const safeInvolved = Array.isArray(involvedChars) ? involvedChars : [];

        let createdPlaceholder = false;

        if (!staticBucket[storylineId]) {
            staticBucket[storylineId] = {
                title: safeTitle,
                summary: safeSummary,
                initial_summary: safeSummary,
                trigger: safeTrigger,
                type: safeType,
                involved_chars: safeInvolved
            };
            createdPlaceholder = true;
        } else {
            const staticEntry = staticBucket[storylineId];
            if (!staticEntry.title && safeTitle) staticEntry.title = safeTitle;
            if ((!staticEntry.summary || staticEntry.summary === '') && safeSummary) {
                staticEntry.summary = safeSummary;
            }
            if ((!staticEntry.initial_summary || staticEntry.initial_summary === '') && (safeSummary || staticEntry.summary)) {
                staticEntry.initial_summary = staticEntry.summary || safeSummary;
            }
            if (!staticEntry.type && safeType) staticEntry.type = safeType;
            if (!staticEntry.trigger && trigger) staticEntry.trigger = safeTrigger;
            if ((!staticEntry.involved_chars || staticEntry.involved_chars.length === 0) && safeInvolved.length > 0) {
                staticEntry.involved_chars = safeInvolved;
            }
        }

        if (!dynamicBucket[storylineId]) {
            dynamicBucket[storylineId] = {
                current_status: currentStatus || 'active',
                current_summary: currentSummary || safeSummary,
                history: [],
                player_supplement: playerSupplement || ''
            };
            createdPlaceholder = true;
        } else {
            const dynamicEntry = dynamicBucket[storylineId];
            if (!dynamicEntry.current_status && currentStatus) {
                dynamicEntry.current_status = currentStatus;
            }
            if ((!dynamicEntry.current_summary || dynamicEntry.current_summary === '尚未记录进展') && (currentSummary || safeSummary)) {
                dynamicEntry.current_summary = currentSummary || safeSummary;
            }
            if (!dynamicEntry.player_supplement && playerSupplement) {
                dynamicEntry.player_supplement = playerSupplement;
            }
        }

        if (progressInfo) {
            if (!progressInfo.metadata || typeof progressInfo.metadata !== 'object') {
                progressInfo.metadata = {};
            }
            const metadata = progressInfo.metadata;
            if (safeTitle && !metadata.storyline_title) metadata.storyline_title = safeTitle;
            if (safeSummary && !metadata.storyline_summary) metadata.storyline_summary = safeSummary;
            if (safeType && !metadata.storyline_type) metadata.storyline_type = safeType;
            if (resolvedCategory && !metadata.storyline_category) metadata.storyline_category = resolvedCategory;
            if (safeTrigger && !metadata.storyline_trigger) metadata.storyline_trigger = safeTrigger;
            if (Array.isArray(safeInvolved) && safeInvolved.length > 0 && (!Array.isArray(metadata.involved_chars) || metadata.involved_chars.length === 0)) {
                metadata.involved_chars = safeInvolved;
            }
        }

        if (createdPlaceholder) {
            info(`[StorylineNetwork] 为 ${storylineId} 生成可编辑占位符（${resolvedCategory}类）`);
        }
    }

    resolveStorylineCategory(storylineId, hints = {}) {
        const normalize = (value) => {
            if (value === undefined || value === null) return '';
            return value.toString().trim().toLowerCase().replace(/[\s_-]+/g, '');
        };

        const categorySynonyms = {
            main_quests: ['mainquests', 'mainquest', 'main', '主线', '主幹', 'campaign', 'saga', 'primary'],
            side_quests: ['sidequests', 'sidequest', 'side', '支线', '支幹', 'branch', 'optional'],
            relationship_arcs: ['relationshiparcs', 'relationship', 'romance', '关系', '羁', '羁绊', 'bond'],
            personal_arcs: ['personalarcs', 'personal', 'characterarc', 'character', '角色', '成长', '历程', 'arc']
        };

        const matchCategory = (value, allowPartial = false) => {
            if (!value) return null;
            for (const [category, synonyms] of Object.entries(categorySynonyms)) {
                for (const synonym of synonyms) {
                    if (value === synonym) {
                        return category;
                    }
                    if (allowPartial && value.includes(synonym)) {
                        return category;
                    }
                }
            }
            return null;
        };

        const explicitHint = normalize(hints.storyline_category || hints.category);
        const explicitMatch = matchCategory(explicitHint);
        if (explicitMatch) return explicitMatch;

        const typeHint = normalize(hints.storyline_type || hints.type);
        const typeMatch = matchCategory(typeHint, true);
        if (typeMatch) return typeMatch;

        const idHint = normalize(storylineId);
        const idMatch = matchCategory(idHint, true);
        if (idMatch) return idMatch;

        return 'personal_arcs';
    }

    calculateRhythmDirective(workingChapter) {
        const { info } = this.engine;
        const tower = workingChapter.meta.narrative_control_tower;
        const directive = tower.rhythm_directive;

        directive.mandatory_constraints = [];
        directive.impending_thresholds = [];
        directive.rhythm_dissonance_opportunities = [];

        const lastRhythm = tower.last_chapter_rhythm;
        if (lastRhythm?.requires_cooldown) {
            directive.mandatory_constraints.push("cooldown_required");
            directive.intensity_range = { min: 1, max: 5 };
            directive.suggested_chapter_type = "Sequel";
            info(`  ✓ [指令] 强制冷却: 下一章需要冷却`);
        } else {
            directive.intensity_range = { min: 1, max: 10 };
            directive.suggested_chapter_type = "Scene";
        }

        const spotlightCooldown = tower.device_cooldowns.spotlight_protocol;
        if (spotlightCooldown.recent_usage_count >= 2) {
            directive.mandatory_constraints.push("spotlight_forbidden");
            info(`  ✓ [指令] 聚光灯禁用: 最近5章使用 ${spotlightCooldown.recent_usage_count} 次`);
        }

        for (const [storylineId, progress] of Object.entries(tower.storyline_progress)) {
            const thresholds = [
                { value: 15, name: "inciting_incident" },
                { value: 25, name: "first_turning_point" },
                { value: 50, name: "midpoint" },
                { value: 75, name: "climax_approach" },
                { value: 90, name: "resolution" }
            ];

            for (const threshold of thresholds) {
                if (progress.current_progress < threshold.value &&
                    progress.current_progress >= threshold.value - 10) {
                    directive.impending_thresholds.push({
                        storyline_id: storylineId,
                        threshold: threshold.name,
                        progress: progress.current_progress,
                        trigger_at: threshold.value
                    });
                }
            }
        }

        const progressEntries = Object.entries(tower.storyline_progress);
        if (progressEntries.length >= 2) {
            let maxProgress = { id: null, value: 0 };
            let minProgress = { id: null, value: 100 };

            for (const [id, p] of progressEntries) {
                if (p.current_progress > maxProgress.value) {
                    maxProgress = { id, value: p.current_progress };
                }
                if (p.current_progress < minProgress.value) {
                    minProgress = { id, value: p.current_progress };
                }
            }

            const gap = maxProgress.value - minProgress.value;
            if (gap >= 40) {
                directive.rhythm_dissonance_opportunities.push({
                    description: `${maxProgress.id}(${maxProgress.value}%)进度领先，${minProgress.id}(${minProgress.value}%)落后${gap}%，可利用制造张力或回顾。`
                });
                info(`  ✓ [指令] 检测到故事线失衡: ${gap}% 差距`);
            }
        }

        directive.generated_at = new Date().toISOString();
        info(`  ✓ [指令] rhythm_directive 生成完毕`);
    }
}
