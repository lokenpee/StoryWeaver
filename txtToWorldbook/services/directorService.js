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

    const BEAT_COMPLETION_NOTICE_TEXT = '🎯 当前节拍剧情已推进到结尾，建议切换到下一节拍。';
    const BEAT_COMPLETION_NOTICE_TTL_MS = 15 * 60 * 1000;
    const ACTION_CHAIN_MIN_STEPS = 3;
    const ACTION_CHAIN_MAX_STEPS = 6;
    const RECENT_DIALOGUE_MAX_ITEMS = 6;

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

    function safeClone(value, fallback = null) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return fallback;
        }
    }

    function ensureDirectorDebugEntries() {
        if (!AppState.ui || typeof AppState.ui !== 'object') {
            AppState.ui = {};
        }
        if (!Array.isArray(AppState.ui.directorDebugEntries)) {
            AppState.ui.directorDebugEntries = [];
        }
        return AppState.ui.directorDebugEntries;
    }

    function publishDirectorDebugEntry(entry) {
        const entries = ensureDirectorDebugEntries();
        const item = {
            id: `director-debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            at: Date.now(),
            ...entry,
        };
        entries.unshift(item);
        if (entries.length > 20) {
            entries.length = 20;
        }
        AppState.ui.directorDebugSelectedId = item.id;

        try {
            window.dispatchEvent(new CustomEvent('westworld:director-debug-updated', { detail: { entry: item } }));
        } catch (_) {
            // Ignore environments without CustomEvent support.
        }

        return item;
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

    function normalizeBooleanFlag(value) {
        if (value === true) return true;
        if (value === false || value === null || value === undefined) return false;
        if (typeof value === 'number') return value === 1;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
        }
        return false;
    }

    function normalizeConflictLevel(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return 'normal';

        const aliasMap = {
            normal: 'normal',
            none: 'normal',
            ok: 'normal',
            soft: 'soft_conflict',
            'soft-conflict': 'soft_conflict',
            soft_conflict: 'soft_conflict',
            minor_conflict: 'soft_conflict',
            hard: 'hard_conflict',
            'hard-conflict': 'hard_conflict',
            hard_conflict: 'hard_conflict',
            major_conflict: 'hard_conflict',
            '正常': 'normal',
            '轻度冲突': 'soft_conflict',
            '软冲突': 'soft_conflict',
            '严重冲突': 'hard_conflict',
            '硬冲突': 'hard_conflict',
        };

        return aliasMap[raw] || 'normal';
    }

    function getConflictLevelLabel(conflictLevel) {
        switch (normalizeConflictLevel(conflictLevel)) {
            case 'soft_conflict':
                return 'soft_conflict（可扶回）';
            case 'hard_conflict':
                return 'hard_conflict（需改写）';
            default:
                return 'normal（照常推进）';
        }
    }

    function buildConflictRequirement(conflictLevel) {
        switch (normalizeConflictLevel(conflictLevel)) {
            case 'soft_conflict':
                return '必须接住用户这回合动作与意图，但不得把超出当前节拍边界的结果写成既成事实；若用户口头快进，只能截断到当前节拍内可成立的位置，并为下一回合保留自然扶回原剧情的轨道。';
            case 'hard_conflict':
                return '不得把用户字面越界结果写成既成事实；只保留其核心意图，将其改写为一个邻近、可成立、且不破坏当前或后续关键剧情前提的版本。';
            default:
                return '按用户当前方向推进，充分演完用户场景，不催促跳转，尾部留自然钩子。';
        }
    }

    function buildDefaultConflictReason(conflictLevel) {
        switch (normalizeConflictLevel(conflictLevel)) {
            case 'soft_conflict':
                return '用户输入有偏移，但仍可压回当前节拍边界内处理。';
            case 'hard_conflict':
                return '用户字面结果会破坏当前或后续关键剧情前提。';
            default:
                return '用户输入仍在当前节拍轨道内。';
        }
    }

    function buildDefaultConflictStrategy(conflictLevel) {
        switch (normalizeConflictLevel(conflictLevel)) {
            case 'soft_conflict':
                return '接住用户本回合动作，把越界结果截断在当前节拍内，并给下一回合保留自然接回原剧情的接口。';
            case 'hard_conflict':
                return '保留用户核心意图，通过打断、延迟或介入把字面结果改写成不破坏剧情的邻近版本。';
            default:
                return '按用户当前方向推进，吸收动作与细节，尾部留钩子指向后续可能。';
        }
    }

    function ensureDirectorInjectionTemplateCompatibility(template) {
        const base = String(template || '').trim() || defaultDirectorInjectionPrompt;
        const supplements = [];

        const hasConflictBlock = (
            base.includes('{CONFLICT_LEVEL}')
            && base.includes('{CONFLICT_REASON}')
            && base.includes('{CONFLICT_STRATEGY}')
            && base.includes('{CONFLICT_REQUIREMENT}')
        );
        if (!hasConflictBlock) {
            supplements.push(`## 系统补充：冲突控制
- 当前冲突级别: {CONFLICT_LEVEL}
- 冲突原因: {CONFLICT_REASON}
- 冲突处理策略: {CONFLICT_STRATEGY}
- 冲突执行要求: {CONFLICT_REQUIREMENT}
- 执行优先级: 冲突执行要求/冲突处理策略 > 起点/动作链/终点 > 当前节拍原文 > 下一节拍预览。`);
        }

        if (!base.includes('{DIRECTION_PROCESS_LINES}')) {
            supplements.push(`## 系统补充：过程动作
{DIRECTION_PROCESS_LINES}`);
        }

        if (!base.includes('{START_RECAP}')) {
            supplements.push(`【起笔复述】第一句必须参考【起点】：{START_RECAP}`);
        }

        if (!base.includes('不得代写用户未声明')) {
            supplements.push(`## 系统补充：主角权限
- 不得代写用户未声明的下一句台词、下一步动作、内心独白、沉默反应或最终决定。
- soft_conflict 时接住用户动作，但只能把结果落在当前节拍内可成立的位置。
- hard_conflict 时不得直接驳回用户，要把意图改写为受阻、被打断、被延迟或被旁人介入后的邻近版本。`);
        }

        return supplements.length > 0
            ? `${base}\n\n${supplements.join('\n\n')}`
            : base;
    }

    function ensureExperienceState() {
        if (!AppState.experience || typeof AppState.experience !== 'object') {
            AppState.experience = {};
        }
        if (!Object.prototype.hasOwnProperty.call(AppState.experience, 'pendingBeatCompletionNotice')) {
            AppState.experience.pendingBeatCompletionNotice = null;
        }
        return AppState.experience;
    }

    function getDecisionBeatIndex(decision) {
        if (Number.isInteger(decision?.stage_idx)) return decision.stage_idx;
        if (Number.isInteger(decision?.stageIdx)) return decision.stageIdx;
        if (Number.isInteger(decision?.lockedBeatIndex)) return decision.lockedBeatIndex;
        return -1;
    }

    function getDecisionChapterIndex(decision) {
        if (Number.isInteger(decision?.chapterIndex)) return decision.chapterIndex;
        if (Number.isInteger(decision?.chapter_idx)) return decision.chapter_idx;
        return -1;
    }

    function isSameBeatDecision(decision, chapterIndex, beatIndex, allowMissingChapter = false) {
        if (!decision || typeof decision !== 'object') return false;
        if (getDecisionBeatIndex(decision) !== beatIndex) return false;
        const decisionChapter = getDecisionChapterIndex(decision);
        return decisionChapter === chapterIndex || (allowMissingChapter && decisionChapter < 0);
    }

    function resolvePreviousBeatCompletionState({ chapterIndex, beatIndex, memory }) {
        const experience = ensureExperienceState();
        const candidates = [
            {
                decision: experience.directorLastDecision,
                allowMissingChapter: experience.lastChapterIdx === chapterIndex && experience.lastBeatIdx === beatIndex,
            },
            {
                decision: memory?.directorDecision,
                allowMissingChapter: true,
            },
        ];

        for (const candidate of candidates) {
            const decision = candidate.decision;
            if (!isSameBeatDecision(decision, chapterIndex, beatIndex, candidate.allowMissingChapter)) continue;
            return {
                willCompleteThisLastTurn: normalizeBooleanFlag(decision?.will_complete_this_turn ?? decision?.willCompleteThisTurn),
                beatCompleteReason: String(decision?.beat_complete_reason || decision?.beatCompleteReason || '').trim(),
            };
        }

        return {
            willCompleteThisLastTurn: false,
            beatCompleteReason: '',
        };
    }

    function normalizeActionSegment(text, maxLen = 180) {
        const plain = String(text || '')
            .replace(/[“”"']/g, '')
            .replace(/[「」]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return toShortText(plain, maxLen);
    }

    function splitActionChain(actionChain, limit = ACTION_CHAIN_MAX_STEPS) {
        const normalized = String(actionChain || '')
            .replace(/[\r\n]+/g, '→')
            .replace(/\s*→\s*/g, '→')
            .trim();
        if (!normalized) return [];
        return normalized
            .split('→')
            .map((segment) => normalizeActionSegment(segment, 180))
            .filter(Boolean)
            .slice(0, limit);
    }

    function buildActionChain(steps, maxLen = 720) {
        const normalizedSteps = Array.isArray(steps)
            ? steps
                .map((step) => normalizeActionSegment(step, 180))
                .filter(Boolean)
                .slice(0, ACTION_CHAIN_MAX_STEPS)
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
            entryEvent: toShortText(source.entryEvent || source.entry_event || '', 120),
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

    function getGenerationChatHistory(eventData) {
        const promptChat = Array.isArray(eventData?.chat) ? eventData.chat : [];
        if (hasDialogueChatItems(promptChat)) return promptChat;
        const realChat = getSillyTavernChatHistory();
        if (Array.isArray(realChat) && realChat.length > 0) return realChat;
        return promptChat;
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
        if (item?._westworld_beat_completion_notice === true || item?._storyweaver_beat_completion_notice === true) return false;
        if (item?.prefix === true) return false;
        return true;
    }

    function hasDialogueChatItems(chat) {
        if (!Array.isArray(chat)) return false;
        return chat.some((item) => (
            (isUserChatItem(item) || isAssistantChatItem(item))
            && !!getChatItemContent(item)
        ));
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

    function buildRecentDialogueContext(eventData, options = {}) {
        const {
            maxItems = RECENT_DIALOGUE_MAX_ITEMS,
        } = options;
        const chat = getGenerationChatHistory(eventData);
        const picked = [];

        for (let i = chat.length - 1; i >= 0 && picked.length < maxItems; i--) {
            const item = chat[i] || {};
            let role = '';
            if (isUserChatItem(item)) {
                role = 'user';
            } else if (isAssistantChatItem(item)) {
                role = 'assistant';
            }
            if (!role) continue;

            const content = getChatItemContent(item);
            if (!content) continue;
            picked.push({ role, content });
        }

        if (picked.length === 0) return '';

        const lines = picked.reverse().map((item) => {
            const label = item.role === 'user' ? '用户' : 'AI';
            return `${label}: ${item.content}`;
        });

        return lines.join('\n');
    }

    function buildRecentStatePriorityBlock(recentDialogue) {
        const dialogue = String(recentDialogue || '').trim() || '无最近对话';
        return `【任务优先级（先读）】
1. 最新对话事实 = 实际剧情状态。最近三轮对话中已经成立的事实，高于当前节拍原文。
2. 当前用户输入 = 本回合边界。必须接住用户动作与核心意图，不得替用户补写未声明的后续动作、台词、心理或决定。
3. 当前锁定节拍 = 剧情目标。节拍原文只提供素材、气氛和目标方向，不能覆盖最新对话事实。
4. 导演框架 = 本回合执行骨架。起点、动作链、终点必须从实际剧情状态出发，控制在当前节拍内。
5. 冲突判定 = 只处理会破坏后续关键前提的内容。普通插曲、延迟、替代行为和合理偏移优先判 normal。
6. 主线推进 = 方向钩子，不是代替用户行动。未被用户明确触发的转场、上楼、离开现场、抵达下一节点，只能写成环境压力、NPC提醒或未完成线索，不得写成用户已经完成。
7. 单回合节奏 = 慢写和扩写，不是缩短动作链。动作链可以完整，但每段应围绕当前局部动作、人物反应、环境细节或信息变化展开；除非用户明确快进或用户动作已经实际触发退出事件，不得跨过多个原文事件、直接写完整个节拍。

最近三轮对话事实（原文，不压缩）：
${dialogue}`;
    }

    function buildDirectorPromptFinalChecklist() {
        return `【导演输出前最终校验】
- stage_idx 必须保持系统锁定值，不自行跳拍。
- conflict_level / conflict_reason / conflict_strategy 必须同时对照用户输入、最近对话事实、当前节拍和后续关键前提。
- direction_script.start 必须从最近对话的实际状态起笔，不从节拍原文头部重开。
- direction_script.action_chain 必须是3-6段具体可见动作，避免空泛概括；每一段都应扩写当前局部过程，不得用动作链跨过多个原文事件或直接抵达节拍结尾。
- direction_script.end 必须收束到本回合可承接的临时节点，不替用户决定下一步。
- will_complete_this_turn 只有在用户输入或最近对话状态已经实际抵达当前节拍退出事件时才可为 true；仅放出主线方向钩子时必须为 false。
- will_complete_this_last_turn 只表示上一轮判断，不得强制本轮继续耗尽；若用户本轮继续做不破坏剧情的互动，可以回落为 false。
- 只输出规定 JSON，不输出解释。`;
    }

    function buildActorInjectionFinalChecklist() {
        return `【演员执行前最终校验】
- 先按导演给出的起点、动作链、终点执行，再参考节拍原文补素材。
- 可以扩写语气、动作细节、环境和即时反应，但这些扩写只能服务于导演动作链；不得自行新增导演框架外的关键事件，也不得把节拍原文后续内容补完。
- 正文必须承认最近三轮对话里已经成立的事实，不得把已发生桥段当作新剧情重演。
- 未被用户明确触发的主线推进，只能写成环境压力、NPC提醒或方向钩子，不得替用户完成转场、上楼、离开现场或抵达下一节点。
- 不替用户补写下一步动作、台词、心理或最终决定。
- 结尾停在本回合终点附近，只留下可承接状态。`;
    }

    function getLatestDialogue(eventData) {
        return buildRecentDialogueContext(eventData) || '无最近对话';
    }

    function getLatestUserMessage(eventData) {
        return pickLatestFromChat(getGenerationChatHistory(eventData), isUserChatItem);
    }

    function getLatestAssistantMessage(eventData) {
        return pickLatestFromChat(getGenerationChatHistory(eventData), isAssistantChatItem);
    }

    function buildDirectionContext({
        beats,
        currentBeatIdx,
        isNewBeat = false,
        latestAssistantMessage = '',
        latestUserMessage = '',
        recentDialogue = '',
        isLargeBeatJump = false,
        beatJumpDistance = 0,
    }) {
        const maxIdx = Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);
        const safeIdx = Math.max(0, Math.min(currentBeatIdx || 0, maxIdx));
        const currentBeat = Array.isArray(beats) ? (beats[safeIdx] || beats[0] || null) : null;

        // 提取纯文本片段（不含省略号，用于起点锚定）
        const beatText = String(currentBeat?.original_text || '').replace(/\s+/g, ' ').trim();
        const beatHead50 = beatText.slice(0, 50);
        const assistantPlain = String(latestAssistantMessage || '').replace(/\s+/g, ' ').trim();
        const assistantTail50 = assistantPlain.slice(Math.max(0, assistantPlain.length - 50));
        const recentUser = toShortText(latestUserMessage || '', 220);
        const jumpDistance = Math.max(0, Number.isFinite(Number(beatJumpDistance)) ? Number(beatJumpDistance) : 0);
        const hasLargeBeatJump = isLargeBeatJump === true || jumpDistance >= 2;

        // 三种起点锚定模式，startAnchor 为实际文本（演员AI须融合此文本起笔）
        let startAnchor = '';
        let startMode = 'fallback';
        if (hasLargeBeatJump) {
            // 模式3: 跳节拍（≥2拍或跨章）→ 仅用新节拍前50字，不承接上文
            startAnchor = beatHead50 || '';
            startMode = 'jump';
        } else if (assistantTail50) {
            if (isNewBeat) {
                // 模式1: 自然进入新节拍 → AI尾50字 + 节拍头50字，融合衔接
                startAnchor = beatHead50 ? `${assistantTail50}${beatHead50}` : assistantTail50;
                startMode = 'transition';
            } else {
                // 模式2: 节拍中段续写 → 仅AI尾50字
                startAnchor = assistantTail50;
                startMode = 'continue';
            }
        } else if (beatHead50) {
            startAnchor = beatHead50;
            startMode = 'beat-head';
        } else if (recentUser) {
            startAnchor = toShortText(recentUser, 100);
            startMode = 'user';
        } else {
            startAnchor = '';
            startMode = 'empty';
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
            start_anchor: startAnchor,
            start_mode: startMode,
            end_guideline: toShortText(endGuideline, 180),
            recent_assistant: toTailText(latestAssistantMessage || '', 200),
            recent_user: recentUser || '',
            recent_dialogue: String(recentDialogue || '').trim(),
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

    function buildDirectorPrompt({ chapterTitle, chapterOutline, currentBeatIdx, beats, latestDialogue, latestUserMessage, directionContext, willCompleteThisLastTurn = false }) {
        const compactBeats = beats.map((beat, idx) => ({
            idx,
            id: beat.id,
            summary: beat.summary,
            exitCondition: beat.exitCondition,
        }));
        const currentBeat = beats[currentBeatIdx] || beats[0] || null;
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const contextMode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = toShortText(context.start_anchor || '', 180)
            || (contextMode === 'new_beat'
                ? '先触发当前节拍入场动作，再进入可见互动。'
                : '承接最近AI输出，再接入用户动作继续推进。');
        const contextRecentAssistant = toTailText(context.recent_assistant || '', 200) || '无';
        const contextRecentUser = toShortText(context.recent_user || '', 220) || '无';
        const recentDialogue = String(context.recent_dialogue || latestDialogue || '').trim() || '无最近对话';
        const endGuideline = toShortText(context.end_guideline || '', 180)
            || '本回合收束到可中断临时节点，不要求完成整节拍，且不得超出用户输入边界。';
        const currentOriginal = String(currentBeat?.original_text || '').trim();
        const currentOriginalForPrompt = currentOriginal || '无';
        const template = String(AppState?.settings?.customDirectorFrameworkPrompt || '').trim() || defaultDirectorFrameworkPrompt;
        const contextModeLabel = contextMode === 'new_beat' ? '新入节拍' : '节拍中段续写';
        const promptBody = renderPromptTemplate(template, {
            CHAPTER_TITLE: String(chapterTitle || ''),
            CHAPTER_OUTLINE: String(chapterOutline || ''),
            CURRENT_BEAT_INDEX: String(currentBeatIdx),
            LATEST_USER_MESSAGE: toShortText(latestUserMessage || '无', 320) || '无',
            WILL_COMPLETE_THIS_LAST_TURN: willCompleteThisLastTurn ? 'true' : 'false',
            CONTEXT_MODE_LABEL: contextModeLabel,
            RECENT_ASSISTANT: contextRecentAssistant,
            ENTRY_EVENT_LINE: '',
            CURRENT_BEAT_ORIGINAL: currentOriginalForPrompt,
            RECENT_USER: contextRecentUser,
            RECENT_DIALOGUE: recentDialogue,
            START_ANCHOR: startAnchor,
            END_GUIDELINE: endGuideline,
            COMPACT_BEATS_JSON: JSON.stringify(compactBeats, null, 2),
            FIXED_STAGE_IDX: String(currentBeatIdx),
        });
        const prefix = getLanguagePrefix ? getLanguagePrefix() : '';
        return `${prefix}${buildRecentStatePriorityBlock(recentDialogue)}\n\n${promptBody}\n\n${buildDirectorPromptFinalChecklist()}`;
    }

    function buildDefaultDirectionScript(currentBeat, nextBeat, directionContext = {}) {
        const currentSummary = toShortText(currentBeat?.summary || '当前节拍', 200) || '当前节拍';
        const nextSummary = toShortText(nextBeat?.summary || '下一节拍', 200) || '下一节拍';
        const context = directionContext && typeof directionContext === 'object' ? directionContext : {};
        const mode = context.mode === 'new_beat' ? 'new_beat' : 'in_beat';
        const startAnchor = context.start_anchor || '';
        const recentAssistant = toTailText(context.recent_assistant || '', 160);
        const recentUser = toShortText(context.recent_user || '', 160);
        const endGuideline = toShortText(context.end_guideline || '', 160)
            || '本回合收束到可承接的临时节点，不要求完成整节拍。';

        // start 优先使用从 buildDirectionContext 提取的实际文本片段（50字锚点）
        const startText = startAnchor
            || (recentAssistant
                ? toTailText(recentAssistant, 50)
                : '');

        if (mode === 'new_beat') {
            const steps = [
                '直接进入当前节拍的首个可见动作，不重铺背景。',
                `围绕”${currentSummary}”先落下一处明确动作，让人物站位和现场局面稳定下来。`,
                '顺着这处动作推进一轮具体回应或信息变化，把本回合带到可承接的临时节点。',
            ];
            return {
                start: startText || `先以”${currentSummary}”触发当前节拍开场，再进入可见动作。`,
                action_chain: buildActionChain(steps),
                steps,
                end: endGuideline,
            };
        }

        const steps = [
            `紧接当前局面推进一处看得见的小动作，持续压在”${currentSummary}”轨道内。`,
            '让在场人物给出对应反应，形成一处具体的信息、关系或局势变化。',
            `把变化收束到可承接的位置，必要时只为”${nextSummary}”保留趋势，不提前展开下一拍。`,
        ];
        return {
            start: startText || `从”${currentSummary}”已进行中的局面继续推进，不复述背景。`,
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
        const sourceChainSteps = splitActionChain(sourceChainText, ACTION_CHAIN_MAX_STEPS);
        const fallbackChainText = fallback.action_chain || fallback.actionChain || fallback.chain || '';
        const fallbackChainSteps = splitActionChain(fallbackChainText, ACTION_CHAIN_MAX_STEPS);
        const fallbackSteps = [
            ...(Array.isArray(fallback.steps) ? fallback.steps : []),
            ...fallbackChainSteps,
        ]
            .map((step) => normalizeActionSegment(step, 180))
            .filter(Boolean)
            .slice(0, ACTION_CHAIN_MAX_STEPS);

        const steps = (stepCandidates.length > 0 ? stepCandidates : sourceChainSteps)
            .map((step) => normalizeActionSegment(step, 180))
            .filter(Boolean)
            .slice(0, ACTION_CHAIN_MAX_STEPS);

        while (steps.length < ACTION_CHAIN_MIN_STEPS) {
            const nextFallback = fallbackSteps[steps.length] || '沿当前目标继续推进，并确保动作可见。';
            const normalized = normalizeActionSegment(nextFallback, 180);
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
            beat_complete: normalizeBooleanFlag(rawDecision?.beat_complete ?? rawDecision?.beatComplete),
            conflict_level: normalizeConflictLevel(rawDecision?.conflict_level ?? rawDecision?.conflictLevel),
            conflict_reason: String(
                rawDecision?.conflict_reason
                || rawDecision?.conflictReason
                || rawDecision?.deviation_reason
                || rawDecision?.deviationReason
                || ''
            ).trim(),
            conflict_strategy: String(
                rawDecision?.conflict_strategy
                || rawDecision?.conflictStrategy
                || rawDecision?.deviation_strategy
                || rawDecision?.deviationStrategy
                || rawDecision?.strategy
                || ''
            ).trim(),
            will_complete_this_last_turn: normalizeBooleanFlag(
                rawDecision?.will_complete_this_last_turn ?? rawDecision?.willCompleteThisLastTurn
            ),
            will_complete_this_turn: normalizeBooleanFlag(
                rawDecision?.will_complete_this_turn ?? rawDecision?.willCompleteThisTurn
            ),
            beat_complete_reason: String(
                rawDecision?.beat_complete_reason
                || rawDecision?.beatCompleteReason
                || rawDecision?.completion_reason
                || rawDecision?.completionReason
                || ''
            ).trim(),
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
            beat_complete: false,
            conflict_level: 'normal',
            conflict_reason: buildDefaultConflictReason('normal'),
            conflict_strategy: buildDefaultConflictStrategy('normal'),
            will_complete_this_last_turn: false,
            will_complete_this_turn: false,
            beat_complete_reason: '',
            direction_script: directionScript,
            reason,
        };
    }

    function createBeatCompletionNotice({ chapterIndex, beatIndex, decision, latestAssistantMessage }) {
        return {
            noticeId: `beat-complete-${chapterIndex}-${beatIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            chapterIndex,
            beatIndex,
            will_complete_this_turn: true,
            beat_complete_reason: String(decision?.beat_complete_reason || '').trim(),
            latestAssistantTailBeforeGeneration: toTailText(latestAssistantMessage || '', 500),
            at: Date.now(),
            consumed: false,
            sending: false,
        };
    }

    function updatePendingBeatCompletionNotice({ chapterIndex, beatIndex, beats, decision, latestAssistantMessage }) {
        const experience = ensureExperienceState();
        const hasNextBeat = beatIndex < Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);

        if (decision?.will_complete_this_turn === true && hasNextBeat) {
            experience.pendingBeatCompletionNotice = createBeatCompletionNotice({
                chapterIndex,
                beatIndex,
                decision,
                latestAssistantMessage,
            });
            return;
        }

        const pending = experience.pendingBeatCompletionNotice;
        if (pending?.chapterIndex === chapterIndex && pending?.beatIndex === beatIndex) {
            experience.pendingBeatCompletionNotice = null;
        }
    }

    function isCurrentPendingNotice(notice) {
        if (!notice || typeof notice !== 'object') return false;
        if (notice.consumed === true || notice.sending === true) return false;
        if (Date.now() - Number(notice.at || 0) > BEAT_COMPLETION_NOTICE_TTL_MS) return false;

        const chapterIndex = Number.isInteger(AppState.experience?.currentChapterIndex)
            ? AppState.experience.currentChapterIndex
            : 0;
        if (notice.chapterIndex !== chapterIndex) return false;

        const memory = AppState.memory?.queue?.[chapterIndex];
        const beats = ensureChapterBeats(memory);
        const maxBeatIndex = Math.max(0, (Array.isArray(beats) ? beats.length : 0) - 1);
        const currentBeatIndex = Number.isInteger(memory?.chapterCurrentBeatIndex)
            ? Math.max(0, Math.min(memory.chapterCurrentBeatIndex, maxBeatIndex))
            : 0;
        return notice.beatIndex === currentBeatIndex;
    }

    function clearPendingBeatCompletionNotice(notice) {
        if (AppState.experience?.pendingBeatCompletionNotice === notice) {
            AppState.experience.pendingBeatCompletionNotice = null;
        }
    }

    function chatAlreadyHasBeatCompletionNotice(chat, notice) {
        if (!Array.isArray(chat)) return false;
        const recent = chat.slice(Math.max(0, chat.length - 8));
        return recent.some((item) => {
            if (!item || typeof item !== 'object') return false;
            if (item._westworld_notice_id && item._westworld_notice_id === notice.noticeId) return true;
            if (item._westworld_beat_completion_notice === true || item._storyweaver_beat_completion_notice === true) {
                return item._westworld_chapter === notice.chapterIndex + 1
                    && item._westworld_beat === notice.beatIndex + 1;
            }
            return false;
        });
    }

    async function pushBeatCompletionNoticeMessage(notice) {
        const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
        if (!st || typeof st.getContext !== 'function') {
            throw new Error('SillyTavern context is unavailable');
        }

        const context = st.getContext();
        if (!context || !Array.isArray(context.chat)) {
            throw new Error('SillyTavern chat is unavailable');
        }

        if (chatAlreadyHasBeatCompletionNotice(context.chat, notice)) {
            return;
        }

        const noticeMessage = {
            is_user: false,
            mes: BEAT_COMPLETION_NOTICE_TEXT,
            _westworld_beat_completion_notice: true,
            _westworld_notice_id: notice.noticeId,
            _westworld_chapter: notice.chapterIndex + 1,
            _westworld_beat: notice.beatIndex + 1,
            _storyweaver_beat_completion_notice: true,
            _storyweaver_notice_id: notice.noticeId,
            _generatedAt: Date.now(),
        };

        if (typeof context.addOneMessage === 'function') {
            await context.addOneMessage(noticeMessage);
            return;
        }

        context.chat.push(noticeMessage);
        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }
        if (typeof context.reloadCurrentChat === 'function') {
            await context.reloadCurrentChat();
        } else if (typeof context.renderChat === 'function') {
            context.renderChat();
        }
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
        const allowNextBeatPreview = decision?.will_complete_this_turn === true || decision?.beat_complete === true;
        const rawNextBeatSummary = toShortText(
            decision?.next_beat_summary
            || nextBeat?.summary
            || '',
            120
        );
        const nextBeatSummary = allowNextBeatPreview
            ? (rawNextBeatSummary || '（当前已是最后节拍）')
            : (rawNextBeatSummary
                ? `方向钩子素材：${rawNextBeatSummary}`
                : '（当前节拍未完成，无需引出下一节拍）');
        const nextBeatEntryEvent = '';
        const nextBeatPreview200 = allowNextBeatPreview
            ? (toHeadText(
                decision?.next_beat_preview_200
                || nextBeat?.original_text
                || '',
                220
            ) || '（当前已是最后节拍，无下一节拍原文预览）')
            : '（当前节拍未完成：禁止展开下一节拍原文；只可用环境压力、NPC提醒或未完成线索作为方向钩子。）';
        const currentExitCondition = toShortText(currentBeat?.exitCondition || '', 140) || '无明确退出事件';
        const directionContext = decision?.direction_context && typeof decision.direction_context === 'object'
            ? decision.direction_context
            : buildDirectionContext({
                beats,
                currentBeatIdx: stageIdx,
                isNewBeat: decision?.is_new_beat === true,
                latestAssistantMessage: decision?.latest_assistant_message || '',
                latestUserMessage: decision?.latest_user_message || '',
                recentDialogue: decision?.recent_dialogue || '',
            });
        const recentDialogue = String(decision?.recent_dialogue || directionContext?.recent_dialogue || '').trim() || '无最近对话';
        const directionScript = normalizeDirectionScript(
            decision.direction_script,
            buildDefaultDirectionScript(currentBeat, nextBeat, directionContext)
        );
        const conflictLevel = normalizeConflictLevel(decision?.conflict_level);
        const conflictReason = toShortText(decision?.conflict_reason || '', 180) || buildDefaultConflictReason(conflictLevel);
        const conflictStrategy = toShortText(decision?.conflict_strategy || '', 180) || buildDefaultConflictStrategy(conflictLevel);
        const conflictRequirement = buildConflictRequirement(conflictLevel);
        const actionChainSteps = splitActionChain(directionScript.action_chain || '', ACTION_CHAIN_MAX_STEPS);
        const steps = actionChainSteps.length > 0
            ? actionChainSteps
            : (Array.isArray(directionScript.steps) && directionScript.steps.length > 0
                ? directionScript.steps
                : ['围绕当前节拍推进一个可见动作。', '让在场角色或局势产生一处具体变化。', '在可承接位置收束本轮输出。']);
        const normalizedSteps = steps.slice(0, ACTION_CHAIN_MAX_STEPS);
        while (normalizedSteps.length < ACTION_CHAIN_MIN_STEPS) {
            normalizedSteps.push(
                normalizedSteps.length === 1
                    ? '让人物关系、信息或局势出现一处具体变化。'
                    : '在可承接位置收束本轮输出。'
            );
        }
        const actionChain = buildActionChain(normalizedSteps);

        const processLines = normalizedSteps
            .map((step, idx) => `  ${idx + 1}. ${step}`)
            .join('\n');

        const stageExecutionRequirement = switchedStage
            ? '- 执行要求: 本回合发生切拍时，先用1-2句完成过渡/回接，再进入动作链；终点只做临时收束，不等于继续切拍。'
            : '- 执行要求: 严格停留在当前节拍内推进动作链；终点只做临时收束，不得跳出当前节拍。';

        const template = ensureDirectorInjectionTemplateCompatibility(
            String(AppState?.settings?.customDirectorInjectionPrompt || '').trim() || defaultDirectorInjectionPrompt
        );
        const injectionBody = renderPromptTemplate(template, {
            CURRENT_BEAT_ID: String(currentBeat?.id || `b${stageIdx + 1}`),
            CURRENT_BEAT_SUMMARY: String(currentBeat?.summary || '当前节拍'),
            CONFLICT_LEVEL: getConflictLevelLabel(conflictLevel),
            CONFLICT_REASON: conflictReason,
            CONFLICT_STRATEGY: conflictStrategy,
            CONFLICT_REQUIREMENT: conflictRequirement,
            RECENT_DIALOGUE: recentDialogue,
            CURRENT_BEAT_ORIGINAL: currentOriginalSection,
            DIRECTION_START: String(directionScript.start || '从当前局面直接接续。'),
            DIRECTION_ACTION_CHAIN: String(actionChain || '围绕当前节拍推进可见动作并收束。'),
            DIRECTION_PROCESS_LINES: processLines || '  1. 围绕当前节拍推进一个可见动作。\n  2. 让在场角色或局势产生一处具体变化。\n  3. 在可承接位置收束本轮输出。',
            DIRECTION_END: String(directionScript.end || '本回合收束到可承接的临时节点。'),
            STAGE_EXECUTION_REQUIREMENT: stageExecutionRequirement,
            CURRENT_EXIT_CONDITION: currentExitCondition,
            NEXT_BEAT_SUMMARY: nextBeatSummary,
            NEXT_BEAT_ENTRY_EVENT: nextBeatEntryEvent,
            NEXT_BEAT_PREVIEW_200: nextBeatPreview200,
            START_RECAP: String(directionScript.start || '从当前局面直接接续。'),
        });
        return `${buildRecentStatePriorityBlock(recentDialogue)}\n\n${injectionBody}\n\n${buildActorInjectionFinalChecklist()}`;
    }

    async function handleDirectorAfterGeneration(eventData = {}) {
        void eventData;
        const experience = ensureExperienceState();
        const notice = experience.pendingBeatCompletionNotice;
        if (!notice) return false;

        if (!isCurrentPendingNotice(notice)) {
            if (notice.sending !== true) {
                clearPendingBeatCompletionNotice(notice);
            }
            return false;
        }

        const latestAssistantTail = toTailText(getLatestAssistantMessage({}) || '', 500);
        if (!latestAssistantTail || latestAssistantTail === notice.latestAssistantTailBeforeGeneration) {
            directorDebug('skip beat completion notice: assistant output has not advanced yet');
            return false;
        }

        notice.sending = true;
        try {
            await pushBeatCompletionNoticeMessage(notice);
            notice.consumed = true;
            clearPendingBeatCompletionNotice(notice);
            directorInfo(`beat completion notice sent chapter=${notice.chapterIndex + 1}, beat=${notice.beatIndex + 1}`);
            return true;
        } catch (error) {
            notice.sending = false;
            directorWarn('failed to send beat completion notice', error?.message || String(error));
            return false;
        }
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
        const previousBeatCompletionState = resolvePreviousBeatCompletionState({
            chapterIndex,
            beatIndex: lockedBeatIdx,
            memory,
        });
        const willCompleteThisLastTurn = previousBeatCompletionState.willCompleteThisLastTurn === true;
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
        const hasReliableBeatHistory = Number.isInteger(currentGlobalBeatOrdinal) && Number.isInteger(previousGlobalBeatOrdinal);
        const beatJumpDistance = (Number.isInteger(currentGlobalBeatOrdinal) && Number.isInteger(previousGlobalBeatOrdinal))
            ? Math.abs(currentGlobalBeatOrdinal - previousGlobalBeatOrdinal)
            : 0;
        const isLargeBeatJump = beatJumpDistance >= 2;
        const isNewBeat = hasReliableBeatHistory
            ? currentGlobalBeatOrdinal !== previousGlobalBeatOrdinal
            : (chapterChanged || switchControl.switched === true);
        const directionContext = buildDirectionContext({
            beats,
            currentBeatIdx: lockedBeatIdx,
            isNewBeat,
            latestAssistantMessage,
            latestUserMessage,
            recentDialogue: latestDialogue,
            isLargeBeatJump,
            beatJumpDistance,
        });
        directorDebug(`switch-command=${switchCommand.requested ? `on(${switchCommand.signal || 'explicit'})` : 'off'}`);
        directorDebug(`switch-control=${switchControl.reason}, lockedBeat=${lockedBeatIdx + 1}/${beats.length}`);
        directorDebug(`jump-detect chapterChanged=${chapterChanged ? 'yes' : 'no'}, beatGap=${beatJumpDistance}, global=${previousGlobalBeatOrdinal ?? -1}->${currentGlobalBeatOrdinal ?? -1}, history=${hasReliableBeatHistory ? 'reliable' : 'fallback'}`);
        directorDebug(`start-mode=${directionContext.mode}, prevBeat=${previousBeatIdx >= 0 ? previousBeatIdx + 1 : 0}`);

        // 新增：输出导演回合判定开始日志
        if (typeof updateStreamContent === 'function') {
            const userMsgPreview = toShortText(latestUserMessage || '', 60) || '（无）';
            const modeLabel = directionContext.mode === 'new_beat' ? '新入节拍' : '节拍中段续写';
            updateStreamContent(`\n🎬 ${turnPrefix} ========== 导演回合判定开始 ==========\n`);
            updateStreamContent(`   章节: ${memory.chapterTitle || `第${chapterIndex + 1}章`}\n`);
            updateStreamContent(`   当前节拍: ${currentBeatIdx + 1}/${beats.length}\n`);
            updateStreamContent(`   用户消息: ${userMsgPreview}\n`);
            updateStreamContent(`   切拍指令: ${switchCommand.requested ? switchCommand.signal || '显式' : '无'}\n`);
            updateStreamContent(`   锁定节拍: ${lockedBeatIdx + 1}/${beats.length}\n`);
            updateStreamContent(`   判定模式: ${modeLabel}\n`);
        }

        const prompt = buildDirectorPrompt({
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            chapterOutline: toShortText(memory.chapterOutline || '', 200),
            currentBeatIdx: lockedBeatIdx,
            beats,
            latestDialogue,
            latestUserMessage,
            directionContext,
            willCompleteThisLastTurn,
        });

        // 新增：输出导演提示词构建完成日志
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`📝 ${turnPrefix} 导演提示词构建完成 (${prompt.length}字符)\n`);
        }

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

            // 新增：输出导演决策详情日志
            if (typeof updateStreamContent === 'function' && decision) {
                const ds = decision.direction_script || {};
                const steps = Array.isArray(ds.steps) ? ds.steps : [];
                const actionChain = ds.action_chain || '';
                updateStreamContent(`📋 ${turnPrefix} 导演决策详情:\n`);
                updateStreamContent(`   来源: ${decisionSource}\n`);
                updateStreamContent(`   锁定节拍: ${decision.stage_idx + 1}/${beats.length}\n`);
                updateStreamContent(`   新节拍: ${decision.is_new_beat ? '是' : '否'}\n`);
                updateStreamContent(`   大跳转: ${decision.is_large_beat_jump ? '是' : '否'}\n`);
                updateStreamContent(`   冲突级别: ${getConflictLevelLabel(decision.conflict_level)}${decision.conflict_reason ? ` (${toShortText(decision.conflict_reason, 70)})` : ''}\n`);
                updateStreamContent(`   处理策略: ${toShortText(decision.conflict_strategy || buildDefaultConflictStrategy(decision.conflict_level), 90)}\n`);
                updateStreamContent(`   节拍完成: ${decision.beat_complete ? '✅ 是' : '否'}\n`);
                updateStreamContent(`   起点: ${toShortText(ds.start || '', 100) || '（默认）'}\n`);
                if (actionChain) {
                    updateStreamContent(`   动作链: ${toShortText(actionChain, 120)}\n`);
                }
                if (steps.length > 0) {
                    updateStreamContent(`   动作步骤:\n`);
                    steps.slice(0, ACTION_CHAIN_MAX_STEPS).forEach((step, i) => {
                        updateStreamContent(`     ${i + 1}. ${toShortText(step, 100)}\n`);
                    });
                }
                updateStreamContent(`   终点: ${toShortText(ds.end || '', 100) || '（默认）'}\n`);
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
        decision.conflict_level = normalizeConflictLevel(decision.conflict_level);
        decision.conflict_reason = String(decision.conflict_reason || '').trim();
        if (decision.conflict_level === 'soft_conflict' && !decision.conflict_reason) {
            decision.conflict_reason = '用户输入有偏移，但仍可压回当前节拍边界内处理。';
        } else if (decision.conflict_level === 'hard_conflict' && !decision.conflict_reason) {
            decision.conflict_reason = '用户字面结果会破坏当前或后续关键剧情前提，需改写实现方式。';
        }
        if (!decision.conflict_reason) {
            decision.conflict_reason = buildDefaultConflictReason(decision.conflict_level);
        }
        decision.conflict_strategy = String(decision.conflict_strategy || '').trim() || buildDefaultConflictStrategy(decision.conflict_level);
        decision.will_complete_this_last_turn = willCompleteThisLastTurn;
        decision.will_complete_this_turn = decision.will_complete_this_turn === true;
        if (decision.will_complete_this_turn && !String(decision.beat_complete_reason || '').trim()) {
            decision.beat_complete_reason = previousBeatCompletionState.beatCompleteReason || '当前节拍将在本回合推进到结尾';
        }
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
        decision.recent_dialogue = String(latestDialogue || '').trim();

        const nextBeat = beats[lockedBeatIdx + 1] || null;
        const nextBeatSummary = toShortText(nextBeat?.summary || '', 200);
        const nextBeatPreview200 = toHeadText(nextBeat?.original_text || '', 200)
            || (nextBeatSummary ? `摘要：${nextBeatSummary}` : '');

        // 输出下一节拍信息
        if (typeof updateStreamContent === 'function' && nextBeatSummary) {
            updateStreamContent(`⏭️ ${turnPrefix} 下一节拍:\n`);
            updateStreamContent(`   摘要: ${nextBeatSummary}\n`);
        }

        decision.next_beat_summary = nextBeatSummary || '';
        decision.next_beat_entry_event = '';
        decision.next_beat_preview_200 = nextBeatPreview200 || '';
        decision.direction_context = {
            ...decision.direction_context,
            next_beat_summary: nextBeatSummary || '',
            next_beat_entry_event: '',
        };

        const decisionActionChainSteps = splitActionChain(decision?.direction_script?.action_chain || '', ACTION_CHAIN_MAX_STEPS);
        const hasValidActionChain = decisionActionChainSteps.length >= ACTION_CHAIN_MIN_STEPS;
        const hasValidSteps = Array.isArray(decision?.direction_script?.steps) && decision.direction_script.steps.length >= ACTION_CHAIN_MIN_STEPS;
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
        updatePendingBeatCompletionNotice({
            chapterIndex,
            beatIndex: lockedBeatIdx,
            beats,
            decision,
            latestAssistantMessage,
        });

        directorInfo(`判定完成 source=${decisionSource}, stage=${decision.stage_idx}, switch=${decision.switch_direction || 'none'}, conflict=${decision.conflict_level}${decision.beat_complete ? ', beatComplete=true' : ''}${decision.will_complete_this_turn ? ', willCompleteThisTurn=true' : ''}`);
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`✅ ${turnPrefix} 判定完成：source=${decisionSource}, 锁定节拍=${decision.stage_idx + 1}/${beats.length}, switch=${decision.switch_direction || 'none'}\n`);
            updateStreamContent(`   冲突级别: ${getConflictLevelLabel(decision.conflict_level)}${decision.conflict_reason ? ` (${toShortText(decision.conflict_reason, 70)})` : ''}\n`);
            updateStreamContent(`   处理策略: ${toShortText(decision.conflict_strategy || buildDefaultConflictStrategy(decision.conflict_level), 90)}\n`);
            updateStreamContent(`   上轮耗尽: ${decision.will_complete_this_last_turn ? '是' : '否'}，本轮耗尽: ${decision.will_complete_this_turn ? '是' : '否'}${decision.beat_complete_reason ? ` (${toShortText(decision.beat_complete_reason, 60)})` : ''}\n`);

            if (decision.beat_complete) {
                const completeReason = decision.beat_complete_reason || '退出条件已满足';
                const nextBeatForNotify = beats[decision.stage_idx + 1];
                const nextSummary = nextBeatForNotify?.summary || '';
                updateStreamContent(`\n`);
                updateStreamContent(`╔══════════════════════════════════════╗\n`);
                updateStreamContent(`║  🎯 导演判定：当前节拍已完成！       ║\n`);
                updateStreamContent(`║  原因: ${completeReason}\n`);
                if (nextSummary) {
                    updateStreamContent(`║  下一节拍: ${toShortText(nextSummary, 40)}\n`);
                }
                updateStreamContent(`║  💡 建议点击「下一节拍」切换         ║\n`);
                updateStreamContent(`╚══════════════════════════════════════╝\n`);
                updateStreamContent(`\n`);
            }
        }

        memory.chapterCurrentBeatIndex = decision.stage_idx;
        memory.directorDecision = {
            ...decision,
            chapterIndex,
            lockedBeatIndex: lockedBeatIdx,
            beat_complete: decision.beat_complete || false,
            will_complete_this_last_turn: decision.will_complete_this_last_turn === true,
            will_complete_this_turn: decision.will_complete_this_turn === true,
            beat_complete_reason: decision.beat_complete_reason || '',
            at: Date.now(),
        };
        AppState.experience.currentBeatIndex = decision.stage_idx;
        AppState.experience.lastBeatIdx = lockedBeatIdx;
        AppState.experience.lastChapterIdx = chapterIndex;
        AppState.experience.directorLastDecision = {
            ...memory.directorDecision,
            beat_complete: decision.beat_complete || false,
            will_complete_this_last_turn: decision.will_complete_this_last_turn === true,
            will_complete_this_turn: decision.will_complete_this_turn === true,
        };
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
        publishDirectorDebugEntry({
            chapterIndex,
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            currentBeatIndex: currentBeatIdx,
            lockedBeatIndex: lockedBeatIdx,
            beatCount: beats.length,
            previousChapterIdx,
            previousBeatIdx,
            switchCommand: safeClone(switchCommand, {}),
            switchControl: safeClone(switchControl, {}),
            directionContext: safeClone(directionContext, {}),
            latestUserMessage: toShortText(latestUserMessage || '', 1200),
            latestAssistantMessage: toTailText(latestAssistantMessage || '', 1200),
            prompt,
            decisionSource,
            decision: safeClone(decision, {}),
            directionScript: safeClone(decision?.direction_script || {}, {}),
            conflictLevel: String(decision.conflict_level || 'normal'),
            conflictReason: String(decision.conflict_reason || ''),
            conflictStrategy: String(decision.conflict_strategy || ''),
            beatComplete: decision.beat_complete === true,
            beatCompleteReason: String(decision.beat_complete_reason || ''),
            willCompleteThisLastTurn: decision.will_complete_this_last_turn === true,
            willCompleteThisTurn: decision.will_complete_this_turn === true,
            nextBeatSummary: nextBeatSummary || '',
            nextBeatPreview200: nextBeatPreview200 || '',
            injection,
            chatMessageCount: Array.isArray(eventData.chat) ? eventData.chat.length : 0,
        });
        directorInfo(`注入完成 chapter=${chapterIndex + 1}, activeBeat=${decision.stage_idx + 1}`);
        if (typeof updateStreamContent === 'function') {
            updateStreamContent(`✅ ${turnPrefix} 注入导演提示词完成（activeBeat=${decision.stage_idx + 1}）\n`);
        }

        return decision;
    }

    return {
        handleDirectorAfterGeneration,
        runDirectorBeforeGeneration,
    };
}
