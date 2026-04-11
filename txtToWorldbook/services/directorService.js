export function createDirectorService(deps = {}) {
    const {
        AppState,
        Logger,
        callDirectorAPI,
        getLanguagePrefix,
        debugLog,
        updateStreamContent,
    } = deps;

    function directorDebug(msg) {
        if (typeof debugLog === 'function') {
            debugLog(`[Director] ${msg}`);
        }
    }

    function directorWarn(msg, detail = '') {
        const suffix = detail ? ` | ${detail}` : '';
        Logger?.warn?.('Director', `${msg}${suffix}`);
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`⚠️ [导演] ${msg}${suffix}\n`);
        }
    }

    function directorInfo(msg) {
        Logger?.info?.('Director', msg);
        directorDebug(msg);
    }

    function toShortText(text, maxLen = 180) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
    }

    const SPLIT_TYPES = new Set([
        'scene_change',
        'time_jump',
        'goal_shift',
        'conflict_closed',
    ]);
    const LEGACY_SPLIT_TYPE_MAP = {
        scene_switch: 'scene_change',
        situation_change: 'scene_change',
        action_closed: 'conflict_closed',
        dialogue_closed: 'conflict_closed',
        plot_twist: 'conflict_closed',
        perspective_switch: 'scene_change',
        relationship_shift: 'conflict_closed',
        revelation: 'conflict_closed',
        decision_point: 'goal_shift',
        emotional_turn: 'conflict_closed',
        interaction_point: 'goal_shift',
        scene_change: 'scene_change',
        time_skip: 'time_jump',
        time_jump: 'time_jump',
        goal_shift: 'goal_shift',
        conflict_closed: 'conflict_closed',
        '场景明显切换': 'scene_change',
        '时间明显跳转': 'time_jump',
        '人物核心目标完全改变': 'goal_shift',
        '完整冲突闭环结束': 'conflict_closed',
        '一个完整冲突/行动闭环结束': 'conflict_closed',
    };

    function normalizeSplitType(type) {
        const raw = String(type || '').trim();
        if (SPLIT_TYPES.has(raw)) return raw;
        if (LEGACY_SPLIT_TYPE_MAP[raw]) return LEGACY_SPLIT_TYPE_MAP[raw];
        return 'goal_shift';
    }

    function normalizeSplitRule(rawRule = {}) {
        const source = rawRule && typeof rawRule === 'object' ? rawRule : {};
        const primary = normalizeSplitType(source.primary || source.rule || source.main || source.type || 'goal_shift');
        const rationale = String(source.rationale || source.reason || '').trim()
            || `选择 ${primary} 以保持叙事单元完整并避免事件被切开。`;
        return {
            primary,
            rationale,
        };
    }

    function getPreviousBeatTail(beats, stageIdx, tailChars = 100) {
        if (!Array.isArray(beats) || stageIdx <= 0) return '';
        const previousBeat = beats[stageIdx - 1];
        const previousOriginal = String(previousBeat?.original_text || '').trim();
        if (!previousOriginal) return '';
        return previousOriginal.slice(Math.max(0, previousOriginal.length - tailChars));
    }

    function buildSplitRuleHint(beat) {
        const splitRule = beat?.split_rule && typeof beat.split_rule === 'object'
            ? beat.split_rule
            : normalizeSplitRule({});
        const primary = normalizeSplitType(splitRule.primary || 'goal_shift');
        const rationale = String(splitRule.rationale || splitRule.reason || '').trim() || '未提供规则理由';
        return `规则: ${primary} | 理由: ${rationale}`;
    }

    function normalizeBeat(rawBeat, idx) {
        const source = rawBeat && typeof rawBeat === 'object' ? rawBeat : {};
        const tags = Array.isArray(source.tags)
            ? source.tags.map((t) => toShortText(t, 16)).filter(Boolean).slice(0, 4)
            : [];
        return {
            id: String(source.id || `b${idx + 1}`),
            summary: toShortText(source.event_summary || source.eventSummary || source.summary || source.event || source.description || `事件点${idx + 1}`, 100),
            exitCondition: toShortText(
                source.exitCondition
                || source.exit_condition
                || source.exist_condition
                || source.existCondition
                || source['exist condition']
                || '等待关键互动完成',
                100
            ),
            tags,
            original_text: typeof source.original_text === 'string'
                ? source.original_text
                : (typeof source.originalText === 'string' ? source.originalText : ''),
            split_rule: normalizeSplitRule(source.split_rule || source.splitRule || {}),
        };
    }

    function splitBeatCandidates(text, limit = 6) {
        return String(text || '')
            .split(/[，,。；;、\n]/)
            .map((part) => toShortText(part, 60))
            .filter(Boolean)
            .slice(0, limit);
    }

    function ensureMinimumBeatCount(beats, fallbackText = '') {
        const normalized = Array.isArray(beats)
            ? beats.map((beat, idx) => normalizeBeat(beat, idx)).slice(0, 8)
            : [];
        const minCount = 3;
        if (normalized.length >= minCount) {
            return normalized;
        }

        const seen = new Set(normalized.map((beat) => beat.summary));
        const candidates = splitBeatCandidates(fallbackText, 8);
        for (const candidate of candidates) {
            if (normalized.length >= minCount) break;
            if (!candidate || seen.has(candidate)) continue;
            normalized.push(normalizeBeat({
                summary: candidate,
                exitCondition: '出现明显推进动作或关键信息变化',
            }, normalized.length));
            seen.add(candidate);
        }

        const genericFallback = [
            '继续在当前场景搜集线索并形成判断',
            '与关键角色或环境发生互动以验证线索',
            '在确认新信息后推进到下一步行动',
        ];
        for (const fallback of genericFallback) {
            if (normalized.length >= minCount) break;
            if (seen.has(fallback)) continue;
            normalized.push(normalizeBeat({
                summary: fallback,
                exitCondition: '出现明确行动决策或关键反馈',
            }, normalized.length));
            seen.add(fallback);
        }

        return normalized.slice(0, 8).map((beat, idx) => normalizeBeat(beat, idx));
    }

    function ensureChapterBeats(memory) {
        if (!memory || !memory.chapterScript || typeof memory.chapterScript !== 'object') {
            return [];
        }

        if (!Array.isArray(memory.chapterScript.beats)) {
            memory.chapterScript.beats = [];
        }

        if (memory.chapterScript.beats.length > 0) {
            memory.chapterScript.beats = ensureMinimumBeatCount(
                memory.chapterScript.beats,
                `${memory.chapterOutline || ''} ${memory.chapterScript.flow || ''}`
            );
            return memory.chapterScript.beats;
        }

        const keyNodes = Array.isArray(memory.chapterScript.keyNodes)
            ? memory.chapterScript.keyNodes.map((n) => toShortText(n, 80)).filter(Boolean)
            : [];

        memory.chapterScript.beats = ensureMinimumBeatCount(
            keyNodes.map((node, idx) => normalizeBeat({ summary: node }, idx)),
            `${memory.chapterOutline || ''} ${keyNodes.join('，')}`
        );
        return memory.chapterScript.beats;
    }

    function extractJsonObject(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;

        const cleaned = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {
            // noop
        }

        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                const parsed = JSON.parse(cleaned.slice(start, end + 1));
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) {
                return null;
            }
        }

        return null;
    }

    function getLatestDialogue(eventData) {
        const lines = [];

        const eventChat = Array.isArray(eventData?.chat) ? eventData.chat : [];
        if (eventChat.length > 0) {
            let lastUser = '';
            let lastAssistant = '';

            for (let i = eventChat.length - 1; i >= 0; i--) {
                const item = eventChat[i] || {};
                const content = String(item.content || item.mes || '').trim();
                if (!content) continue;

                const role = item.role || (item.is_user ? 'user' : 'assistant');
                if (!lastUser && role === 'user') {
                    lastUser = content;
                }
                if (!lastAssistant && role === 'assistant') {
                    lastAssistant = content;
                }
                if (lastUser && lastAssistant) break;
            }

            if (lastAssistant) lines.push(`AI:${toShortText(lastAssistant, 320)}`);
            if (lastUser) lines.push(`用户:${toShortText(lastUser, 320)}`);
        }

        if (lines.length > 0) {
            return lines.join('\n');
        }

        try {
            const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
            if (!st || typeof st.getContext !== 'function') return '无最近对话';
            const chat = Array.isArray(st.getContext()?.chat) ? st.getContext().chat : [];
            if (chat.length === 0) return '无最近对话';

            let lastUser = '';
            let lastAssistant = '';
            for (let i = chat.length - 1; i >= 0; i--) {
                const item = chat[i] || {};
                const content = String(item.mes || item.content || '').trim();
                if (!content) continue;
                if (!lastUser && item.is_user) lastUser = content;
                if (!lastAssistant && !item.is_user) lastAssistant = content;
                if (lastUser && lastAssistant) break;
            }
            if (lastAssistant) lines.push(`AI:${toShortText(lastAssistant, 320)}`);
            if (lastUser) lines.push(`用户:${toShortText(lastUser, 320)}`);
        } catch (_) {
            return '无最近对话';
        }

        return lines.length > 0 ? lines.join('\n') : '无最近对话';
    }

    function getLatestUserMessage(eventData) {
        const eventChat = Array.isArray(eventData?.chat) ? eventData.chat : [];
        if (eventChat.length > 0) {
            for (let i = eventChat.length - 1; i >= 0; i--) {
                const item = eventChat[i] || {};
                const role = item.role || (item.is_user ? 'user' : 'assistant');
                if (role !== 'user') continue;
                const content = String(item.content || item.mes || '').trim();
                if (content) return content;
            }
        }

        try {
            const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
            const chat = Array.isArray(st?.getContext?.()?.chat) ? st.getContext().chat : [];
            for (let i = chat.length - 1; i >= 0; i--) {
                const item = chat[i] || {};
                if (!item.is_user) continue;
                const content = String(item.mes || item.content || '').trim();
                if (content) return content;
            }
        } catch (_) {
            return '';
        }

        return '';
    }

    const INTENT_LABELS = {
        advance: 'advance',
        stay: 'stay',
        neutral: 'neutral',
        switch_scene: 'switch_scene',
        skip: 'skip',
        investigate: 'investigate',
        search: 'search',
        explore: 'explore',
        travel: 'travel',
        dialogue: 'dialogue',
        negotiate: 'negotiate',
        reflect: 'reflect',
        plan: 'plan',
        rest: 'rest',
        stealth: 'stealth',
        combat: 'combat',
        summarize: 'summarize',
        clarify: 'clarify',
        request_hint: 'request_hint',
        meta: 'meta',
    };

    const INTENT_ALIASES = new Map([
        ['advance', INTENT_LABELS.advance],
        ['推进', INTENT_LABELS.advance],
        ['continue', INTENT_LABELS.advance],
        ['go', INTENT_LABELS.advance],
        ['forward', INTENT_LABELS.advance],
        ['stay', INTENT_LABELS.stay],
        ['hold', INTENT_LABELS.stay],
        ['停留', INTENT_LABELS.stay],
        ['neutral', INTENT_LABELS.neutral],
        ['switch_scene', INTENT_LABELS.switch_scene],
        ['switch', INTENT_LABELS.switch_scene],
        ['scene_switch', INTENT_LABELS.switch_scene],
        ['切换', INTENT_LABELS.switch_scene],
        ['skip', INTENT_LABELS.skip],
        ['fast_forward', INTENT_LABELS.skip],
        ['跳过', INTENT_LABELS.skip],
        ['investigate', INTENT_LABELS.investigate],
        ['调查', INTENT_LABELS.investigate],
        ['search', INTENT_LABELS.search],
        ['寻找', INTENT_LABELS.search],
        ['explore', INTENT_LABELS.explore],
        ['探索', INTENT_LABELS.explore],
        ['travel', INTENT_LABELS.travel],
        ['前往', INTENT_LABELS.travel],
        ['dialogue', INTENT_LABELS.dialogue],
        ['talk', INTENT_LABELS.dialogue],
        ['对话', INTENT_LABELS.dialogue],
        ['negotiate', INTENT_LABELS.negotiate],
        ['交涉', INTENT_LABELS.negotiate],
        ['reflect', INTENT_LABELS.reflect],
        ['回忆', INTENT_LABELS.reflect],
        ['plan', INTENT_LABELS.plan],
        ['计划', INTENT_LABELS.plan],
        ['rest', INTENT_LABELS.rest],
        ['休息', INTENT_LABELS.rest],
        ['stealth', INTENT_LABELS.stealth],
        ['潜行', INTENT_LABELS.stealth],
        ['combat', INTENT_LABELS.combat],
        ['战斗', INTENT_LABELS.combat],
        ['summarize', INTENT_LABELS.summarize],
        ['总结', INTENT_LABELS.summarize],
        ['clarify', INTENT_LABELS.clarify],
        ['澄清', INTENT_LABELS.clarify],
        ['request_hint', INTENT_LABELS.request_hint],
        ['提示', INTENT_LABELS.request_hint],
        ['meta', INTENT_LABELS.meta],
        ['规则', INTENT_LABELS.meta],
    ]);

    function normalizeIntentLabel(rawLabel) {
        const text = String(rawLabel || '').trim();
        if (!text) return '';
        const lower = text.toLowerCase();
        if (INTENT_ALIASES.has(lower)) return INTENT_ALIASES.get(lower);
        if (INTENT_ALIASES.has(text)) return INTENT_ALIASES.get(text);
        return '';
    }

    function detectUserIntent(userMessage) {
        const text = String(userMessage || '').trim();
        if (!text) {
            return { kind: INTENT_LABELS.neutral, signal: '', confidence: 0.2, source: 'rule' };
        }

        const negationPattern = /(不|别|不要|先不|先别|暂时不要|先别去)/;

        const ruleSets = [
            {
                kind: INTENT_LABELS.stay,
                signal: 'stay-command',
                score: 9,
                patterns: [/停留|先不|先别|慢一点|等等|别推进|不要推进|不推进|先观察|继续聊|原地|等等再说|先看看/],
            },
            {
                kind: INTENT_LABELS.skip,
                signal: 'skip-command',
                score: 8,
                patterns: [/跳过|快进|略过|直接到|直接进入|跳到下一/],
            },
            {
                kind: INTENT_LABELS.switch_scene,
                signal: 'scene-switch',
                score: 7,
                patterns: [/切换场景|转场|换个地方|换个地点|离开这里|去到|进入新地点/],
            },
            {
                kind: INTENT_LABELS.investigate,
                signal: 'investigate',
                score: 6,
                patterns: [/调查|追踪|侦查|盘查|搜查|查看线索|找线索/],
            },
            {
                kind: INTENT_LABELS.search,
                signal: 'search',
                score: 6,
                patterns: [/寻找|搜索|搜寻|翻找|找一找|查找/],
            },
            {
                kind: INTENT_LABELS.explore,
                signal: 'explore',
                score: 6,
                patterns: [/探索|试探|查看周围|四处看看|环顾|走走看/],
            },
            {
                kind: INTENT_LABELS.travel,
                signal: 'travel',
                score: 6,
                patterns: [/前往|出发|赶往|去往|动身|离开/],
            },
            {
                kind: INTENT_LABELS.dialogue,
                signal: 'dialogue',
                score: 5,
                patterns: [/对话|交谈|聊聊|说说|问问|沟通|搭话/],
            },
            {
                kind: INTENT_LABELS.negotiate,
                signal: 'negotiate',
                score: 5,
                patterns: [/交涉|谈判|说服|劝说|威胁|试探口风/],
            },
            {
                kind: INTENT_LABELS.reflect,
                signal: 'reflect',
                score: 5,
                patterns: [/回忆|回想|梳理|思考一下|整理一下/],
            },
            {
                kind: INTENT_LABELS.plan,
                signal: 'plan',
                score: 5,
                patterns: [/计划|策划|商量一下|制定方案|下一步怎么做/],
            },
            {
                kind: INTENT_LABELS.rest,
                signal: 'rest',
                score: 4,
                patterns: [/休息|歇一歇|停下来|缓一缓/],
            },
            {
                kind: INTENT_LABELS.stealth,
                signal: 'stealth',
                score: 4,
                patterns: [/潜行|偷偷|隐蔽|躲起来|保持低调/],
            },
            {
                kind: INTENT_LABELS.combat,
                signal: 'combat',
                score: 6,
                patterns: [/战斗|攻击|出手|动手|开打|对抗/],
            },
            {
                kind: INTENT_LABELS.summarize,
                signal: 'summarize',
                score: 4,
                patterns: [/总结|概括|回顾一下|复盘/],
            },
            {
                kind: INTENT_LABELS.clarify,
                signal: 'clarify',
                score: 4,
                patterns: [/澄清|说明一下|解释一下|再说清楚/],
            },
            {
                kind: INTENT_LABELS.request_hint,
                signal: 'request-hint',
                score: 4,
                patterns: [/提示一下|给点提示|线索提示|帮我引导/],
            },
            {
                kind: INTENT_LABELS.meta,
                signal: 'meta',
                score: 3,
                patterns: [/规则|设定|玩法|系统说明|世界观设定/],
            },
            {
                kind: INTENT_LABELS.advance,
                signal: 'advance',
                score: 7,
                patterns: [/推进|继续|下一步|往前|向前|前进|行动|开始吧|继续剧情/],
            },
        ];

        let best = { kind: INTENT_LABELS.neutral, signal: '', score: 0 };
        for (const rule of ruleSets) {
            if (rule.patterns.some((pattern) => pattern.test(text))) {
                let score = rule.score;
                if (negationPattern.test(text) && [INTENT_LABELS.advance, INTENT_LABELS.travel, INTENT_LABELS.switch_scene].includes(rule.kind)) {
                    score -= 5;
                }
                if (score > best.score) {
                    best = { kind: rule.kind, signal: rule.signal, score };
                }
            }
        }

        if (best.score <= 0) {
            return { kind: INTENT_LABELS.neutral, signal: '', confidence: 0.25, source: 'rule' };
        }

        const confidence = Math.max(0.35, Math.min(0.95, best.score / 10));
        return { kind: best.kind, signal: best.signal, confidence, source: 'rule' };
    }

    function resolveUserIntent({ modelIntent, ruleIntent }) {
        const modelKind = normalizeIntentLabel(modelIntent?.kind || modelIntent?.label || modelIntent);
        const modelConfidence = Number.isFinite(Number(modelIntent?.confidence))
            ? Math.max(0, Math.min(1, Number(modelIntent.confidence)))
            : 0;

        if (modelKind && modelConfidence >= 0.6 && (ruleIntent?.confidence || 0) < 0.75) {
            return {
                kind: modelKind,
                confidence: modelConfidence,
                source: 'model',
                rationale: toShortText(modelIntent?.rationale || modelIntent?.reason || '', 160),
            };
        }

        if (ruleIntent?.kind && ruleIntent.kind !== INTENT_LABELS.neutral) {
            return {
                kind: ruleIntent.kind,
                confidence: ruleIntent.confidence || 0.6,
                source: 'rule',
                rationale: ruleIntent.signal || '',
            };
        }

        if (modelKind) {
            return {
                kind: modelKind,
                confidence: modelConfidence || 0.5,
                source: 'model',
                rationale: toShortText(modelIntent?.rationale || modelIntent?.reason || '', 160),
            };
        }

        return {
            kind: INTENT_LABELS.neutral,
            confidence: 0.2,
            source: 'fallback',
            rationale: '',
        };
    }

    function parseAdvanceFlag(rawValue) {
        if (typeof rawValue === 'boolean') return rawValue;
        if (Number.isFinite(rawValue)) return Number(rawValue) > 0;

        const text = String(rawValue || '').trim();
        if (!text) return null;
        const lower = text.toLowerCase();

        if (['true', '1', 'yes', 'y', 'switch', 'advance'].includes(lower)) return true;
        if (['false', '0', 'no', 'n', 'stay', 'hold'].includes(lower)) return false;
        if (/推进|前进|切换|下一步|继续|转场/.test(text)) return true;
        if (/停留|保持|不推进|先别|等等|不要推进/.test(text)) return false;

        return null;
    }

    function buildDirectorPrompt({ chapterTitle, chapterOutline, currentBeatIdx, beats, latestDialogue }) {
        const compactBeats = beats.map((beat, idx) => ({
            idx,
            id: beat.id,
            summary: beat.summary,
            exitCondition: beat.exitCondition,
            tags: beat.tags,
        }));
        const currentBeat = beats[currentBeatIdx] || beats[0] || null;
        const currentOriginal = String(currentBeat?.original_text || '').trim();
        const currentOriginalForPrompt = currentOriginal
            ? `${currentOriginal.slice(0, 1800)}${currentOriginal.length > 1800 ? '\n...(已截断)' : ''}`
            : '无';
        const previousTail = getPreviousBeatTail(beats, currentBeatIdx, 100) || '无';
        const splitRuleHint = buildSplitRuleHint(currentBeat);

        const prefix = getLanguagePrefix ? getLanguagePrefix() : '';
        return `${prefix}${[
            '你是“互动小说导演”。你的职责是：综合上下文判断本回合是否推进节拍，并输出给演员AI可直接执行的演出框架。',
            '',
            '核心原则：',
            '1) 用户意图只能作为证据，不能单独决定 should_advance。',
            '2) 你要结合：当前节拍原文、最近对话（用户+AI）、上一节拍承接来判断。',
            '3) 若 should_advance=true，必须给出 narrative_bridge（1-2句，40-120字）交代中间过渡，避免跳切割裂。',
            '4) 必须基于当前节拍原文证据输出 direction_script（起点-过程-终点），演员将按这个框架执行。',
            '',
            '输出硬规则：',
            '1) 只输出 JSON，不要代码块，不要解释文字。',
            '2) confidence、intent_confidence 必须是 0-1 数字。',
            '3) direction_script.steps 必须是 2-4 条短步骤。',
            '4) 证据不足时应保守处理：should_advance=false。',
            '',
            '允许的 user_intent 标签：advance, stay, neutral, switch_scene, skip, investigate, search, explore, travel, dialogue, negotiate, reflect, plan, rest, stealth, combat, summarize, clarify, request_hint, meta。',
            '',
            `章节：${chapterTitle}`,
            `本章摘要：${chapterOutline}`,
            `当前阶段索引：${currentBeatIdx}`,
            `当前节拍规则提示：${splitRuleHint}`,
            '',
            '节拍列表（供定位阶段）：',
            JSON.stringify(compactBeats, null, 2),
            '',
            '上一节拍尾部承接（最多100字）：',
            previousTail,
            '',
            '当前节拍原文证据（优先依据）：',
            currentOriginalForPrompt,
            '',
            '最近对话：',
            latestDialogue,
            '',
            '输出 JSON 模板：',
            '{',
            '  "stage_idx": 0,',
            '  "should_advance": false,',
            '  "confidence": 0.72,',
            '  "user_intent": "advance",',
            '  "intent_confidence": 0.66,',
            '  "intent_rationale": "...",',
            '  "narrative_bridge": "",',
            '  "direction_script": {',
            '    "start": "...",',
            '    "steps": ["...", "..."],',
            '    "end": "..."',
            '  },',
            '  "tone_hint": ""',
            '}',
        ].join('\n')}`;
    }

    function buildDefaultNarrativeBridge(previousBeat, targetBeat, jumpCount = 1) {
        const prevSummary = toShortText(previousBeat?.summary || '上一节拍', 72) || '上一节拍';
        const targetSummary = toShortText(targetBeat?.summary || '目标节拍', 72) || '目标节拍';
        if (jumpCount > 1) {
            return `先用1-2句简述从“${prevSummary}”到“${targetSummary}”之间的关键变化，省略细节但保持因果连贯。`;
        }
        return `先用1-2句交代“${prevSummary}”的收尾，再自然切入“${targetSummary}”。`;
    }

    function buildDefaultDirectionScript(currentBeat, nextBeat, shouldAdvance = false) {
        const currentSummary = toShortText(currentBeat?.summary || '当前节拍', 88) || '当前节拍';
        const nextSummary = toShortText(nextBeat?.summary || '下一节拍', 88) || '下一节拍';
        if (shouldAdvance) {
            return {
                start: `从“${currentSummary}”的进行中状态直接接续，不重复背景。`,
                steps: [
                    '先完成当前节拍里正在进行的关键互动或信息确认。',
                    '用1-2句简要交代中间推进，保持动作与因果连续。',
                    `自然切入“${nextSummary}”并展开首个可见动作。`,
                ],
                end: `收束在“${nextSummary}”的开场结果或新悬念处。`,
            };
        }
        return {
            start: `从“${currentSummary}”的当前状态起笔，保持同一情绪与场景连续。`,
            steps: [
                `围绕“${currentSummary}”推进1-2个具体互动动作，不空转。`,
                '让互动产生一个清晰变化（信息、关系或局势其一）。',
            ],
            end: '在当前节拍内收束为一个小结果或可继续追问的钩子。',
        };
    }

    function normalizeDirectionScript(rawScript, fallbackScript) {
        const scriptText = typeof rawScript === 'string' ? rawScript : '';
        const source = rawScript && typeof rawScript === 'object' ? rawScript : {};
        const fallback = fallbackScript && typeof fallbackScript === 'object' ? fallbackScript : {};

        const start = toShortText(
            source.start || source.opening || source.begin || scriptText || fallback.start || '',
            180
        );

        const stepCandidates = Array.isArray(source.steps)
            ? source.steps
            : (Array.isArray(source.middle_steps)
                ? source.middle_steps
                : (Array.isArray(source.process) ? source.process : []));

        const fallbackSteps = Array.isArray(fallback.steps) ? fallback.steps : [];
        const steps = (stepCandidates.length > 0 ? stepCandidates : fallbackSteps)
            .map((step) => toShortText(step, 120))
            .filter(Boolean)
            .slice(0, 4);

        while (steps.length < 2) {
            const nextFallback = fallbackSteps[steps.length] || '沿当前目标继续推进，并确保动作可见。';
            const normalized = toShortText(nextFallback, 120);
            if (!normalized) break;
            steps.push(normalized);
        }

        const end = toShortText(
            source.end || source.closing || source.finish || fallback.end || '',
            180
        );

        return {
            start: start || toShortText(fallback.start || '从当前局面直接接续。', 180),
            steps,
            end: end || toShortText(fallback.end || '以可承接的结果收束。', 180),
        };
    }

    function normalizeDecision(rawDecision, currentBeatIdx, beats) {
        const maxIdx = Math.max(0, beats.length - 1);
        const parsedIdx = Number.isInteger(rawDecision?.stage_idx)
            ? rawDecision.stage_idx
            : Number.isInteger(Number(rawDecision?.stage_idx))
                ? Number(rawDecision.stage_idx)
                : currentBeatIdx;

        let stageIdx = Math.max(0, Math.min(maxIdx, parsedIdx));
        let shouldAdvance = parseAdvanceFlag(rawDecision?.should_advance);
        if (shouldAdvance === null) {
            shouldAdvance = parseAdvanceFlag(rawDecision?.navigation_decision);
        }

        const currentBeatFromDecision = Number(rawDecision?.current_beat_idx);
        if (shouldAdvance === null && Number.isFinite(currentBeatFromDecision)) {
            shouldAdvance = currentBeatFromDecision > currentBeatIdx;
        }

        if (shouldAdvance === null) {
            shouldAdvance = stageIdx > currentBeatIdx;
        }

        if (shouldAdvance && stageIdx <= currentBeatIdx && currentBeatIdx < maxIdx) {
            stageIdx = currentBeatIdx + 1;
        }

        if (shouldAdvance && currentBeatIdx >= maxIdx) {
            shouldAdvance = false;
            stageIdx = maxIdx;
        }

        const confidenceNum = Number(rawDecision?.confidence);
        const confidence = Number.isFinite(confidenceNum)
            ? Math.max(0, Math.min(1, confidenceNum))
            : 0.55;

        const intentConfidenceNum = Number(rawDecision?.intent_confidence);
        const intentConfidence = Number.isFinite(intentConfidenceNum)
            ? Math.max(0, Math.min(1, intentConfidenceNum))
            : 0;

        const userIntent = normalizeIntentLabel(rawDecision?.user_intent);
        const previousBeat = beats[Math.max(0, currentBeatIdx)] || null;
        const targetBeat = beats[stageIdx] || beats[0] || null;
        const nextBeat = beats[Math.min(maxIdx, stageIdx + 1)] || null;
        const jumpCount = Math.max(0, stageIdx - currentBeatIdx);
        const fallbackDirectionScript = buildDefaultDirectionScript(targetBeat, nextBeat, shouldAdvance);
        const directionScript = normalizeDirectionScript(
            rawDecision?.direction_script || rawDecision?.directionScript || rawDecision?.director_script || rawDecision?.guidance,
            fallbackDirectionScript
        );

        let narrativeBridge = toShortText(
            rawDecision?.narrative_bridge || rawDecision?.bridge || rawDecision?.transition || '',
            180
        );
        if (shouldAdvance && !narrativeBridge) {
            narrativeBridge = buildDefaultNarrativeBridge(previousBeat, targetBeat, jumpCount);
        }
        if (!shouldAdvance) {
            narrativeBridge = '';
        }

        return {
            stage_idx: stageIdx,
            should_advance: shouldAdvance === true,
            user_intent: userIntent,
            intent_confidence: intentConfidence,
            intent_rationale: toShortText(rawDecision?.intent_rationale || rawDecision?.intent_reason || '', 160),
            narrative_bridge: narrativeBridge,
            direction_script: directionScript,
            next_hint: toShortText(rawDecision?.next_hint || directionScript.steps[0] || '', 180),
            spoiler_hold: toShortText(rawDecision?.spoiler_hold || '', 160),
            tone_hint: toShortText(rawDecision?.tone_hint || '', 160),
            confidence,
        };
    }

    function buildFallbackDecision(currentBeatIdx, beats, reason = 'fallback') {
        const safeIdx = Math.max(0, Math.min(currentBeatIdx, Math.max(0, beats.length - 1)));
        const currentBeat = beats[safeIdx] || beats[0] || null;
        const nextBeat = beats[safeIdx + 1] || null;
        const directionScript = buildDefaultDirectionScript(currentBeat, nextBeat, false);
        return {
            stage_idx: safeIdx,
            should_advance: false,
            user_intent: '',
            intent_confidence: 0,
            intent_rationale: '',
            narrative_bridge: '',
            direction_script: directionScript,
            next_hint: toShortText(nextBeat?.summary || '', 140) || '继续围绕当前阶段互动推进。',
            spoiler_hold: '不要提前描写后续关键转折或结局。',
            tone_hint: '',
            confidence: 0.4,
            reason,
        };
    }

    function applyUserIntentToDecision(decision, userIntent, currentBeatIdx, beats) {
        const maxIdx = Math.max(0, beats.length - 1);
        const nextDecision = {
            ...decision,
            stage_idx: Number.isInteger(decision?.stage_idx)
                ? Math.max(0, Math.min(maxIdx, decision.stage_idx))
                : currentBeatIdx,
            should_advance: decision?.should_advance === true,
        };

        // 用户意图仅作为证据写回，不直接覆盖导演推进判定。
        if (userIntent?.kind && userIntent.kind !== INTENT_LABELS.neutral && !nextDecision.user_intent) {
            nextDecision.user_intent = userIntent.kind;
        }
        if (!nextDecision.intent_source && userIntent?.source) {
            nextDecision.intent_source = userIntent.source;
        }

        if (!nextDecision.should_advance && nextDecision.stage_idx > currentBeatIdx) {
            nextDecision.stage_idx = currentBeatIdx;
        }

        return nextDecision;
    }

    function stripExistingDirectorInjection(chat) {
        if (!Array.isArray(chat)) return;
        for (let i = chat.length - 1; i >= 0; i--) {
            const item = chat[i];
            if (item?.is_storyweaver_director === true) {
                chat.splice(i, 1);
                continue;
            }
            const itemContent = String(item?.content || item?.mes || '');
            if (itemContent.includes('# StoryWeaver 导演提示（宽松模式）') || itemContent.includes('# StoryWeaver 导演提示（硬导演模式）')) {
                chat.splice(i, 1);
            }
        }
    }

    function buildInjection(decision, beats) {
        const stageIdx = Number.isInteger(decision.stage_idx) ? decision.stage_idx : 0;
        const currentBeat = beats[stageIdx] || beats[0] || null;
        const nextBeat = beats[stageIdx + 1] || null;
        const previousStageIdx = Number.isInteger(decision.previous_stage_idx)
            ? Math.max(0, Math.min(decision.previous_stage_idx, beats.length - 1))
            : Math.max(0, stageIdx - 1);
        const jumpCount = Math.max(0, stageIdx - previousStageIdx);
        const budgetLimit = Math.max(900, Number(AppState.settings?.directorInjectionCharBudget) || 2600);

        let previousTail = getPreviousBeatTail(beats, stageIdx, 100);
        let currentOriginal = String(currentBeat?.original_text || '').trim();

        const reserveForFramework = 460;
        const preferredCurrentLimit = Math.max(700, budgetLimit - reserveForFramework);
        const minimumCurrentLimit = 560;

        if (currentOriginal.length > preferredCurrentLimit) {
            currentOriginal = `${currentOriginal.slice(0, preferredCurrentLimit)}\n...(当前节拍原文已按预算截断)`;
        }

        let currentUsage = currentOriginal.length + previousTail.length;
        if (currentUsage > budgetLimit - reserveForFramework) {
            const overflow = currentUsage - (budgetLimit - reserveForFramework);
            if (previousTail.length > 0) {
                previousTail = previousTail.slice(Math.max(0, overflow));
            }
        }

        currentUsage = currentOriginal.length + previousTail.length;
        if (currentUsage > budgetLimit - reserveForFramework && currentOriginal.length > minimumCurrentLimit) {
            const shrink = currentUsage - (budgetLimit - reserveForFramework);
            const newLen = Math.max(minimumCurrentLimit, currentOriginal.length - shrink);
            currentOriginal = `${currentOriginal.slice(0, newLen)}\n...(当前节拍原文已按预算截断)`;
        }

        const currentOriginalSection = currentOriginal || '（当前节拍缺少原文，请优先遵循导演演绎指导并保持语气连续）';
        const previousTailSection = previousTail || '无';
        const directionScript = normalizeDirectionScript(
            decision.direction_script,
            buildDefaultDirectionScript(currentBeat, nextBeat, decision.should_advance === true)
        );
        const steps = Array.isArray(directionScript.steps) && directionScript.steps.length > 0
            ? directionScript.steps
            : ['围绕当前节拍推进一个可见动作。', '在可承接位置收束本轮输出。'];

        let narrativeBridge = toShortText(decision.narrative_bridge || '', 180);
        if (decision.should_advance === true && !narrativeBridge) {
            const previousBeat = beats[Math.max(0, previousStageIdx)] || beats[Math.max(0, stageIdx - 1)] || null;
            narrativeBridge = buildDefaultNarrativeBridge(previousBeat, currentBeat, Math.max(1, jumpCount));
        }

        const advanceText = decision.should_advance === true
            ? '推进到下一节拍（必须先写1-2句过渡再切入）'
            : '停留在当前节拍内继续演出';

        const actorGoal = decision.should_advance === true
            ? '先收束当前阶段关键动作，再用过渡句切入下一节拍。'
            : '在当前节拍内完成一次有效推进并形成可承接收束。';

        const processLines = steps
            .slice(0, 4)
            .map((step, idx) => `  ${idx + 1}. ${step}`);

        return [
            '# StoryWeaver 导演->演员执行单（硬导演模式）',
            '导演：演员秋青子就位！以下内容是导演给你的系统级执行指令，不是给用户看的解释。',
            `- 本回合任务: ${actorGoal}`,
            `- 导演判定: ${advanceText}`,
            `- 当前阶段: ${currentBeat?.id || `b${stageIdx + 1}`} ${currentBeat?.summary || '当前节拍'}`,
            '- 执行顺序: 先读主剧本 -> 再接承接尾巴 -> 最后按起点/过程/终点写正文。',
            '- 输出要求: 直接输出剧情正文，不要复述本执行单，不要解释规则。',
            '',
            '## 1) 当前节拍原文（主剧本，必须优先遵循）',
            currentOriginalSection,
            '',
            '## 2) 上一节拍尾部承接（最多100字）',
            previousTailSection,
            '',
            '## 3) 导演演绎指导（起点 -> 过程 -> 终点）',
            `- 起点: ${directionScript.start}`,
            '- 过程:',
            ...processLines,
            `- 终点: ${directionScript.end}`,
            decision.should_advance === true ? `- 跨节拍过渡: ${narrativeBridge}` : '- 跨节拍过渡: 本回合不需要。',
            decision.tone_hint ? `- 基调提示: ${decision.tone_hint}` : '',
            '- 执行要求: 必须按“起点 -> 过程 -> 终点”组织演出；若推进节拍，必须先写过渡再切入新节拍。',
        ].join('\n');
    }

    async function runDirectorBeforeGeneration(eventData) {
        if (AppState.settings.directorEnabled === false) {
            directorDebug('skip: directorEnabled=false');
            return null;
        }
        if (AppState.settings.directorRunEveryTurn === false) {
            directorDebug('skip: directorRunEveryTurn=false');
            return null;
        }
        if (!eventData || typeof eventData !== 'object' || eventData.dryRun) {
            directorDebug('skip: invalid eventData or dryRun');
            return null;
        }
        if (!Array.isArray(eventData.chat)) {
            directorDebug('skip: eventData.chat is not an array');
            return null;
        }

        const chapterIndex = Number.isInteger(AppState.experience?.currentChapterIndex)
            ? AppState.experience.currentChapterIndex
            : 0;
        const memory = AppState.memory?.queue?.[chapterIndex];
        if (!memory) {
            directorWarn(`当前章节不存在，chapterIndex=${chapterIndex}`);
            return null;
        }

        const beats = ensureChapterBeats(memory);
        if (!Array.isArray(beats) || beats.length === 0) {
            directorWarn(`无可用轻节拍，chapter=${chapterIndex + 1}`);
            return null;
        }

        const currentBeatIdx = Number.isInteger(memory.chapterCurrentBeatIndex)
            ? Math.max(0, Math.min(memory.chapterCurrentBeatIndex, beats.length - 1))
            : 0;
        memory.chapterCurrentBeatIndex = currentBeatIdx;
        directorDebug(`start chapter=${chapterIndex + 1}, beat=${currentBeatIdx + 1}/${beats.length}`);

        const latestUserMessage = getLatestUserMessage(eventData);
        const ruleIntent = detectUserIntent(latestUserMessage);
        directorDebug(`intent-rule=${ruleIntent.kind}${ruleIntent.signal ? ` (${ruleIntent.signal})` : ''}`);

        const prompt = buildDirectorPrompt({
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            chapterOutline: toShortText(memory.chapterOutline || '', 140),
            currentBeatIdx,
            beats,
            latestDialogue: getLatestDialogue(eventData),
        });

        let decision = null;
        let decisionSource = 'model';
        try {
            const response = await callDirectorAPI(prompt, chapterIndex + 1);
            const parsed = extractJsonObject(response);
            if (!parsed) {
                directorWarn('导演返回内容无法解析为JSON，已使用回退判定', toShortText(response, 220));
                decision = buildFallbackDecision(currentBeatIdx, beats, 'parse-fallback');
                decisionSource = 'fallback-parse';
            } else {
                decision = normalizeDecision(parsed, currentBeatIdx, beats);
            }
        } catch (error) {
            directorWarn('导演判定失败，已使用回退判定', error?.message || String(error));
            decision = buildFallbackDecision(currentBeatIdx, beats, 'error-fallback');
            decisionSource = 'fallback-error';
        }

        const resolvedIntent = resolveUserIntent({
            modelIntent: {
                kind: decision?.user_intent,
                confidence: decision?.intent_confidence,
                rationale: decision?.intent_rationale,
            },
            ruleIntent,
        });

        decision.user_intent = resolvedIntent.kind;
        decision.intent_confidence = resolvedIntent.confidence;
        decision.intent_source = resolvedIntent.source;
        decision.intent_rationale = resolvedIntent.rationale;

        decision = applyUserIntentToDecision(decision, resolvedIntent, currentBeatIdx, beats);

        if (decision.should_advance === true && decision.stage_idx > currentBeatIdx && !decision.narrative_bridge) {
            const previousBeat = beats[currentBeatIdx] || null;
            const targetBeat = beats[decision.stage_idx] || null;
            decision.narrative_bridge = buildDefaultNarrativeBridge(previousBeat, targetBeat, decision.stage_idx - currentBeatIdx);
        }

        if (decision.confidence < 0.35) {
            directorDebug(`low-confidence fallback applied: ${decision.confidence}`);
            decision.stage_idx = currentBeatIdx;
            decision.should_advance = false;
            decision.narrative_bridge = '';
            decision.direction_script = normalizeDirectionScript(
                decision.direction_script,
                buildDefaultDirectionScript(beats[currentBeatIdx] || null, beats[currentBeatIdx + 1] || null, false)
            );
        }

        decision.previous_stage_idx = currentBeatIdx;

        directorInfo(`判定完成 source=${decisionSource}, stage=${decision.stage_idx}, advance=${decision.should_advance}, confidence=${decision.confidence}, intent=${resolvedIntent.kind}, intentSource=${resolvedIntent.source}, intentConf=${resolvedIntent.confidence}`);

        memory.chapterCurrentBeatIndex = decision.stage_idx;
        memory.directorDecision = {
            ...decision,
            at: Date.now(),
        };
        AppState.experience.currentBeatIndex = decision.stage_idx;
        AppState.experience.directorLastDecision = { ...memory.directorDecision };
        AppState.experience.directorLastDecisionAt = Date.now();

        const injection = buildInjection(decision, beats);
        stripExistingDirectorInjection(eventData.chat);
        eventData.chat.unshift({
            role: 'system',
            content: injection,
            name: 'system',
            is_user: false,
            is_system: true,
            mes: injection,
            is_storyweaver_director: true,
        });
        directorInfo(`注入完成 chapter=${chapterIndex + 1}, activeBeat=${decision.stage_idx + 1}`);

        return decision;
    }

    return {
        runDirectorBeforeGeneration,
    };
}
