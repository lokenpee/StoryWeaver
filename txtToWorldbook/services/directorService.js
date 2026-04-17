import {
    defaultDirectorFrameworkPrompt,
    defaultDirectorInjectionPrompt,
} from '../core/constants.js';

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

    function renderPromptTemplate(template, variables = {}) {
        let output = String(template || '');
        for (const [key, value] of Object.entries(variables)) {
            output = output.split(`{${key}}`).join(value == null ? '' : String(value));
        }
        return output;
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

    function normalizeCompareText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[\u2000-\u206F\u2E00-\u2E7F'"`~!@#$%^&*()\-_=+\[\]{}\\|;:,.<>/?，。！？；：、“”‘’（）【】《》…—\n\r\t]+/g, '');
    }

    function scoreSummaryAgainstOriginal(summary, originalText) {
        const s = normalizeCompareText(summary);
        const t = normalizeCompareText(originalText);
        if (!s || !t) return 0;

        const probeLen = Math.min(12, s.length);
        if (probeLen >= 6 && t.includes(s.slice(0, probeLen))) {
            return 1;
        }

        let hit = 0;
        const unique = new Set(s.split(''));
        for (const ch of unique) {
            if (t.includes(ch)) hit++;
        }
        return unique.size > 0 ? (hit / unique.size) * 0.5 : 0;
    }

    function isDefaultEntryEvent(text) {
        const raw = String(text || '').trim();
        return (
            !raw
            || raw === '从上一节拍结果自然衔接进入当前事件。'
            || raw === '从上一节拍结果自然进入当前节拍。'
            || raw === '从上一节拍结果自然衔接进入当前事件'
            || raw === '从上一节拍结果自然进入当前节拍'
        );
    }

    function isDefaultExitCondition(text) {
        const raw = String(text || '').trim();
        return (
            !raw
            || raw === '等待关键互动完成'
            || raw === '等待用户行动或关键互动完成'
            || raw === '等待关键互动完成。'
            || raw === '等待用户行动或关键互动完成。'
            || raw === '当本节拍核心目标完成或局势发生明显转折时。'
        );
    }

    function maybeRepairShiftedBeatMetadata(rawBeats) {
        const beats = Array.isArray(rawBeats)
            ? rawBeats.map((beat, idx) => normalizeBeat(beat, idx))
            : [];
        if (beats.length < 3) return beats;

        const first = beats[0] || {};
        const firstLooksDefault = isDefaultEntryEvent(first.entryEvent) || isDefaultExitCondition(first.exitCondition);

        let shiftedVotes = 0;
        let totalVotes = 0;
        for (let i = 1; i < beats.length; i++) {
            const summary = String(beats[i]?.summary || '').trim();
            if (!summary) continue;

            const prevScore = scoreSummaryAgainstOriginal(summary, beats[i - 1]?.original_text || '');
            const currentScore = scoreSummaryAgainstOriginal(summary, beats[i]?.original_text || '');
            if (prevScore <= 0 && currentScore <= 0) continue;

            totalVotes++;
            if (prevScore > currentScore + 0.08) {
                shiftedVotes++;
            }
        }

        const shouldRepair = firstLooksDefault
            && totalVotes >= 2
            && shiftedVotes >= Math.max(2, Math.ceil(totalVotes * 0.6));

        if (!shouldRepair) return beats;

        const repaired = beats.map((beat) => ({
            ...beat,
            tags: Array.isArray(beat.tags) ? [...beat.tags] : [],
            split_rule: normalizeSplitRule(beat.split_rule || {}),
        }));

        for (let i = 0; i < repaired.length - 1; i++) {
            const source = beats[i + 1] || {};
            repaired[i].summary = String(source.summary || '').trim() || repaired[i].summary;
            repaired[i].event_summary = repaired[i].summary;
            repaired[i].entryEvent = String(source.entryEvent || '').trim() || repaired[i].entryEvent;
            repaired[i].exitCondition = String(source.exitCondition || '').trim() || repaired[i].exitCondition;
            repaired[i].tags = Array.isArray(source.tags) ? [...source.tags] : repaired[i].tags;
            repaired[i].split_rule = normalizeSplitRule(source.split_rule || repaired[i].split_rule || {});
        }

        const lastIdx = repaired.length - 1;
        const last = repaired[lastIdx];
        const lastSummary = toShortText(last?.original_text || '', 200)
            || String(last?.summary || '').trim()
            || `事件点${lastIdx + 1}`;
        last.summary = lastSummary;
        last.event_summary = lastSummary;
        if (isDefaultEntryEvent(last.entryEvent)) {
            last.entryEvent = `以“${toShortText(lastSummary, 60) || `事件点${lastIdx + 1}`}”为起点展开当前节拍动作。`;
        }
        if (isDefaultExitCondition(last.exitCondition)) {
            last.exitCondition = '当本节拍核心目标完成或局势发生明显转折时。';
        }

        directorWarn('检测到历史节拍字段整体错位，已自动执行对齐修复');
        return repaired;
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
            memory.chapterScript.beats = maybeRepairShiftedBeatMetadata(memory.chapterScript.beats);
            return memory.chapterScript.beats;
        }

        const keyNodes = Array.isArray(memory.chapterScript.keyNodes)
            ? memory.chapterScript.keyNodes.map((n) => toShortText(n, 80)).filter(Boolean)
            : [];

        memory.chapterScript.beats = ensureMinimumBeatCount(
            keyNodes.map((node, idx) => normalizeBeat({ summary: node }, idx)),
            `${memory.chapterOutline || ''} ${keyNodes.join('，')}`
        );
        memory.chapterScript.beats = maybeRepairShiftedBeatMetadata(memory.chapterScript.beats);
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

    function buildDirectionContext({
        beats,
        currentBeatIdx,
        isNewBeat = false,
        latestAssistantMessage = '',
        latestUserMessage = '',
        isLargeBeatJump = false,
        beatJumpDistance = 0,
    }) {
        const maxIdx = Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);
        const safeIdx = Math.max(0, Math.min(currentBeatIdx || 0, maxIdx));
        const currentBeat = Array.isArray(beats) ? (beats[safeIdx] || beats[0] || null) : null;
        const entryEvent = toShortText(currentBeat?.entryEvent || '', 120);
        const recentAssistant = toTailText(latestAssistantMessage || '', 200);
        const recentUser = toShortText(latestUserMessage || '', 220);
        const jumpDistance = Math.max(0, Number.isFinite(Number(beatJumpDistance)) ? Number(beatJumpDistance) : 0);
        const hasLargeBeatJump = isLargeBeatJump === true || jumpDistance >= 2;

        let startAnchor = '';
        if (hasLargeBeatJump) {
            if (entryEvent) {
                startAnchor = `检测到跨节拍跳转（约${Math.max(2, Math.round(jumpDistance))}拍），本回合以“${entryEvent}”作为新起点，不承接最近AI输出末尾。`;
            } else if (recentUser) {
                startAnchor = `检测到跨节拍跳转（约${Math.max(2, Math.round(jumpDistance))}拍），以用户当前互动“${recentUser}”作为新起点，不承接最近AI输出末尾。`;
            } else {
                startAnchor = '检测到跨节拍跳转，本回合从当前节拍可见起点直接开场，不承接最近AI输出末尾。';
            }
        } else if (recentAssistant) {
            if (isNewBeat && entryEvent) {
                startAnchor = `先承接最近AI输出末尾“${recentAssistant}”角色行为或话语，再以“${entryEvent}”触发入场事件。`;
            } else {
                startAnchor = `优先承接最近AI输出末尾“${recentAssistant}”角色行为或话语。`;
            }   
        } else if (entryEvent) {
            startAnchor = `以“${entryEvent}”作为入场触发继续推进，并与用户当前互动保持连续。`;
        } else if (recentUser) {
            startAnchor = `以用户刚给出的互动“${recentUser}”作为当前起点继续推进，不补写超出输入边界的动作。`;
        } else {
            startAnchor = '从当前可见动作直接续写，保持连续，不补写超出用户输入边界的剧情。';
        }
         // ===== end_guideline 新增逻辑 =====

        const freePlayKeywords = /自由推进|随意推进|自由发挥|随意发挥|自由演绎|随意演绎|你继续|你推进|自由写|随便写|随意写|自由发挥剧情|随意发挥剧情/;
        const isFreePlay = freePlayKeywords.test(recentUser);

        let endGuideline = '';
        if (isFreePlay) {
            endGuideline = '本回合只需收束到可中断的临时节点（小结果、可追问钩子或局势变化），不要求完成整个节拍；';
        } else if (recentUser) {
            endGuideline = `以用户本轮输入末尾的可见状态为收束锚点，不得越界续写用户未给出的后续动作或结果。`;
        } else {
            endGuideline = '本回合收束到可承接的临时节点，不要求完成整节拍。';
        }
        return {
            mode: isNewBeat ? 'new_beat' : 'in_beat',
            start_anchor: toShortText(startAnchor, 180),
            end_guideline: toShortText(endGuideline, 180),
            entry_event: entryEvent || '',
            recent_assistant: recentAssistant || '',
            recent_user: recentUser || '',
            is_large_beat_jump: hasLargeBeatJump,
            beat_jump_distance: jumpDistance,
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
        const template = String(AppState?.settings?.customDirectorFrameworkPrompt || '').trim() || defaultDirectorFrameworkPrompt;
        const contextModeLabel = contextMode === 'new_beat' ? '新入节拍' : '节拍中段续写';
        const entryEventLine = contextMode === 'new_beat' ? `- 入场事件：${contextEntryEvent}` : '';
        const promptBody = renderPromptTemplate(template, {
            CHAPTER_TITLE: String(chapterTitle || ''),
            CHAPTER_OUTLINE: String(chapterOutline || ''),
            CURRENT_BEAT_INDEX: String(currentBeatIdx),
            LATEST_USER_MESSAGE: toShortText(latestUserMessage || '无', 320) || '无',
            CONTEXT_MODE_LABEL: contextModeLabel,
            RECENT_ASSISTANT: contextRecentAssistant,
            ENTRY_EVENT_LINE: entryEventLine,
            CURRENT_BEAT_ORIGINAL: currentOriginalForPrompt,
            RECENT_USER: contextRecentUser,
            START_ANCHOR: startAnchor,
            END_GUIDELINE: endGuideline,
            COMPACT_BEATS_JSON: JSON.stringify(compactBeats, null, 2),
            FIXED_STAGE_IDX: String(currentBeatIdx),
        });
        const prefix = getLanguagePrefix ? getLanguagePrefix() : '';
        return `${prefix}${promptBody}`;
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
            .map((step, idx) => `  ${idx + 1}. ${step}`)
            .join('\n');

        const stageExecutionRequirement = switchedStage
            ? '- 执行要求: 本回合发生切拍时，先用1-2句完成过渡/回接，再进入动作链；终点只做临时收束，不等于继续切拍。'
            : '- 执行要求: 严格停留在当前节拍内推进动作链；终点只做临时收束，不得跳出当前节拍。';

        const template = String(AppState?.settings?.customDirectorInjectionPrompt || '').trim() || defaultDirectorInjectionPrompt;
        return renderPromptTemplate(template, {
            CURRENT_BEAT_ID: String(currentBeat?.id || `b${stageIdx + 1}`),
            CURRENT_BEAT_SUMMARY: String(currentBeat?.summary || '当前节拍'),
            CURRENT_BEAT_ORIGINAL: currentOriginalSection,
            DIRECTION_START: String(directionScript.start || '从当前局面直接接续。'),
            DIRECTION_ACTION_CHAIN: String(actionChain || '围绕当前节拍推进可见动作并收束。'),
            DIRECTION_PROCESS_LINES: processLines || '  1. 围绕当前节拍推进一个可见动作。\n  2. 在可承接位置收束本轮输出。',
            DIRECTION_END: String(directionScript.end || '本回合收束到可承接的临时节点。'),
            STAGE_EXECUTION_REQUIREMENT: stageExecutionRequirement,
            CURRENT_EXIT_CONDITION: currentExitCondition,
            NEXT_BEAT_SUMMARY: nextBeatSummary,
            NEXT_BEAT_ENTRY_EVENT: nextBeatEntryEvent,
            NEXT_BEAT_PREVIEW_200: nextBeatPreview200,
            START_RECAP: String(directionScript.start || '从当前局面直接接续。'),
        });
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
        const chapterQueue = Array.isArray(AppState.memory?.queue) ? AppState.memory.queue : [];
        const chapterMaxIdx = Math.max(0, chapterQueue.length - 1);
        const previousChapterIdx = Number.isInteger(AppState.experience?.lastChapterIdx)
            ? Math.max(0, Math.min(AppState.experience.lastChapterIdx, chapterMaxIdx))
            : chapterIndex;
        const chapterChanged = previousChapterIdx !== chapterIndex;

        const beatCountCache = new Map();
        beatCountCache.set(chapterIndex, beats.length);

        function getChapterBeatCount(idx) {
            if (!Number.isInteger(idx) || idx < 0 || idx > chapterMaxIdx) return 0;
            if (beatCountCache.has(idx)) return beatCountCache.get(idx);
            const chapterMemory = chapterQueue[idx];
            const chapterBeats = ensureChapterBeats(chapterMemory);
            const count = Array.isArray(chapterBeats) ? chapterBeats.length : 0;
            beatCountCache.set(idx, Math.max(0, count));
            return beatCountCache.get(idx);
        }

        function clampBeatIdxByChapter(idx, beatIdx) {
            if (!Number.isInteger(beatIdx)) return -1;
            const beatCount = getChapterBeatCount(idx);
            if (beatCount <= 0) return -1;
            return Math.max(0, Math.min(beatIdx, beatCount - 1));
        }

        function toGlobalBeatOrdinal(idx, beatIdx) {
            if (!Number.isInteger(idx) || idx < 0 || idx > chapterMaxIdx) return null;
            const safeBeatIdx = clampBeatIdxByChapter(idx, beatIdx);
            if (safeBeatIdx < 0) return null;
            let offset = 0;
            for (let i = 0; i < idx; i++) {
                offset += getChapterBeatCount(i);
            }
            return offset + safeBeatIdx;
        }

        const previousBeatIdx = clampBeatIdxByChapter(
            previousChapterIdx,
            Number.isInteger(AppState.experience?.lastBeatIdx) ? AppState.experience.lastBeatIdx : -1
        );
        const currentGlobalBeatOrdinal = toGlobalBeatOrdinal(chapterIndex, lockedBeatIdx);
        const previousGlobalBeatOrdinal = previousBeatIdx >= 0
            ? toGlobalBeatOrdinal(previousChapterIdx, previousBeatIdx)
            : null;
        const beatJumpDistance = (Number.isInteger(currentGlobalBeatOrdinal) && Number.isInteger(previousGlobalBeatOrdinal))
            ? Math.abs(currentGlobalBeatOrdinal - previousGlobalBeatOrdinal)
            : 0;
        const isLargeBeatJump = beatJumpDistance >= 2;
        const isNewBeat = (Number.isInteger(currentGlobalBeatOrdinal) && Number.isInteger(previousGlobalBeatOrdinal))
            ? currentGlobalBeatOrdinal !== previousGlobalBeatOrdinal
            : (chapterChanged || previousBeatIdx !== lockedBeatIdx);
        const directionContext = buildDirectionContext({
            beats,
            currentBeatIdx: lockedBeatIdx,
            isNewBeat,
            latestAssistantMessage,
            latestUserMessage,
            isLargeBeatJump,
            beatJumpDistance,
        });
        directorDebug(`switch-command=${switchCommand.requested ? `on(${switchCommand.signal || 'explicit'})` : 'off'}`);
        directorDebug(`switch-control=${switchControl.reason}, lockedBeat=${lockedBeatIdx + 1}/${beats.length}`);
        directorDebug(`jump-detect chapterChanged=${chapterChanged ? 'yes' : 'no'}, beatGap=${beatJumpDistance}, global=${previousGlobalBeatOrdinal ?? -1}->${currentGlobalBeatOrdinal ?? -1}`);
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
        decision.is_large_beat_jump = isLargeBeatJump;
        decision.beat_jump_distance = beatJumpDistance;
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
        AppState.experience.lastChapterIdx = chapterIndex;
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
