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

    function normalizeBeat(rawBeat, idx) {
        const source = rawBeat && typeof rawBeat === 'object' ? rawBeat : {};
        const tags = Array.isArray(source.tags)
            ? source.tags.map((t) => toShortText(t, 16)).filter(Boolean).slice(0, 4)
            : [];
        return {
            id: String(source.id || `b${idx + 1}`),
            summary: toShortText(source.summary || source.event || source.description || `事件点${idx + 1}`, 100),
            exitCondition: toShortText(source.exitCondition || source.exit_condition || '等待关键互动完成', 100),
            tags,
        };
    }

    function ensureChapterBeats(memory) {
        if (!memory || !memory.chapterScript || typeof memory.chapterScript !== 'object') {
            return [];
        }

        if (!Array.isArray(memory.chapterScript.beats)) {
            memory.chapterScript.beats = [];
        }

        if (memory.chapterScript.beats.length > 0) {
            memory.chapterScript.beats = memory.chapterScript.beats
                .map((beat, idx) => normalizeBeat(beat, idx))
                .slice(0, 8);
            return memory.chapterScript.beats;
        }

        const keyNodes = Array.isArray(memory.chapterScript.keyNodes)
            ? memory.chapterScript.keyNodes.map((n) => toShortText(n, 80)).filter(Boolean)
            : [];

        memory.chapterScript.beats = keyNodes.map((node, idx) => normalizeBeat({ summary: node }, idx));
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

    function buildDirectorPrompt({ chapterTitle, chapterOutline, currentBeatIdx, beats, latestDialogue }) {
        const compactBeats = beats.map((beat, idx) => ({
            idx,
            id: beat.id,
            summary: beat.summary,
            exitCondition: beat.exitCondition,
            tags: beat.tags,
        }));

        return `${getLanguagePrefix ? getLanguagePrefix() : ''}你是互动小说的导演裁判。请先判断当前处于本章哪个轻节拍阶段，再给出下一步宽松引导。\n\n规则：\n1) 输出必须是JSON，不要代码块，不要解释。\n2) 先定位阶段：stage_idx 应尽量贴近当前对话。\n3) should_advance 仅在当前节拍明显完成时为 true。\n4) next_hint 只给下一步短引导，不能剧透后续大事件。\n5) spoiler_hold 写本回合防剧透边界（简短一句）。\n6) tone_hint 可为空。\n7) confidence 为0-1数字。\n\n章节：${chapterTitle}\n本章摘要：${chapterOutline}\n当前阶段索引：${currentBeatIdx}\n\n轻节拍列表：\n${JSON.stringify(compactBeats, null, 2)}\n\n最近对话：\n${latestDialogue}\n\n输出JSON格式：\n{\n  "stage_idx": 0,\n  "should_advance": false,\n  "next_hint": "...",\n  "spoiler_hold": "...",\n  "tone_hint": "...",\n  "confidence": 0.75\n}`;
    }

    function normalizeDecision(rawDecision, currentBeatIdx, beats) {
        const maxIdx = Math.max(0, beats.length - 1);
        const parsedIdx = Number.isInteger(rawDecision?.stage_idx)
            ? rawDecision.stage_idx
            : Number.isInteger(Number(rawDecision?.stage_idx))
                ? Number(rawDecision.stage_idx)
                : currentBeatIdx;

        let stageIdx = Math.max(0, Math.min(maxIdx, parsedIdx));
        const shouldAdvance = rawDecision?.should_advance === true
            || String(rawDecision?.should_advance || '').toLowerCase() === 'true';

        if (shouldAdvance && stageIdx <= currentBeatIdx && currentBeatIdx < maxIdx) {
            stageIdx = currentBeatIdx + 1;
        }

        const confidenceNum = Number(rawDecision?.confidence);
        const confidence = Number.isFinite(confidenceNum)
            ? Math.max(0, Math.min(1, confidenceNum))
            : 0.55;

        return {
            stage_idx: stageIdx,
            should_advance: shouldAdvance,
            next_hint: toShortText(rawDecision?.next_hint || '', 180),
            spoiler_hold: toShortText(rawDecision?.spoiler_hold || '', 160),
            tone_hint: toShortText(rawDecision?.tone_hint || '', 160),
            confidence,
        };
    }

    function buildInjection(decision, beats) {
        const stageIdx = Number.isInteger(decision.stage_idx) ? decision.stage_idx : 0;
        const currentBeat = beats[stageIdx] || beats[0] || null;
        const nextBeat = beats[stageIdx + 1] || null;
        const nextHint = decision.next_hint || toShortText(nextBeat?.summary || '', 100) || '继续围绕当前阶段互动推进。';
        const spoilerHold = decision.spoiler_hold || '不要提前描写后续关键转折或结局。';
        const toneHint = decision.tone_hint ? `\n- 基调提示: ${decision.tone_hint}` : '';

        return [
            '# StoryWeaver 导演提示（宽松模式）',
            `- 当前阶段: ${currentBeat?.id || `b${stageIdx + 1}`} ${currentBeat?.summary || '当前节拍'}`,
            `- 本回合优先: ${currentBeat?.summary || '围绕当前阶段展开互动'}`,
            `- 下一步建议: ${nextHint}`,
            `- 防剧透边界: ${spoilerHold}`,
            `- 玩家优先原则: 若用户主动改写，优先响应并将其视为新事实保持连续性。${toneHint}`,
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

        const prompt = buildDirectorPrompt({
            chapterTitle: memory.chapterTitle || `第${chapterIndex + 1}章`,
            chapterOutline: toShortText(memory.chapterOutline || '', 140),
            currentBeatIdx,
            beats,
            latestDialogue: getLatestDialogue(eventData),
        });

        let decision = null;
        try {
            const response = await callDirectorAPI(prompt, chapterIndex + 1);
            const parsed = extractJsonObject(response);
            if (!parsed) {
                directorWarn('导演返回内容无法解析为JSON，已跳过本回合判定', toShortText(response, 220));
                return null;
            }
            decision = normalizeDecision(parsed, currentBeatIdx, beats);
            directorInfo(`判定完成 stage=${decision.stage_idx}, advance=${decision.should_advance}, confidence=${decision.confidence}`);
        } catch (error) {
            directorWarn('导演判定失败', error?.message || String(error));
            return null;
        }

        if (decision.confidence < 0.45) {
            directorDebug(`low-confidence fallback applied: ${decision.confidence}`);
            decision.stage_idx = currentBeatIdx;
            decision.should_advance = false;
        }

        memory.chapterCurrentBeatIndex = decision.stage_idx;
        memory.directorDecision = {
            ...decision,
            at: Date.now(),
        };
        AppState.experience.currentBeatIndex = decision.stage_idx;
        AppState.experience.directorLastDecision = { ...memory.directorDecision };
        AppState.experience.directorLastDecisionAt = Date.now();

        const injection = buildInjection(decision, beats);
        for (let i = eventData.chat.length - 1; i >= 0; i--) {
            const item = eventData.chat[i];
            if (item?.is_storyweaver_director === true) {
                eventData.chat.splice(i, 1);
                continue;
            }
            const itemContent = String(item?.content || item?.mes || '');
            if (itemContent.includes('# StoryWeaver 导演提示（宽松模式）')) {
                eventData.chat.splice(i, 1);
            }
        }
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
