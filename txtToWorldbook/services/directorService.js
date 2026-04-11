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
            entryEvent: toShortText(
                source.entryEvent
                || source.entry_event
                || source.opening_event
                || source.openingEvent
                || source.entry_condition
                || source.enter_condition
                || '从上一节拍结果自然衔接进入当前事件。',
                120
            ),
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

    function getLatestAssistantMessage(eventData) {
        const eventChat = Array.isArray(eventData?.chat) ? eventData.chat : [];
        if (eventChat.length > 0) {
            for (let i = eventChat.length - 1; i >= 0; i--) {
                const item = eventChat[i] || {};
                const role = item.role || (item.is_user ? 'user' : 'assistant');
                if (role !== 'assistant') continue;
                const content = String(item.content || item.mes || '').trim();
                if (content) return content;
            }
        }

        try {
            const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
            const chat = Array.isArray(st?.getContext?.()?.chat) ? st.getContext().chat : [];
            for (let i = chat.length - 1; i >= 0; i--) {
                const item = chat[i] || {};
                if (item.is_user) continue;
                const content = String(item.mes || item.content || '').trim();
                if (content) return content;
            }
        } catch (_) {
            return '';
        }

        return '';
    }

    function buildDirectionContext({ beats, currentBeatIdx, isNewBeat = false, latestAssistantMessage = '', latestUserMessage = '' }) {
        const maxIdx = Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);
        const safeIdx = Math.max(0, Math.min(currentBeatIdx || 0, maxIdx));
        const currentBeat = Array.isArray(beats) ? (beats[safeIdx] || beats[0] || null) : null;
        const previousTail = getPreviousBeatTail(beats, safeIdx, 100);
        const entryEvent = toShortText(currentBeat?.entryEvent || '', 120);
        const currentSummary = toShortText(currentBeat?.summary || '当前节拍', 100) || '当前节拍';
        const recentAssistant = toShortText(latestAssistantMessage || '', 220);
        const recentUser = toShortText(latestUserMessage || '', 220);

        let startAnchor = '';
        if (isNewBeat) {
            if (entryEvent) {
                startAnchor = `先承接上一节拍尾部，再以“${entryEvent}”作为入场触发进入当前节拍，不复述整段背景。`;
            } else if (previousTail) {
                startAnchor = '先承接上一节拍尾部自然开场，再进入当前节拍动作，禁止按当前节拍原文末尾续写。';
            } else {
                startAnchor = `以“${currentSummary}”的开场状态进入当前节拍，保持承接感且不重铺背景。`;
            }
        } else if (recentAssistant) {
            startAnchor = `优先承接最近AI输出“${recentAssistant}”，再接入用户动作继续推进，禁止从当前节拍原文末尾续写。`;
        } else if (recentUser) {
            startAnchor = `优先承接最近用户动作“${recentUser}”继续推进，保持当前节拍连续，不重铺背景。`;
        } else {
            startAnchor = `从“${currentSummary}”已进行中的局面继续推进，聚焦可见动作，不复述背景。`;
        }

        return {
            mode: isNewBeat ? 'new_beat' : 'in_beat',
            start_anchor: toShortText(startAnchor, 180),
            end_guideline: '本回合只需收束到可中断的临时节点（小结果、可追问钩子或局势变化），不要求完成整个节拍。',
            previous_tail: previousTail || '',
            entry_event: entryEvent || '',
            recent_assistant: recentAssistant || '',
            recent_user: recentUser || '',
        };
    }

    function detectExplicitBeatSwitchCommand(userMessage) {
        const rawText = String(userMessage || '');
        const text = rawText.replace(/\s+/g, '');
        if (!text) {
            return {
                requested: false,
                direction: 'none',
                signal: '',
                reason: 'empty-user-message',
                source: 'rule-explicit',
                targetIndex: null,
            };
        }

        const negationPatterns = [
            /(不|别|不要|先不|先别|暂不|暂时不).{0,10}(切换到|切到|切|跳到|跳转到|跳|转到|转向|转|进入|接到|推进到|推进|回到|退到|退回到|移到|到).{0,8}(下一个|下一|下个|上一个|上一|上个)?节拍/,
            /(别|不要).{0,8}(下一节拍|下个节拍|下一个节拍|上一节拍|上个节拍|上一个节拍)/,
        ];
        if (negationPatterns.some((pattern) => pattern.test(text))) {
            return {
                requested: false,
                direction: 'none',
                signal: 'negated-switch-command',
                reason: 'explicit-negation',
                source: 'rule-explicit',
                targetIndex: null,
            };
        }

        const indexMatch = text.match(/(?:切换到|切到|跳到|跳转到|转到|转向|进入|推进到|回到|退到|移到|到)第?(\d+)节拍/);
        if (indexMatch) {
            const targetIndex = Math.max(0, Number(indexMatch[1]) - 1);
            return {
                requested: true,
                direction: 'index',
                signal: 'switch-index-beat',
                reason: 'explicit-switch-command',
                source: 'rule-explicit',
                targetIndex: Number.isFinite(targetIndex) ? targetIndex : null,
            };
        }

        const switchRules = [
            {
                direction: 'next',
                signal: 'verb-next-beat',
                patterns: [
                    /(切换到|切到|切|跳到|跳转到|跳|转到|转向|转|进入|接到|推进到|推进|移到|到)(下一个|下一|下个)节拍/,
                    /(切换下一个节拍|切下一节拍|跳下一个节拍|跳下一节拍|转下一个节拍|转下一节拍)/,
                ],
            },
            {
                direction: 'next',
                signal: 'next-beat-command',
                patterns: [
                    /^(下一个节拍|下个节拍|下一节拍)(吧|。|！|!|,|，)?$/,
                    /nextbeat|next_beat|nextbeatplease|nextchapterbeat/i,
                ],
            },
            {
                direction: 'prev',
                signal: 'verb-prev-beat',
                patterns: [
                    /(回到|退到|退回到|切回到|切回|转回到|转回|切换到|切到|跳到|转到|移到|到)(上一个|上一|上个)节拍/,
                    /(切换上一个节拍|切上一节拍|跳上一个节拍|跳上一节拍|转上一个节拍|转上一节拍)/,
                ],
            },
            {
                direction: 'prev',
                signal: 'prev-beat-command',
                patterns: [
                    /^(上一个节拍|上个节拍|上一节拍)(吧|。|！|!|,|，)?$/,
                    /previousbeat|prevbeat|previous_beat/i,
                ],
            },
            {
                direction: 'stay',
                signal: 'stay-current-beat',
                patterns: [
                    /(当前节拍|这个节拍|这一个节拍|留在当前节拍|继续当前节拍)/,
                ],
            },
        ];

        for (const rule of switchRules) {
            if (rule.patterns.some((pattern) => pattern.test(text))) {
                return {
                    requested: rule.direction !== 'stay',
                    direction: rule.direction,
                    signal: rule.signal,
                    reason: rule.direction === 'stay' ? 'explicit-stay-command' : 'explicit-switch-command',
                    source: 'rule-explicit',
                    targetIndex: null,
                };
            }
        }

        return {
            requested: false,
            direction: 'none',
            signal: '',
            reason: 'no-explicit-switch-command',
            source: 'rule-explicit',
            targetIndex: null,
        };
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

    function buildDirectorPrompt({ chapterTitle, chapterOutline, currentBeatIdx, beats, latestDialogue, latestUserMessage, switchControl, directionContext }) {
        const compactBeats = beats.map((beat, idx) => ({
            idx,
            id: beat.id,
            summary: beat.summary,
            exitCondition: beat.exitCondition,
            tags: beat.tags,
        }));
        const currentBeat = beats[currentBeatIdx] || beats[0] || null;
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const contextMode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(context.start_anchor || '', 180)
            || (contextMode === 'new_beat'
                ? '先承接上一节拍尾部，再触发当前节拍入场动作。'
                : '承接最近AI输出，再接入用户动作继续推进。');
        const contextPreviousTail = toShortText(context.previous_tail || '', 120) || '无';
        const contextEntryEvent = toShortText(context.entry_event || '', 120) || '无';
        const contextRecentAssistant = toShortText(context.recent_assistant || '', 220) || '无';
        const contextRecentUser = toShortText(context.recent_user || '', 220) || '无';
        const endGuideline = toShortText(context.end_guideline || '', 180)
            || '本回合收束到可中断临时节点，不要求完成整节拍。';
        const currentOriginal = String(currentBeat?.original_text || '').trim();
        const currentOriginalForPrompt = currentOriginal
            ? `${currentOriginal.slice(0, 1800)}${currentOriginal.length > 1800 ? '\n...(已截断)' : ''}`
            : '无';
        const previousTail = contextPreviousTail || getPreviousBeatTail(beats, currentBeatIdx, 100) || '无';
        const splitRuleHint = buildSplitRuleHint(currentBeat);
        const switchStatus = switchControl?.switched === true
            ? `已切换（${switchControl.signal || switchControl.reason || 'switch'}）`
            : `未切换（${switchControl?.reason || 'no-explicit-switch-command'}）`;

        const prefix = getLanguagePrefix ? getLanguagePrefix() : '';
        return `${prefix}${[
            '你是“互动小说导演”。你的职责是：基于已锁定的当前节拍，为演员AI生成可直接执行的演出框架。',
            '',
            '核心原则：',
            '1) 你不负责节拍切换，系统已锁定当前节拍。禁止自行改 stage 或决定 advance。',
            '2) 你要结合：当前节拍原文、最近对话（用户+AI）、上一节拍承接来编排演出。',
            '3) 若系统本回合发生节拍切换，必须给出 narrative_bridge（1-2句，40-120字）交代过渡，避免割裂。',
            '4) 必须基于当前节拍原文证据输出 direction_script（起点-过程-终点），演员将按这个框架执行。',
            '5) direction_script.start 必须锚定“起笔锚点”；禁止从当前节拍原文末尾直接续写。',
            '6) direction_script.end 只写“本回合临时收束点”，不要求完成整节拍，也不得暗示自动切拍。',
            '',
            '输出硬规则：',
            '1) 只输出 JSON，不要代码块，不要解释文字。',
            '2) confidence、intent_confidence 必须是 0-1 数字。',
            '3) direction_script.steps 必须是 2-4 条短步骤。',
            `4) stage_idx 必须固定为 ${currentBeatIdx}，should_advance 必须为 false（系统已完成切拍控制）。`,
            '5) narrative_bridge 仅在系统本回合发生切拍时填写，否则留空字符串。',
            '6) direction_script.start 需要直接引用“起笔锚点”；direction_script.end 需要直接引用“临时收束”目标。',
            '',
            '允许的 user_intent 标签：advance, stay, neutral, switch_scene, skip, investigate, search, explore, travel, dialogue, negotiate, reflect, plan, rest, stealth, combat, summarize, clarify, request_hint, meta。',
            '',
            `章节：${chapterTitle}`,
            `本章摘要：${chapterOutline}`,
            `当前阶段索引：${currentBeatIdx}`,
            `当前节拍规则提示：${splitRuleHint}`,
            `系统切拍控制结果：${switchStatus}`,
            `用户最新输入：${toShortText(latestUserMessage || '无', 320) || '无'}`,
            '',
            '起笔锚点上下文：',
            `- 场景模式：${contextMode === 'new_beat' ? '新入节拍' : '节拍中段续写'}`,
            `- 起笔锚点：${startAnchor}`,
            `- 本回合收束目标：${endGuideline}`,
            contextMode === 'new_beat'
                ? `- 入场事件：${contextEntryEvent}`
                : `- 最近AI输出（优先锚点）：${contextRecentAssistant}`,
            contextMode === 'new_beat'
                ? `- 上一节拍尾部承接（最多100字）：${previousTail}`
                : `- 最近用户动作（次级锚点）：${contextRecentUser}`,
            '',
            '节拍列表（供定位阶段）：',
            JSON.stringify(compactBeats, null, 2),
            '',
            '上一节拍尾部承接（最多100字，供新节拍开场）：',
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

    function buildDefaultDirectionScript(currentBeat, nextBeat, shouldAdvance = false, directionContext = {}) {
        const currentSummary = toShortText(currentBeat?.summary || '当前节拍', 88) || '当前节拍';
        const nextSummary = toShortText(nextBeat?.summary || '下一节拍', 88) || '下一节拍';
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const mode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(context.start_anchor || '', 160);
        const recentAssistant = toShortText(context.recent_assistant || '', 160);
        const recentUser = toShortText(context.recent_user || '', 160);
        const entryEvent = toShortText(context.entry_event || '', 100);
        const endGuideline = toShortText(context.end_guideline || '', 160)
            || '本回合收束到可承接的临时节点，不要求完成整节拍。';

        if (shouldAdvance) {
            return {
                start: startAnchor || `先承接当前线头，再切入“${nextSummary}”的首个可见动作，不重复背景。`,
                steps: [
                    '先完成当前节拍里正在进行的关键互动或信息确认。',
                    '用1-2句简要交代中间推进，保持动作与因果连续。',
                    `自然切入“${nextSummary}”并展开首个可见动作。`,
                ],
                end: endGuideline,
            };
        }

        if (mode === 'new_beat') {
            return {
                start: startAnchor || `先承接上一节拍尾部，再以“${entryEvent || currentSummary}”触发当前节拍开场。`,
                steps: [
                    entryEvent
                        ? `先启动“${entryEvent}”对应的入场动作，不复述整段背景。`
                        : '先用上一节拍尾部回接开场，立即进入当前节拍动作。',
                    `围绕“${currentSummary}”推进1-2个具体互动动作，形成可见变化。`,
                ],
                end: endGuideline,
            };
        }

        const inBeatStart = startAnchor
            || (recentAssistant
                ? `优先承接最近AI输出“${recentAssistant}”，再接入用户动作继续推进。`
                : (recentUser
                    ? `承接最近用户动作“${recentUser}”继续推进，不重铺背景。`
                    : `从“${currentSummary}”已进行中的局面继续推进，不复述背景。`));
        return {
            start: inBeatStart,
            steps: [
                `围绕“${currentSummary}”推进1-2个具体互动动作，不空转。`,
                '让互动产生一个清晰变化（信息、关系或局势其一）。',
            ],
            end: endGuideline,
        };
    }

    function normalizeDirectionScript(rawScript, fallbackScript) {
        const scriptText = typeof rawScript === 'string' ? rawScript : '';
        const source = rawScript && typeof rawScript === 'object' ? rawScript : {};
        const fallback = fallbackScript && typeof fallbackScript === 'object' ? fallbackScript : {};

        let start = toShortText(
            source.start || source.opening || source.begin || scriptText || fallback.start || '',
            180
        );
        if (start.length < 20) {
            const richerFallback = toShortText(
                fallback.start || '先锚定当前回合可见动作，再展开本回合推进，不复述背景。',
                150
            );
            start = toShortText([start, richerFallback].filter(Boolean).join(' '), 180);
        }

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
            end: end || toShortText(fallback.end || '本回合收束到可承接的临时节点。', 180),
        };
    }

    function resolveBeatSwitchControl(currentBeatIdx, beats, switchCommand) {
        const maxIdx = Math.max(0, beats.length - 1);
        const safeCurrentIdx = Math.max(0, Math.min(currentBeatIdx, maxIdx));
        const hasNextBeat = safeCurrentIdx < maxIdx;
        const hasPreviousBeat = safeCurrentIdx > 0;

        const direction = String(switchCommand?.direction || 'none');
        const signal = String(switchCommand?.signal || '');
        const requested = switchCommand?.requested === true;

        if (!requested || direction === 'none' || direction === 'stay') {
            return {
                switched: false,
                lockedBeatIdx: safeCurrentIdx,
                shouldAdvance: false,
                direction: 'none',
                signal,
                reason: switchCommand?.reason || 'locked-current',
            };
        }

        if (direction === 'index' && Number.isInteger(switchCommand?.targetIndex)) {
            const targetIdx = Math.max(0, Math.min(Number(switchCommand.targetIndex), maxIdx));
            const switched = targetIdx !== safeCurrentIdx;
            return {
                switched,
                lockedBeatIdx: targetIdx,
                shouldAdvance: targetIdx > safeCurrentIdx,
                direction: switched ? (targetIdx > safeCurrentIdx ? 'next' : 'prev') : 'none',
                signal,
                reason: switched ? 'user-switched-index' : 'index-no-change',
            };
        }

        if (direction === 'next') {
            if (!hasNextBeat) {
                return {
                    switched: false,
                    lockedBeatIdx: safeCurrentIdx,
                    shouldAdvance: false,
                    direction: 'none',
                    signal,
                    reason: 'last-beat-no-advance',
                };
            }
            return {
                switched: true,
                lockedBeatIdx: safeCurrentIdx + 1,
                shouldAdvance: true,
                direction: 'next',
                signal,
                reason: 'user-switched-next',
            };
        }

        if (direction === 'prev') {
            if (!hasPreviousBeat) {
                return {
                    switched: false,
                    lockedBeatIdx: safeCurrentIdx,
                    shouldAdvance: false,
                    direction: 'none',
                    signal,
                    reason: 'first-beat-no-backward',
                };
            }
            return {
                switched: true,
                lockedBeatIdx: safeCurrentIdx - 1,
                shouldAdvance: false,
                direction: 'prev',
                signal,
                reason: 'user-switched-prev',
            };
        }

        return {
            switched: false,
            lockedBeatIdx: safeCurrentIdx,
            shouldAdvance: false,
            direction: 'none',
            signal,
            reason: 'unsupported-switch-direction',
        };
    }

    function normalizeDecision(rawDecision, currentBeatIdx, beats, directionContext = {}) {
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
        const fallbackDirectionScript = buildDefaultDirectionScript(targetBeat, nextBeat, shouldAdvance, directionContext);
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

    function buildFallbackDecision(currentBeatIdx, beats, reason = 'fallback', directionContext = {}) {
        const safeIdx = Math.max(0, Math.min(currentBeatIdx, Math.max(0, beats.length - 1)));
        const currentBeat = beats[safeIdx] || beats[0] || null;
        const nextBeat = beats[safeIdx + 1] || null;
        const directionScript = buildDefaultDirectionScript(currentBeat, nextBeat, false, directionContext);
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
        const jumpCount = Math.abs(stageIdx - previousStageIdx);
        const switchedStage = stageIdx !== previousStageIdx;
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
        const directionContext = decision?.direction_context && typeof decision.direction_context === 'object'
            ? decision.direction_context
            : buildDirectionContext({
                beats,
                currentBeatIdx: stageIdx,
                isNewBeat: decision?.is_new_beat === true,
                latestAssistantMessage: decision?.latest_assistant_message || '',
                latestUserMessage: decision?.latest_user_message || '',
            });
        const directionScript = normalizeDirectionScript(
            decision.direction_script,
            buildDefaultDirectionScript(currentBeat, nextBeat, decision.should_advance === true, directionContext)
        );
        const steps = Array.isArray(directionScript.steps) && directionScript.steps.length > 0
            ? directionScript.steps
            : ['围绕当前节拍推进一个可见动作。', '在可承接位置收束本轮输出。'];

        let narrativeBridge = toShortText(decision.narrative_bridge || '', 180);
        if (switchedStage && !narrativeBridge) {
            const previousBeat = beats[Math.max(0, previousStageIdx)] || beats[Math.max(0, stageIdx - 1)] || null;
            narrativeBridge = buildDefaultNarrativeBridge(previousBeat, currentBeat, Math.max(1, jumpCount));
        }

        const switchDirection = String(decision.switch_direction || 'none');
        const advanceText = switchDirection === 'next'
            ? '已切换到下一节拍（必须先写1-2句过渡再切入）'
            : (switchDirection === 'prev'
                ? '已切回上一节拍（必须先写1-2句回接再切入）'
                : '停留在当前节拍内继续演出');
        const mode = directionContext?.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(directionContext?.start_anchor || '', 180) || '按导演起点说明开场。';
        const actorGoal = mode === 'new_beat'
            ? (switchDirection === 'next'
                ? '先承接上一节拍尾部并触发本节拍入场事件，再按框架推进；本回合临时收束，不必覆盖整节拍。'
                : '以本节拍入场逻辑开场并推进可见动作；本回合临时收束，不必覆盖整节拍。')
            : '优先承接最近AI输出，其次承接用户动作继续推进；本回合临时收束，不必覆盖整节拍。';

        const processLines = steps
            .slice(0, 4)
            .map((step, idx) => `  ${idx + 1}. ${step}`);

        return [
            '# StoryWeaver 导演->演员执行单（硬导演模式）',
            '导演：演员秋青子就位！以下内容是导演给你的系统级执行指令，不是给用户看的解释。',
            `- 本回合任务: ${actorGoal}`,
            `- 导演判定: ${advanceText}`,
            `- 当前阶段: ${currentBeat?.id || `b${stageIdx + 1}`} ${currentBeat?.summary || '当前节拍'}`,
            '- 执行顺序: 先锚定起笔点 -> 再参考主剧本边界 -> 按起点/过程/终点写正文。',
            `- 起笔锚点: ${startAnchor}`,
            '- 输出要求: 直接输出剧情正文，不要复述本执行单，不要解释规则。',
            '- 禁止事项: 禁止按当前节拍原文末尾直接续写；禁止越出当前节拍范围。',
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
            switchedStage ? `- 跨节拍过渡: ${narrativeBridge}` : '- 跨节拍过渡: 本回合不需要。',
            decision.tone_hint ? `- 基调提示: ${decision.tone_hint}` : '',
            switchedStage
                ? '- 执行要求: 必须按“起点 -> 过程 -> 终点”组织演出；本回合先写过渡/回接，再展开本节拍正文；本回合临时收束不等于切拍。'
                : '- 执行要求: 必须按“起点 -> 过程 -> 终点”组织演出；本回合临时收束不等于切拍，禁止跳出当前节拍。',
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
        const latestAssistantMessage = getLatestAssistantMessage(eventData);
        const latestDialogue = getLatestDialogue(eventData);
        const ruleIntent = detectUserIntent(latestUserMessage);
        const switchCommand = detectExplicitBeatSwitchCommand(latestUserMessage);
        const switchControl = resolveBeatSwitchControl(currentBeatIdx, beats, switchCommand);
        const lockedBeatIdx = switchControl.lockedBeatIdx;
        const previousBeatIdx = Number.isInteger(AppState.experience?.lastBeatIdx)
            ? Math.max(0, Math.min(AppState.experience.lastBeatIdx, beats.length - 1))
            : -1;
        const isNewBeat = previousBeatIdx !== lockedBeatIdx;
        const directionContext = buildDirectionContext({
            beats,
            currentBeatIdx: lockedBeatIdx,
            isNewBeat,
            latestAssistantMessage,
            latestUserMessage,
        });
        directorDebug(`intent-rule=${ruleIntent.kind}${ruleIntent.signal ? ` (${ruleIntent.signal})` : ''}`);
        directorDebug(`switch-command=${switchCommand.requested ? `on(${switchCommand.signal || 'explicit'})` : 'off'}`);
        directorDebug(`switch-control=${switchControl.reason}, lockedBeat=${lockedBeatIdx + 1}/${beats.length}`);
        directorDebug(`start-mode=${directionContext.mode}, prevBeat=${previousBeatIdx >= 0 ? previousBeatIdx + 1 : 0}`);

        const prompt = buildDirectorPrompt({
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            chapterOutline: toShortText(memory.chapterOutline || '', 140),
            currentBeatIdx: lockedBeatIdx,
            beats,
            latestDialogue,
            latestUserMessage,
            switchControl,
            directionContext,
        });

        let decision = null;
        let decisionSource = 'model';
        try {
            const response = await callDirectorAPI(prompt, chapterIndex + 1);
            const parsed = extractJsonObject(response);
            if (!parsed) {
                directorWarn('导演返回内容无法解析为JSON，已使用回退判定', toShortText(response, 220));
                decision = buildFallbackDecision(lockedBeatIdx, beats, 'parse-fallback', directionContext);
                decisionSource = 'fallback-parse';
            } else {
                decision = normalizeDecision(parsed, lockedBeatIdx, beats, directionContext);
            }
        } catch (error) {
            directorWarn('导演判定失败，已使用回退判定', error?.message || String(error));
            decision = buildFallbackDecision(lockedBeatIdx, beats, 'error-fallback', directionContext);
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

        decision = applyUserIntentToDecision(decision, resolvedIntent, lockedBeatIdx, beats);

        // 节拍切换由流程层决定，导演输出仅负责“怎么演”。
        decision.stage_idx = lockedBeatIdx;
        decision.should_advance = switchControl.shouldAdvance;
        decision.switch_direction = switchControl.direction;
        decision.switch_signal = switchControl.signal;
        decision.switch_gate = switchControl.reason;
        decision.is_new_beat = isNewBeat;
        decision.direction_context = directionContext;
        decision.latest_assistant_message = toShortText(latestAssistantMessage || '', 220);
        decision.latest_user_message = toShortText(latestUserMessage || '', 220);

        if (switchControl.switched === true && !decision.narrative_bridge) {
            const previousBeat = beats[currentBeatIdx] || null;
            const targetBeat = beats[lockedBeatIdx] || null;
            decision.narrative_bridge = buildDefaultNarrativeBridge(previousBeat, targetBeat, Math.abs(lockedBeatIdx - currentBeatIdx));
        }
        if (switchControl.switched !== true) {
            decision.narrative_bridge = '';
        }

        if (decision.confidence < 0.35) {
            directorDebug(`low-confidence fallback applied: ${decision.confidence}`);
            decision.direction_script = normalizeDirectionScript(
                decision.direction_script,
                buildDefaultDirectionScript(
                    beats[lockedBeatIdx] || null,
                    beats[lockedBeatIdx + 1] || null,
                    switchControl.shouldAdvance === true,
                    directionContext
                )
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
        AppState.experience.lastBeatIdx = lockedBeatIdx;
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
