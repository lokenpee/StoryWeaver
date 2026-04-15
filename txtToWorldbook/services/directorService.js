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

    function buildDirectorTurnPrefix(chapterIndex) {
        const chapterNo = Number.isInteger(chapterIndex) ? chapterIndex + 1 : 0;
        return chapterNo > 0
            ? `[第${chapterNo}章][导演裁判]`
            : '[导演裁判]';
    }

    function toShortText(text, maxLen = 180) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
    }

    function toTailText(text, maxLen = 180) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        if (plain.length <= maxLen) return plain;
        return `...${plain.slice(Math.max(0, plain.length - maxLen))}`;
    }

    function toHeadText(text, maxLen = 200) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
    }

    function normalizeActionSegment(text, maxLen = 120) {
        const plain = String(text || '')
            .replace(/[“”"']/g, '')
            .replace(/[「」]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return toShortText(plain, maxLen);
    }

    function splitActionChain(actionChain, limit = 4) {
        const normalized = String(actionChain || '')
            .replace(/[\r\n]+/g, '→')
            .replace(/\s*→\s*/g, '→')
            .trim();
        if (!normalized) return [];
        return normalized
            .split('→')
            .map((segment) => normalizeActionSegment(segment, 120))
            .filter(Boolean)
            .slice(0, limit);
    }

    function buildActionChain(steps, maxLen = 420) {
        const normalizedSteps = Array.isArray(steps)
            ? steps
                .map((step) => normalizeActionSegment(step, 120))
                .filter(Boolean)
                .slice(0, 4)
            : [];
        return toShortText(normalizedSteps.join('→'), maxLen);
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

    function normalizeBeat(rawBeat, idx) {
        const source = rawBeat && typeof rawBeat === 'object' ? rawBeat : {};
        const tags = Array.isArray(source.tags)
            ? source.tags.map((t) => toShortText(t, 16)).filter(Boolean).slice(0, 4)
            : [];
        return {
            id: String(source.id || `b${idx + 1}`),
            summary: toShortText(source.event_summary || source.eventSummary || source.summary || source.event || source.description || `事件点${idx + 1}`, 200),
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
                `${memory.chapterOutline || ''}`
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

    function getSillyTavernChatHistory() {
        try {
            const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
            if (!st || typeof st.getContext !== 'function') return [];
            const chat = st.getContext()?.chat;
            return Array.isArray(chat) ? chat : [];
        } catch (_) {
            return [];
        }
    }

    function getChatItemContent(item) {
        return String(item?.mes || item?.content || '').trim();
    }

    function resolveChatItemRole(item) {
        if (item?.is_user === true) return 'user';
        if (item?.is_system === true) return 'system';

        const role = String(item?.role || '').toLowerCase();
        if (role === 'user' || role === 'assistant' || role === 'system') {
            return role;
        }

        return 'assistant';
    }

    function isUserChatItem(item) {
        return resolveChatItemRole(item) === 'user';
    }

    function isAssistantChatItem(item) {
        if (resolveChatItemRole(item) !== 'assistant') return false;
        if (item?.is_system === true) return false;
        if (item?.is_westworld_director === true || item?.is_storyweaver_director === true) return false;
        if (item?.prefix === true) return false;
        return true;
    }

    function pickLatestFromChat(chat, matcher) {
        const source = Array.isArray(chat) ? chat : [];
        for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i] || {};
            if (!matcher(item)) continue;
            const content = getChatItemContent(item);
            if (content) return content;
        }
        return '';
    }

    function getLatestDialogue(eventData) {
        void eventData;
        const lines = [];

        const realChat = getSillyTavernChatHistory();
        const lastAssistant = pickLatestFromChat(realChat, isAssistantChatItem);
        const lastUser = pickLatestFromChat(realChat, isUserChatItem);

        if (lastAssistant) lines.push(`AI:${toShortText(lastAssistant, 320)}`);
        if (lastUser) lines.push(`用户:${toShortText(lastUser, 320)}`);

        return lines.length > 0 ? lines.join('\n') : '无最近对话';
    }

    function getLatestUserMessage(eventData) {
        void eventData;
        const realChat = getSillyTavernChatHistory();
        return pickLatestFromChat(realChat, isUserChatItem);
    }

    function getLatestAssistantMessage(eventData) {
        void eventData;
        const realChat = getSillyTavernChatHistory();
        return pickLatestFromChat(realChat, isAssistantChatItem);
    }

    function buildDirectionContext({ beats, currentBeatIdx, isNewBeat = false, latestAssistantMessage = '', latestUserMessage = '' }) {
        const maxIdx = Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);
        const safeIdx = Math.max(0, Math.min(currentBeatIdx || 0, maxIdx));
        const currentBeat = Array.isArray(beats) ? (beats[safeIdx] || beats[0] || null) : null;
        const entryEvent = toShortText(currentBeat?.entryEvent || '', 120);
        const recentAssistant = toTailText(latestAssistantMessage || '', 200);
        const recentUser = toShortText(latestUserMessage || '', 220);

        let startAnchor = '';
        if (recentAssistant) {
            if (isNewBeat && entryEvent) {
                startAnchor = `先承接最近AI输出末尾“${recentAssistant}”，再以“${entryEvent}”触发入场并推进当前节拍。`;
            } else {
                startAnchor = `优先承接最近AI输出末尾“${recentAssistant}”，再接入用户动作继续推进，不重铺背景。`;
            }   
        } else if (entryEvent) {
            startAnchor = `以“${entryEvent}”作为入场触发继续推进，并与用户当前互动保持连续。`;
        } else if (recentUser) {
            startAnchor = `以用户刚给出的互动“${recentUser}”作为当前起点继续推进，不补写超出输入边界的动作。`;
        } else {
            startAnchor = '从当前可见动作直接续写，保持连续，不补写超出用户输入边界的剧情。';
        }

        return {
            mode: isNewBeat ? 'new_beat' : 'in_beat',
            start_anchor: toShortText(startAnchor, 180),
            end_guideline: '本回合只需收束到可中断的临时节点（小结果、可追问钩子或局势变化），不要求完成整个节拍；收束不得超出用户本轮输入边界。',
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

    function buildDirectorPrompt({ chapterTitle, chapterOutline, currentBeatIdx, beats, latestDialogue, latestUserMessage, directionContext }) {
        const compactBeats = beats.map((beat, idx) => ({
            idx,
            id: beat.id,
            summary: beat.summary,
            entryEvent: beat.entryEvent,
            exitCondition: beat.exitCondition,
        }));
        const currentBeat = beats[currentBeatIdx] || beats[0] || null;
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const contextMode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(context.start_anchor || '', 180)
            || (contextMode === 'new_beat'
                ? '先触发当前节拍入场动作，再进入可见互动。'
                : '承接最近AI输出，再接入用户动作继续推进。');
        const contextEntryEvent = toShortText(context.entry_event || '', 120) || '无';
        const contextRecentAssistant = toTailText(context.recent_assistant || '', 200) || '无';
        const contextRecentUser = toShortText(context.recent_user || '', 220) || '无';
        const endGuideline = toShortText(context.end_guideline || '', 180)
            || '本回合收束到可中断临时节点，不要求完成整节拍，且不得超出用户输入边界。';
        const currentOriginal = String(currentBeat?.original_text || '').trim();
        const currentOriginalForPrompt = currentOriginal || '无';
        const prefix = getLanguagePrefix ? getLanguagePrefix() : '';
        return `${prefix}${[
            '你是“互动小说导演”。你的职责是：基于已锁定的当前节拍，为演员AI生成可直接执行的演出步骤框架。',
            '',
            '核心原则：',
            '1) 以用户本轮输入为绝对边界，导演只能在边界内组织演出，不得越界补写关键动作或结果。',
            '2) 你要结合：当前节拍原文、最近AI输出、最近用户输入，输出可执行框架。',
            '3)  必须基于当前节拍原文证据输出 direction_script（起点-过程-终点）。direction_script.action_chain 必须是单个字符串，包含2-4段递进动作并用"→"连接。格式示例：主角出门→遇到胖子→路上闲扯→到潘家园。',
            '4) direction_script.start 必须参考“起笔锚点”；禁止从当前节拍原文末尾直接续写。',
            '5) direction_script.end 只写“本回合临时收束点”，不要求完成整节拍，也不得暗示自动切拍。',
            '6) 未经用户明确输入，不得主动切换主角所在场景；若用户明确提出切拍/转场，按系统锁定节拍执行。',
            '',
            '剧情内容与推进核心原则（压缩版）：',
            '- 台词输入：仅创作世界与非主角角色的反应及下一状态，不预判用户反应，不描写用户沉默。',
            '- 框架输入：内容必须限定在用户给出的剧情框架区间内，可补充他者观察、互动与环境变化。',
            '- 混合输入：同时遵循台词与框架规则，既不越界创作剧情，也不代劳主角心理。',
            '',
            '演绎步骤格式示例：',
            '「主角出门→遇到胖子→路上闲扯→到潘家园」',
            '「大金牙凑过来→互相搭话→认下交情」', 
            '「掏帛书→讲帛书历史→主角认出爷爷的笔记」',
            '要求：每个步骤为短动宾结构，步骤间有明确的因果或时间递进关系。',
            '输出硬规则：',
            '1) 只输出 JSON，不要代码块，不要解释文字。',
            '2) direction_script.action_chain 必须是单行字符串，包含2-4段递进动作并用"→"连接，例如：动作A→动作B→动作C。禁止输出 direction_script.steps 数组。',
            `3) stage_idx 必须固定为 ${currentBeatIdx}（系统已完成切拍控制）。`,
            '4) direction_script.start 需要参考“起笔锚点”；direction_script.end 需要直接引用“临时收束”目标。',

            `章节：${chapterTitle}`,
            `本章摘要：${chapterOutline}`,
            `当前阶段索引：${currentBeatIdx}`,
            `用户最新输入：${toShortText(latestUserMessage || '无', 320) || '无'}`,

            '起笔锚点上下文：',
            `- 场景模式：${contextMode === 'new_beat' ? '新入节拍' : '节拍中段续写'}`,
            `- 最近AI输出末尾（优先锚点）：${contextRecentAssistant}`,  // ✅ 始终显示
            contextMode === 'new_beat'
                ? `- 入场事件：${contextEntryEvent}`                      // 新拍特有
                : '',  
            '当前节拍小说原文（优先依据）：',
            currentOriginalForPrompt,
            `- 最近用户动作（次级锚点）：${contextRecentUser}`,

            `- 起笔锚点：${startAnchor}`,
            `- 本回合收束目标：${endGuideline}`,
            
            '节拍列表（供定位阶段）：',
            JSON.stringify(compactBeats, null, 2),



            '输出 JSON 模板：',
            '{',
            '  "stage_idx": 0,',
            '  "direction_script": {',
            '    "action_chain": "动作A→动作B→动作C",',
            '    "start": "...",',
            '    "end": "..."',
            '  }',
            '}',
        ].join('\n')}`;
    }

    function buildDefaultDirectionScript(currentBeat, nextBeat, directionContext = {}) {
        const currentSummary = toShortText(currentBeat?.summary || '当前节拍', 200) || '当前节拍';
        const nextSummary = toShortText(nextBeat?.summary || '下一节拍', 200) || '下一节拍';
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const mode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(context.start_anchor || '', 160);
        const recentAssistant = toTailText(context.recent_assistant || '', 160);
        const recentUser = toShortText(context.recent_user || '', 160);
        const entryEvent = toShortText(context.entry_event || '', 100);
        const endGuideline = toShortText(context.end_guideline || '', 160)
            || '本回合收束到可承接的临时节点，不要求完成整节拍。';

        if (mode === 'new_beat') {
            const steps = [
                entryEvent
                    ? `先启动“${entryEvent}”对应的入场动作，不复述整段背景。`
                    : '直接进入当前节拍的首个可见动作，不重铺背景。',
                `围绕“${currentSummary}”推进1-2个具体互动动作，形成可见变化。`,
            ];
            return {
                start: startAnchor || `先以“${entryEvent || currentSummary}”触发当前节拍开场，再进入可见动作。`,
                action_chain: buildActionChain(steps),
                steps,
                end: endGuideline,
            };
        }

        const inBeatStart = startAnchor
            || (recentAssistant
                ? `优先承接最近AI输出“${recentAssistant}”，再接入用户动作继续推进。`
                : (recentUser
                    ? `承接最近用户动作“${recentUser}”继续推进，不重铺背景。`
                    : `从“${currentSummary}”已进行中的局面继续推进，不复述背景。`));
        const steps = [
            `围绕“${currentSummary}”推进1-2个具体互动动作，不空转。`,
            `让互动产生一个清晰变化（信息、关系或局势其一），必要时为“${nextSummary}”保留可追问钩子。`,
        ];
        return {
            start: inBeatStart,
            action_chain: buildActionChain(steps),
            steps,
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

        const sourceChainText = source.action_chain || source.actionChain || source.chain
            || (typeof source.process === 'string' ? source.process : '');
        const sourceChainSteps = splitActionChain(sourceChainText, 4);
        const fallbackChainText = fallback.action_chain || fallback.actionChain || fallback.chain || '';
        const fallbackChainSteps = splitActionChain(fallbackChainText, 4);
        const fallbackSteps = [
            ...(Array.isArray(fallback.steps) ? fallback.steps : []),
            ...fallbackChainSteps,
        ]
            .map((step) => normalizeActionSegment(step, 120))
            .filter(Boolean)
            .slice(0, 4);

        const steps = (stepCandidates.length > 0 ? stepCandidates : sourceChainSteps)
            .map((step) => normalizeActionSegment(step, 120))
            .filter(Boolean)
            .slice(0, 4);

        while (steps.length < 2) {
            const nextFallback = fallbackSteps[steps.length] || '沿当前目标继续推进，并确保动作可见。';
            const normalized = normalizeActionSegment(nextFallback, 120);
            if (!normalized) break;
            steps.push(normalized);
        }

        const normalizedActionChain = buildActionChain(steps);

        const end = toShortText(
            source.end || source.closing || source.finish || fallback.end || '',
            180
        );

        return {
            start: start || toShortText(fallback.start || '从当前局面直接接续。', 180),
            action_chain: normalizedActionChain || buildActionChain(fallbackSteps),
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
                    direction: 'none',
                    signal,
                    reason: 'last-beat-no-advance',
                };
            }
            return {
                switched: true,
                lockedBeatIdx: safeCurrentIdx + 1,
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
                    direction: 'none',
                    signal,
                    reason: 'first-beat-no-backward',
                };
            }
            return {
                switched: true,
                lockedBeatIdx: safeCurrentIdx - 1,
                direction: 'prev',
                signal,
                reason: 'user-switched-prev',
            };
        }

        return {
            switched: false,
            lockedBeatIdx: safeCurrentIdx,
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

        const stageIdx = Math.max(0, Math.min(maxIdx, parsedIdx));
        const targetBeat = beats[stageIdx] || beats[0] || null;
        const nextBeat = beats[Math.min(maxIdx, stageIdx + 1)] || null;
        const fallbackDirectionScript = buildDefaultDirectionScript(targetBeat, nextBeat, directionContext);
        const directionScript = normalizeDirectionScript(
            rawDecision?.direction_script || rawDecision?.directionScript || rawDecision?.director_script || rawDecision?.guidance,
            fallbackDirectionScript
        );

        return {
            stage_idx: stageIdx,
            direction_script: directionScript,
        };
    }

    function buildFallbackDecision(currentBeatIdx, beats, reason = 'fallback', directionContext = {}) {
        const safeIdx = Math.max(0, Math.min(currentBeatIdx, Math.max(0, beats.length - 1)));
        const currentBeat = beats[safeIdx] || beats[0] || null;
        const nextBeat = beats[safeIdx + 1] || null;
        const directionScript = buildDefaultDirectionScript(currentBeat, nextBeat, directionContext);
        return {
            stage_idx: safeIdx,
            direction_script: directionScript,
            reason,
        };
    }

    function stripExistingDirectorInjection(chat) {
        if (!Array.isArray(chat)) return;
        for (let i = chat.length - 1; i >= 0; i--) {
            const item = chat[i];
            if (item?.is_westworld_director === true || item?.is_storyweaver_director === true) {
                chat.splice(i, 1);
                continue;
            }
            const itemContent = String(item?.content || item?.mes || '');
            if (
                itemContent.includes('# StoryWeaver 导演提示（宽松模式）')
                || itemContent.includes('# StoryWeaver 导演提示（硬导演模式）')
                || itemContent.includes('# WestWorld 导演提示（宽松模式）')
                || itemContent.includes('# WestWorld 导演提示（硬导演模式）')
            ) {
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
        const switchedStage = stageIdx !== previousStageIdx;
        const currentOriginal = String(currentBeat?.original_text || '').trim();
        const currentOriginalSection = currentOriginal || '（当前节拍缺少原文，请优先遵循导演演绎指导并保持语气连续）';
        const nextBeatSummary = toShortText(
            decision?.next_beat_summary
            || nextBeat?.summary
            || '',
            120
        ) || '（当前已是最后节拍）';
        const nextBeatEntryEvent = toShortText(
            decision?.next_beat_entry_event
            || nextBeat?.entryEvent
            || '',
            140
        ) || '（无）';
        const nextBeatPreview200 = toHeadText(
            decision?.next_beat_preview_200
            || nextBeat?.original_text
            || '',
            220
        ) || '（当前已是最后节拍，无下一节拍原文预览）';
        const currentExitCondition = toShortText(currentBeat?.exitCondition || '', 140) || '无明确退出事件';
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
            buildDefaultDirectionScript(currentBeat, nextBeat, directionContext)
        );
        const actionChainSteps = splitActionChain(directionScript.action_chain || '', 4);
        const steps = actionChainSteps.length > 0
            ? actionChainSteps
            : (Array.isArray(directionScript.steps) && directionScript.steps.length > 0
                ? directionScript.steps
                : ['围绕当前节拍推进一个可见动作。', '在可承接位置收束本轮输出。']);
        const actionChain = buildActionChain(steps);

        const processLines = steps
            .slice(0, 4)
            .map((step, idx) => `  ${idx + 1}. ${step}`);

        return [
            '# WestWorld 导演->演员执行单（硬导演模式）',
            '导演：演员秋青子就位！以下内容是导演给你的系统级执行指令，不是给用户看的解释。',
            `- 当前阶段事件梗概: ${currentBeat?.id || `b${stageIdx + 1}`} ${currentBeat?.summary || '当前节拍'}`,
            '- 输出要求: 按当前预设格式输出剧情正文内容，不要复述本执行单，不要解释规则。',
            '- 禁止事项: 禁止按当前节拍原文末尾直接续写；禁止越出当前节拍范围。',
            '⚠️ 【位置指针】本回合的“唯一起演位置”以【起点】为准：你的第一句必须从【起点】描述的画面/动作起笔，不得从聊天记录最后一句或“当前节拍原文”的末尾接续。',
            '',
            '## 1) 当前节拍原文背景（仅供理解设定与场景，不是起笔位置）',
            '提示：不得从下方原文最后一句/末段直接接续；起笔位置以【起点】为准。',
            currentOriginalSection,
            '',
            '## 2) 导演演绎指导（起点 -> 过程 -> 终点）',
            `- 【起点 - 唯一开始位置】: ${directionScript.start}`,
            `- 动作链: ${actionChain || '围绕当前节拍推进可见动作并收束。'}`,
            '- 过程:',
            ...processLines,
            `- 终点: ${directionScript.end}`,
            switchedStage
                ? '- 执行要求: 本回合发生切拍时，先用1-2句完成过渡/回接，再进入动作链；终点只做临时收束，不等于继续切拍。'
                : '- 执行要求: 严格停留在当前节拍内推进动作链；终点只做临时收束，不得跳出当前节拍。',
            '',
            '## 3) 下一节拍预览（仅参考，禁止提前展开）',
            `- 下一节拍摘要: ${nextBeatSummary}`,
            `- 下一节拍原文前200字: ${nextBeatPreview200}`,
            `- 当前节拍退出事件: ${currentExitCondition}`,
            '- 结尾软要求: 先对照“导演给出的终点”和“当前节拍退出事件”。仅当两者完全吻合或高度吻合时，最后1-2句才可做趋势性引出，承接下一节拍。',
            '- 结尾限制: 若终点与退出事件不吻合，禁止引出下一节拍，继续在当前节拍内收束。',
            '',
            `【起笔复述】第一句必须从【起点】起笔：${directionScript.start}`,
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
        const turnPrefix = buildDirectorTurnPrefix(chapterIndex);
        directorDebug(`start chapter=${chapterIndex + 1}, beat=${currentBeatIdx + 1}/${beats.length}`);

        const latestUserMessage = getLatestUserMessage(eventData);
        const latestAssistantMessage = getLatestAssistantMessage(eventData);
        const latestDialogue = getLatestDialogue(eventData);
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
        directorDebug(`switch-command=${switchCommand.requested ? `on(${switchCommand.signal || 'explicit'})` : 'off'}`);
        directorDebug(`switch-control=${switchControl.reason}, lockedBeat=${lockedBeatIdx + 1}/${beats.length}`);
        directorDebug(`start-mode=${directionContext.mode}, prevBeat=${previousBeatIdx >= 0 ? previousBeatIdx + 1 : 0}`);

        const prompt = buildDirectorPrompt({
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            chapterOutline: toShortText(memory.chapterOutline || '', 200),
            currentBeatIdx: lockedBeatIdx,
            beats,
            latestDialogue,
            latestUserMessage,
            directionContext,
        });

        let decision = null;
        let decisionSource = 'model';
        try {
            if (typeof updateStreamContent === 'function') {
                updateStreamContent(`🧭 ${turnPrefix} 发起回合判定请求（节拍 ${lockedBeatIdx + 1}/${beats.length}）\n`);
            }
            const response = await callDirectorAPI(prompt, chapterIndex + 1);
            if (typeof updateStreamContent === 'function') {
                updateStreamContent(`✅ ${turnPrefix} 判定请求成功，响应 ${String(response || '').length} 字符\n`);
            }
            const parsed = extractJsonObject(response);
            if (!parsed) {
                directorWarn('导演返回内容无法解析为JSON，已使用回退判定', toShortText(response, 220));
                if (typeof updateStreamContent === 'function') {
                    updateStreamContent(`⚠️ ${turnPrefix} 响应不是有效JSON，已切换回退判定\n`);
                }
                decision = buildFallbackDecision(lockedBeatIdx, beats, 'parse-fallback', directionContext);
                decisionSource = 'fallback-parse';
            } else {
                decision = normalizeDecision(parsed, lockedBeatIdx, beats, directionContext);
            }
        } catch (error) {
            directorWarn('导演判定失败，已使用回退判定', error?.message || String(error));
            if (typeof updateStreamContent === 'function') {
                updateStreamContent(`❌ ${turnPrefix} 判定请求失败: ${error?.message || String(error)}\n`);
                updateStreamContent(`⚠️ ${turnPrefix} 已启用本地回退判定\n`);
            }
            decision = buildFallbackDecision(lockedBeatIdx, beats, 'error-fallback', directionContext);
            decisionSource = 'fallback-error';
        }

        // 节拍切换由流程层决定，导演输出仅负责“怎么演”。
        decision.stage_idx = lockedBeatIdx;
        decision.switch_direction = switchControl.direction;
        decision.switch_signal = switchControl.signal;
        decision.switch_gate = switchControl.reason;
        decision.is_new_beat = isNewBeat;
        decision.direction_context = directionContext;
        decision.latest_assistant_message = toTailText(latestAssistantMessage || '', 200);
        decision.latest_user_message = toShortText(latestUserMessage || '', 220);

        const nextBeat = beats[lockedBeatIdx + 1] || null;
        const nextBeatSummary = toShortText(nextBeat?.summary || '', 200);
        const nextBeatEntryEvent = toShortText(nextBeat?.entryEvent || '', 140);
        const nextBeatPreview200 = toHeadText(nextBeat?.original_text || '', 200)
            || (nextBeatSummary ? `摘要：${nextBeatSummary}` : '');

        decision.next_beat_summary = nextBeatSummary || '';
        decision.next_beat_entry_event = nextBeatEntryEvent || '';
        decision.next_beat_preview_200 = nextBeatPreview200 || '';
        decision.direction_context = {
            ...decision.direction_context,
            next_beat_summary: nextBeatSummary || '',
            next_beat_entry_event: nextBeatEntryEvent || '',
        };

        const decisionActionChainSteps = splitActionChain(decision?.direction_script?.action_chain || '', 4);
        const hasValidActionChain = decisionActionChainSteps.length >= 2;
        const hasValidSteps = Array.isArray(decision?.direction_script?.steps) && decision.direction_script.steps.length >= 2;
        if (!decision?.direction_script || (!hasValidActionChain && !hasValidSteps)) {
            directorDebug('invalid-direction-script fallback applied');
            decision.direction_script = normalizeDirectionScript(
                decision.direction_script,
                buildDefaultDirectionScript(
                    beats[lockedBeatIdx] || null,
                    beats[lockedBeatIdx + 1] || null,
                    directionContext
                )
            );
        }

        decision.previous_stage_idx = currentBeatIdx;

        directorInfo(`判定完成 source=${decisionSource}, stage=${decision.stage_idx}, switch=${decision.switch_direction || 'none'}`);
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`✅ ${turnPrefix} 判定完成：source=${decisionSource}, 锁定节拍=${decision.stage_idx + 1}/${beats.length}, switch=${decision.switch_direction || 'none'}\n`);
        }

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
            is_westworld_director: true,
            is_storyweaver_director: true,
        });
        directorInfo(`注入完成 chapter=${chapterIndex + 1}, activeBeat=${decision.stage_idx + 1}`);
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`✅ ${turnPrefix} 注入导演提示词完成（activeBeat=${decision.stage_idx + 1}）\n`);
        }

        return decision;
    }

    return {
        runDirectorBeforeGeneration,
    };
}
