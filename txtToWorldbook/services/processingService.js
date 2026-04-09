export function createProcessingService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Semaphore,
        updateMemoryQueueUI,
        updateProgress,
        updateStreamContent,
        debugLog,
        callAPI,
        callDirectorAPI,
        isTokenLimitError,
        parseAIResponse,
        postProcessResultWithChapterIndex,
        mergeWorldbookDataWithHistory,
        getChapterForcePrompt,
        getLanguagePrefix,
        buildSystemPrompt,
        getPreviousMemoryContext,
        getEnabledCategories,
        splitMemoryIntoTwo,
        handleStartNewVolume,
        showProgressSection,
        updateStopButtonVisibility,
        updateVolumeIndicator,
        updateStartButtonState,
        showResultSection,
        updateWorldbookPreview,
        applyDefaultWorldbookEntries,
        ErrorHandler,
        handleRepairMemoryWithSplit,
        setProcessingStatus,
        getProcessingStatus,
    } = deps;

    const SPLIT_TYPES = new Set([
        'scene_switch',
        'action_closed',
        'dialogue_closed',
        'plot_twist',
        'perspective_switch',
        'interaction_point',
    ]);
    const MIN_ANCHOR_LEN = 20;
    const MAX_ANCHOR_LEN = 100;

    const transitionTo = (status) => {
        if (typeof setProcessingStatus === 'function') {
            setProcessingStatus(status);
            return;
        }
        const next = status || 'idle';
        AppState.processing.status = next;
        AppState.processing.isStopped = next === 'stopped';
        AppState.processing.isRerolling = next === 'rerolling';
        AppState.processing.isRepairing = next === 'repairing';
        AppState.processing.isRunning = next === 'running' || next === 'rerolling' || next === 'repairing';
    };

    const currentStatus = () => {
        if (typeof getProcessingStatus === 'function') return getProcessingStatus();
        return AppState.processing.status || 'idle';
    };

    function nextRunId() {
        const seed = Math.random().toString(36).slice(2, 8);
        return `run-${Date.now()}-${seed}`;
    }

    function isRunActive(runId) {
        if (!runId) return true;
        return AppState.processing.runId === runId && !AppState.processing.isStopped;
    }

    function throwIfRunInactive(runId) {
        if (!isRunActive(runId)) {
            throw new Error('ABORTED');
        }
    }

    function resolveApiConcurrency(kind) {
        const fallback = Math.max(1, parseInt(AppState.config?.parallel?.concurrency, 10) || 1);
        const key = kind === 'director' ? 'directorConcurrency' : 'mainConcurrency';
        const fromConfig = parseInt(AppState.config?.parallel?.[key], 10);
        const fromSettings = parseInt(
            kind === 'director' ? AppState.settings?.parallelDirectorConcurrency : AppState.settings?.parallelMainConcurrency,
            10
        );
        const limit = Number.isFinite(fromConfig)
            ? fromConfig
            : (Number.isFinite(fromSettings) ? fromSettings : fallback);
        return Math.max(1, Math.min(10, limit));
    }

    function setupApiSemaphores() {
        const mainLimit = resolveApiConcurrency('main');
        const directorLimit = resolveApiConcurrency('director');
        AppState.processing.mainApiSemaphore = new Semaphore(mainLimit);
        AppState.processing.directorApiSemaphore = new Semaphore(directorLimit);
        AppState.processing.mainApiConcurrency = mainLimit;
        AppState.processing.directorApiConcurrency = directorLimit;
    }

    function abortApiSemaphores() {
        if (AppState.processing.mainApiSemaphore) AppState.processing.mainApiSemaphore.abort();
        if (AppState.processing.directorApiSemaphore) AppState.processing.directorApiSemaphore.abort();
        AppState.processing.mainApiSemaphore = null;
        AppState.processing.directorApiSemaphore = null;
        AppState.processing.mainApiConcurrency = 0;
        AppState.processing.directorApiConcurrency = 0;
    }

    async function runWithApiSemaphore(kind, runId, fn) {
        const semaphore = kind === 'director'
            ? AppState.processing.directorApiSemaphore
            : AppState.processing.mainApiSemaphore;
        if (!semaphore) {
            throwIfRunInactive(runId);
            return fn();
        }

        let acquired = false;
        try {
            throwIfRunInactive(runId);
            await semaphore.acquire();
            acquired = true;
            throwIfRunInactive(runId);
            return await fn();
        } catch (error) {
            if (error?.message === 'ABORTED') {
                throw new Error('ABORTED');
            }
            throw error;
        } finally {
            if (acquired) semaphore.release();
        }
    }

    function ensurePendingChapterAssetsSet() {
        if (!(AppState.processing.pendingChapterAssets instanceof Set)) {
            AppState.processing.pendingChapterAssets = new Set();
        }
        return AppState.processing.pendingChapterAssets;
    }

    function trackBackgroundChapterAssets(promise) {
        if (!promise || typeof promise.then !== 'function') return promise;
        const pendingSet = ensurePendingChapterAssetsSet();
        const tracked = Promise.resolve(promise)
            .catch(() => null)
            .finally(() => {
                pendingSet.delete(tracked);
            });
        pendingSet.add(tracked);
        return promise;
    }

    async function flushBackgroundChapterAssets(runId) {
        const pendingSet = ensurePendingChapterAssetsSet();
        const pending = Array.from(pendingSet);
        if (pending.length === 0) return;
        if (!isRunActive(runId)) return;

        updateStreamContent(`⏳ 等待导演资产补齐 (${pending.length})...\n`);
        await Promise.allSettled(pending);

        if (!isRunActive(runId)) return;
        updateStreamContent('✅ 导演资产补齐完成\n');
    }

    async function waitForPreviousChapterReady(index, runId, timeoutMs = 90000) {
        if (index <= 0) return;
        const startedAt = Date.now();

        while (true) {
            throwIfRunInactive(runId);
            const previousMemory = AppState.memory.queue[index - 1];
            if (!previousMemory) return;

            const chapterReady = previousMemory.processed || previousMemory.failed
                || previousMemory.chapterOutlineStatus === 'done'
                || previousMemory.chapterOutlineStatus === 'failed';
            if (chapterReady) return;

            if (Date.now() - startedAt > timeoutMs) {
                updateStreamContent(`⚠️ [第${index + 1}章] 等待上一章完成超时，已降级为继续处理\n`);
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }

    function extractStatusCode(error) {
        if (typeof error?.status === 'number') {
            return error.status;
        }
        const message = String(error?.message || '');
        const explicitMatch = message.match(/API请求失败:\s*(\d{3})/i);
        if (explicitMatch) {
            return parseInt(explicitMatch[1], 10);
        }
        const genericMatch = message.match(/\bstatus\s*[:=]\s*(\d{3})\b/i);
        if (genericMatch) {
            return parseInt(genericMatch[1], 10);
        }
        return null;
    }

    function shouldRetryError(error) {
        if (error?.code === 'CHAPTER_ASSETS_CONTRACT') {
            return true;
        }
        if (error?.code === 'CHAPTER_ASSETS_SPLIT' || error?.code === 'CHAPTER_ASSETS_VALIDATION') {
            return false;
        }

        const status = extractStatusCode(error);
        if (status === 429) return true;
        if (status >= 500 && status < 600) return true;
        if (status >= 400 && status < 500) return false;

        const message = String(error?.message || '').toLowerCase();
        if (message.includes('json解析失败') || message.includes('json修复失败')) {
            return true;
        }
        return (
            message.includes('timeout') ||
            message.includes('超时') ||
            message.includes('network') ||
            message.includes('网络') ||
            message.includes('fetch failed') ||
            message.includes('econnreset') ||
            message.includes('etimedout') ||
            message.includes('eai_again')
        );
    }

    function resolveChapterCompletionMode() {
        const mode = String(AppState.settings?.chapterCompletionMode || '').trim().toLowerCase();
        return mode === 'throughput' ? 'throughput' : 'consistency';
    }

    function compactErrorMessage(error) {
        const raw = String(error?.message || error || '未知错误');
        const singleLine = raw
            .replace(/^\[第\d+章\]\s*/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!singleLine) return '未知错误';
        return singleLine.length > 180 ? `${singleLine.slice(0, 180)}...` : singleLine;
    }

    function formatProcessingError(error, context = {}) {
        const chapterPrefix = Number.isInteger(context.chapterIndex) ? `[第${context.chapterIndex}章]` : '';
        const taskPrefix = context.task ? `[${context.task}]` : '';
        const status = extractStatusCode(error);
        const statusPrefix = status ? `[HTTP ${status}]` : (error?.code ? `[${String(error.code)}]` : '');
        const message = compactErrorMessage(error);
        return `${chapterPrefix}${taskPrefix}${statusPrefix ? `${statusPrefix} ` : ''}${message}`;
    }

    function buildRelevantWorldbookContext(memoryContent, maxEntries = 8) {
        const content = String(memoryContent || '');
        if (!content.trim()) return '';

        const categoryData = AppState.worldbook.generated || {};
        const candidates = [];

        for (const category in categoryData) {
            const entries = categoryData[category];
            if (!entries || typeof entries !== 'object') continue;
            for (const entryName in entries) {
                const entry = entries[entryName];
                if (!entry || typeof entry !== 'object') continue;

                let score = 0;
                if (content.includes(entryName)) score += 5;

                const keywords = Array.isArray(entry['关键词']) ? entry['关键词'] : [entry['关键词']];
                for (const keyword of keywords) {
                    const kw = String(keyword || '').trim();
                    if (!kw || kw.length < 2) continue;
                    if (content.includes(kw)) score += 2;
                }

                if (score <= 0) continue;
                candidates.push({
                    category,
                    entryName,
                    score,
                    content: String(entry['内容'] || '').slice(0, 180),
                });
            }
        }

        if (candidates.length === 0) return '';

        candidates.sort((a, b) => b.score - a.score);
        const top = candidates.slice(0, maxEntries);
        const lines = top.map((item) => `- [${item.category}] ${item.entryName}: ${item.content}`);
        return `\n\n相关世界书摘录（精简，不是全量）：\n${lines.join('\n')}\n`;
    }

    function ensureChapterRuntime(memory, index) {
        if (!memory) return;
        if (!memory.chapterTitle || !String(memory.chapterTitle).trim()) {
            memory.chapterTitle = `第${index + 1}章`;
        }
        if (typeof memory.chapterOutline !== 'string') {
            memory.chapterOutline = '';
        }
        if (!memory.chapterOutlineStatus) {
            memory.chapterOutlineStatus = 'pending';
        }
        if (typeof memory.chapterOutlineError !== 'string') {
            memory.chapterOutlineError = '';
        }
        if (!memory.chapterScript || typeof memory.chapterScript !== 'object') {
            memory.chapterScript = { goal: '', flow: '', keyNodes: [], beats: [] };
        }
        if (!Array.isArray(memory.chapterScript.keyNodes)) {
            memory.chapterScript.keyNodes = [];
        }
        if (!Array.isArray(memory.chapterScript.beats)) {
            memory.chapterScript.beats = [];
        }
        memory.chapterScript.beats = memory.chapterScript.beats
            .map((beat, idx) => normalizeBeatItem(beat, idx));
        if (!Number.isInteger(memory.chapterCurrentBeatIndex)) {
            memory.chapterCurrentBeatIndex = 0;
        }
        if (!memory.directorDecision || typeof memory.directorDecision !== 'object') {
            memory.directorDecision = null;
        }
        if (typeof memory.chapterOpeningPreview !== 'string') {
            memory.chapterOpeningPreview = '';
        }
        if (typeof memory.chapterOpeningSent !== 'boolean') {
            memory.chapterOpeningSent = false;
        }
        if (typeof memory.chapterOpeningError !== 'string') {
            memory.chapterOpeningError = '';
        }
    }

    function normalizeSplitRule(rawRule) {
        const source = rawRule && typeof rawRule === 'object' ? rawRule : {};
        const rawMatched = Array.isArray(source.matched)
            ? source.matched
            : (source.matched ? [source.matched] : []);
        const matched = rawMatched
            .map((rule) => String(rule || '').trim())
            .filter(Boolean)
            .slice(0, 8);

        const fallbackPrimary = matched[0] || '';
        let primary = String(source.primary || source.rule || source.main || fallbackPrimary || '').trim();
        if (!primary) {
            primary = '动作闭环';
        }
        if (!matched.includes(primary)) {
            matched.unshift(primary);
        }

        return {
            primary,
            matched: matched.slice(0, 8),
        };
    }

    function normalizeBeatItem(rawBeat, idx, fallbackSummary = '') {
        const source = rawBeat && typeof rawBeat === 'object' ? rawBeat : {};
        const summary = String(source.summary || source.event || source.description || fallbackSummary || '').trim();
        const exitCondition = String(source.exitCondition || source.exit_condition || '').trim();
        const tags = Array.isArray(source.tags)
            ? source.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 4)
            : [];
        const originalText = typeof source.original_text === 'string'
            ? source.original_text
            : (typeof source.originalText === 'string' ? source.originalText : '');
        const splitRule = normalizeSplitRule(source.split_rule || source.splitRule || null);

        return {
            id: String(source.id || `b${idx + 1}`).trim() || `b${idx + 1}`,
            summary: summary || `事件点${idx + 1}`,
            exitCondition: exitCondition || '等待用户行动或关键互动完成',
            tags,
            original_text: originalText,
            split_rule: splitRule,
        };
    }

    function splitBeatCandidates(text, limit = 8) {
        return String(text || '')
            .split(/[，,。；;、\n]/)
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .slice(0, limit);
    }

    function ensureMinimumBeats(beats, outline, fallbackNodes = []) {
        const normalized = Array.isArray(beats)
            ? beats.map((beat, idx) => normalizeBeatItem(beat, idx)).slice(0, 8)
            : [];
        const minCount = 3;
        if (normalized.length >= minCount) {
            return normalized;
        }

        const seen = new Set(normalized.map((beat) => beat.summary));
        const candidates = [
            ...fallbackNodes,
            ...splitBeatCandidates(outline, 8),
        ];

        for (const candidate of candidates) {
            if (normalized.length >= minCount) break;
            const summary = String(candidate || '').trim();
            if (!summary || seen.has(summary)) continue;
            normalized.push(normalizeBeatItem({
                summary,
                exitCondition: '出现明显推进动作或关键信息变化',
            }, normalized.length, summary));
            seen.add(summary);
        }

        const genericFallback = [
            '围绕当前线索继续探索并确认方向',
            '通过互动获得新的关键信息反馈',
            '形成阶段性判断后推进下一步行动',
        ];
        for (const fallback of genericFallback) {
            if (normalized.length >= minCount) break;
            if (seen.has(fallback)) continue;
            normalized.push(normalizeBeatItem({
                summary: fallback,
                exitCondition: '出现明确行动决策或关键信息更新',
            }, normalized.length, fallback));
            seen.add(fallback);
        }

        return normalized.slice(0, 8).map((beat, idx) => normalizeBeatItem(beat, idx));
    }

    function extractJsonObject(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;

        const maybeParseJson = (candidate) => {
            const body = String(candidate || '').trim();
            if (!body) return null;
            const variants = [
                body,
                body.replace(/^\uFEFF/, ''),
                body.replace(/,\s*([}\]])/g, '$1'),
            ];

            for (const item of variants) {
                try {
                    const parsed = JSON.parse(item);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (_) {
                    // continue
                }
            }
            return null;
        };

        const collectBalancedObjects = (source, limit = 16) => {
            const s = String(source || '');
            const out = [];
            let depth = 0;
            let start = -1;
            let inString = false;
            let escaped = false;

            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (inString) {
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    continue;
                }

                if (ch === '{') {
                    if (depth === 0) start = i;
                    depth++;
                    continue;
                }

                if (ch === '}') {
                    if (depth > 0) depth--;
                    if (depth === 0 && start >= 0) {
                        out.push(s.slice(start, i + 1));
                        start = -1;
                        if (out.length >= limit) break;
                    }
                }
            }

            return out;
        };

        const fenceCleaned = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const direct = maybeParseJson(fenceCleaned);
        if (direct) return direct;

        const fencedBlocks = [];
        const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/ig;
        let match;
        while ((match = fenceRegex.exec(raw)) !== null) {
            fencedBlocks.push(String(match[1] || '').trim());
            if (fencedBlocks.length >= 4) break;
        }

        for (const block of fencedBlocks) {
            const parsed = maybeParseJson(block);
            if (parsed) return parsed;
        }

        const objectCandidates = collectBalancedObjects(fenceCleaned)
            .sort((a, b) => b.length - a.length);
        for (const candidate of objectCandidates) {
            const parsed = maybeParseJson(candidate);
            if (parsed) return parsed;
        }

        return null;
    }

    function toShortOutline(text, maxLen = 120) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        const sentences = plain
            .split(/[。！？!?]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 2);
        const joined = sentences.join('，');
        const result = joined || plain;
        return result.length > maxLen ? `${result.slice(0, maxLen)}...` : result;
    }

    function normalizeScript(rawScript, outline) {
        const script = rawScript && typeof rawScript === 'object' ? rawScript : {};
        const keyNodes = Array.isArray(script.keyNodes)
            ? script.keyNodes.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 3)
            : [];
        const rawBeats = Array.isArray(script.beats)
            ? script.beats
            : (Array.isArray(script.lightBeats) ? script.lightBeats : []);

        const flow = String(script.flow || '').trim() || outline;
        const goal = String(script.goal || '').trim() || '围绕本章核心冲突推进剧情并保持叙事连续。';

        const fallbackNodes = keyNodes.length > 0
            ? keyNodes
            : (outline ? outline.split(/[，,。]/).map((n) => n.trim()).filter(Boolean).slice(0, 4) : []);
        const beats = rawBeats.length > 0
            ? rawBeats.map((beat, idx) => normalizeBeatItem(beat, idx)).slice(0, 8)
            : fallbackNodes.map((node, idx) => normalizeBeatItem({ summary: node }, idx, node));

        const stabilizedBeats = ensureMinimumBeats(beats, outline, fallbackNodes);

        return {
            goal,
            flow,
            keyNodes: keyNodes.length > 0
                ? keyNodes
                : fallbackNodes.slice(0, 3),
            beats: stabilizedBeats,
        };
    }

    function findNearbySplitPoint(text, target, maxOffset = 160) {
        const source = String(text || '');
        const len = source.length;
        if (len === 0) return 0;
        const clampedTarget = Math.max(1, Math.min(len - 1, target));
        const isBoundary = (ch) => /[。！？!?；;\n]/.test(ch || '');

        for (let offset = 0; offset <= maxOffset; offset++) {
            const right = clampedTarget + offset;
            if (right < len && isBoundary(source[right])) {
                return right + 1;
            }

            const left = clampedTarget - offset;
            if (left > 0 && isBoundary(source[left - 1])) {
                return left;
            }
        }

        return clampedTarget;
    }

    function trySplitContentWithBeatCount(content, beatCount) {
        const source = String(content || '');
        const totalLen = source.length;
        const minLen = 200;
        const maxLen = 1500;

        if (beatCount < 3 || beatCount > 8) return null;
        if (totalLen < beatCount * minLen) return null;
        if (totalLen > beatCount * maxLen) return null;

        const cuts = [0];
        for (let i = 1; i < beatCount; i++) {
            const remainingBeats = beatCount - i;
            const prev = cuts[cuts.length - 1];
            const minCut = prev + minLen;
            const maxCut = totalLen - (remainingBeats * minLen);
            if (minCut > maxCut) return null;

            const ideal = Math.round((totalLen * i) / beatCount);
            const target = Math.max(minCut, Math.min(maxCut, ideal));
            let cut = findNearbySplitPoint(source, target, 180);
            cut = Math.max(minCut, Math.min(maxCut, cut));

            if ((cut - prev) > maxLen) {
                cut = prev + maxLen;
            }

            cuts.push(cut);
        }
        cuts.push(totalLen);

        const segments = [];
        for (let i = 0; i < beatCount; i++) {
            const seg = source.slice(cuts[i], cuts[i + 1]);
            if (seg.length < minLen || seg.length > maxLen) {
                return null;
            }
            segments.push(seg);
        }

        return segments;
    }

    function normalizeSplitType(type) {
        const raw = String(type || '').trim();
        if (SPLIT_TYPES.has(raw)) return raw;
        return 'action_closed';
    }

    function normalizeStrategySplitRule(rawRule, fallbackType = 'action_closed') {
        const source = rawRule && typeof rawRule === 'object' ? rawRule : {};
        const rawMatched = Array.isArray(source.matched)
            ? source.matched
            : (source.matched ? [source.matched] : []);
        const matched = rawMatched
            .map((rule) => normalizeSplitType(rule))
            .filter(Boolean)
            .slice(0, 8);
        const fallback = normalizeSplitType(fallbackType);
        const primary = normalizeSplitType(source.primary || source.rule || source.main || fallback);
        if (!matched.includes(primary)) {
            matched.unshift(primary);
        }
        return {
            primary,
            matched: matched.slice(0, 8),
        };
    }

    function trySplitContentWithCutTargets(content, cutTargets) {
        const source = String(content || '');
        const totalLen = source.length;
        const minLen = 200;
        const maxLen = 1500;
        const targets = Array.isArray(cutTargets)
            ? cutTargets.map((t) => (Number.isFinite(t) ? Math.round(t) : null)).filter((t) => typeof t === 'number')
            : [];

        if (!source.trim()) return [];

        // targets are cut positions between segments; we always enforce 3-8 beats.
        const beatCount = targets.length + 1;
        if (beatCount < 3 || beatCount > 8) return null;
        if (totalLen < beatCount * minLen) return null;
        if (totalLen > beatCount * maxLen) return null;

        const cuts = [0];
        for (let i = 0; i < targets.length; i++) {
            const remainingBeats = beatCount - (i + 1);
            const prev = cuts[cuts.length - 1];
            const minCut = prev + minLen;
            const maxCut = totalLen - (remainingBeats * minLen);
            if (minCut > maxCut) return null;

            const desired = Math.max(minCut, Math.min(maxCut, targets[i]));
            let cut = findNearbySplitPoint(source, desired, 220);
            cut = Math.max(minCut, Math.min(maxCut, cut));
            if ((cut - prev) > maxLen) cut = prev + maxLen;
            cuts.push(cut);
        }
        cuts.push(totalLen);

        const segments = [];
        for (let i = 0; i < beatCount; i++) {
            const seg = source.slice(cuts[i], cuts[i + 1]);
            if (seg.length < minLen || seg.length > maxLen) return null;
            segments.push(seg);
        }

        return segments;
    }

    function buildBeatsFromSegments(segments, chapterIndex, splitPoints = []) {
        const list = Array.isArray(segments) ? segments : [];
        const points = Array.isArray(splitPoints) ? splitPoints : [];
        const lastIdx = list.length - 1;
        return list.map((seg, idx) => {
            const summary = toShortOutline(seg, 36) || `第${chapterIndex}章节拍${idx + 1}`;
            const tags = idx === 0 ? ['开场'] : (idx === lastIdx ? ['收束'] : ['推进']);
            const pointIndex = points.length > 0
                ? Math.max(0, Math.min(points.length - 1, idx - 1))
                : -1;
            const point = pointIndex >= 0 ? points[pointIndex] : null;
            const splitType = normalizeSplitType(point?.split_rule?.primary || 'action_closed');
            const splitRule = normalizeStrategySplitRule(point?.split_rule, splitType);
            return normalizeBeatItem({
                id: `b${idx + 1}`,
                summary,
                exitCondition: '该段核心行动完成，或出现新的互动焦点。',
                tags,
                original_text: seg,
                split_rule: splitRule,
            }, idx, summary);
        });
    }

    function normalizeForFuzzyMatch(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[\s\u3000]+/g, '')
            // drop common punctuation (keep CJK/latin/digits)
            .replace(/[\u2000-\u206F\u2E00-\u2E7F'"`~!@#$%^&*()\-_=+\[\]{}\\|;:,.<>/?，。！？；：、“”‘’（）【】《》…—\n\r\t]+/g, '');
    }

    function buildNGramSet(text, n = 2) {
        const s = normalizeForFuzzyMatch(text);
        if (!s) return new Set();
        const grams = new Set();
        if (s.length < n) {
            grams.add(s);
            return grams;
        }
        for (let i = 0; i <= s.length - n; i++) {
            grams.add(s.slice(i, i + n));
        }
        return grams;
    }

    function jaccardSimilarity(setA, setB) {
        if (!setA.size && !setB.size) return 0;
        if (!setA.size || !setB.size) return 0;
        let inter = 0;
        // iterate smaller set
        const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
        for (const v of small) {
            if (big.has(v)) inter++;
        }
        const union = setA.size + setB.size - inter;
        return union <= 0 ? 0 : inter / union;
    }

    function buildSentenceSpans(source) {
        const text = String(source || '');
        const spans = [];
        if (!text.trim()) return spans;

        const boundaries = new Set(['。', '！', '？', '；', '\n']);
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (!boundaries.has(ch)) continue;

            // include consecutive boundary chars/newlines
            let end = i + 1;
            while (end < text.length && (boundaries.has(text[end]) || text[end] === '\r')) {
                end++;
            }

            const raw = text.slice(start, end);
            const trimmed = raw.trim();
            if (trimmed.length >= 6) {
                spans.push({ start, end, text: trimmed });
            }
            start = end;
            i = end - 1;
        }

        if (start < text.length) {
            const tail = text.slice(start);
            const trimmed = tail.trim();
            if (trimmed.length >= 6) {
                spans.push({ start, end: text.length, text: trimmed });
            }
        }

        // If we failed to segment (e.g. no punctuation), make coarse spans.
        if (!spans.length) {
            const step = Math.max(120, Math.min(360, Math.round(text.length / 8)));
            for (let s = 0; s < text.length; s += step) {
                const e = Math.min(text.length, s + step);
                const seg = text.slice(s, e).trim();
                if (seg.length >= 6) spans.push({ start: s, end: e, text: seg });
            }
        }

        return spans;
    }

    function findBestCutByHint(source, hint, expectedPos) {
        const text = String(source || '');
        const h = String(hint || '').trim();
        if (!text.trim() || !h) return null;

        // Fast path: direct substring match, but prefer a nearby occurrence.
        const normalizedHint = normalizeForFuzzyMatch(h);
        if (normalizedHint.length >= 4) {
            const direct = text.indexOf(h);
            if (direct > 0) {
                return direct;
            }
        }

        const spans = buildSentenceSpans(text);
        if (!spans.length) return null;

        const hintSet = buildNGramSet(h, 2);
        const fallbackHintSet = hintSet.size ? hintSet : buildNGramSet(h, 1);

        const center = Number.isFinite(expectedPos) ? Math.round(expectedPos) : Math.round(text.length / 2);
        const window = 2600;
        const left = Math.max(0, center - window);
        const right = Math.min(text.length, center + window);

        let best = null;
        let bestScore = 0;

        for (const span of spans) {
            // Only consider spans near expected position.
            if (span.end < left || span.start > right) continue;

            const sentSet = buildNGramSet(span.text, 2);
            const sentFallbackSet = sentSet.size ? sentSet : buildNGramSet(span.text, 1);
            const sim = jaccardSimilarity(fallbackHintSet, sentFallbackSet);
            if (sim <= 0) continue;

            const cutPos = span.end;
            const dist = Math.abs(cutPos - center);
            const closeness = 1 - Math.min(1, dist / window);
            const score = sim * 0.75 + closeness * 0.25;

            if (score > bestScore) {
                bestScore = score;
                best = cutPos;
            }
        }

        // small threshold: avoid random matches
        if (bestScore < 0.08) return null;
        return best;
    }

    function findBestAnchorStartByFuzzy(source, anchor, expectedPos) {
        const text = String(source || '');
        const target = String(anchor || '').trim();
        if (!text.trim() || !target) return null;

        const spans = buildSentenceSpans(text);
        if (!spans.length) return null;

        const targetSet = buildNGramSet(target, 2);
        const fallbackTargetSet = targetSet.size ? targetSet : buildNGramSet(target, 1);
        const center = Number.isFinite(expectedPos) ? Math.round(expectedPos) : Math.round(text.length / 2);
        const window = 3200;
        const left = Math.max(0, center - window);
        const right = Math.min(text.length, center + window);

        let bestStart = null;
        let bestScore = 0;
        for (const span of spans) {
            if (span.end < left || span.start > right) continue;

            const spanSet = buildNGramSet(span.text, 2);
            const spanFallbackSet = spanSet.size ? spanSet : buildNGramSet(span.text, 1);
            const sim = jaccardSimilarity(fallbackTargetSet, spanFallbackSet);
            if (sim <= 0) continue;

            const dist = Math.abs(span.start - center);
            const closeness = 1 - Math.min(1, dist / window);
            const score = sim * 0.8 + closeness * 0.2;

            if (score > bestScore) {
                bestScore = score;
                bestStart = span.start;
            }
        }

        if (bestScore < 0.1) return null;
        return bestStart;
    }

    function buildExpectedAnchorPositions(totalLength, splitCount) {
        const expected = [];
        const safeCount = Math.max(0, Number(splitCount) || 0);
        for (let i = 0; i < safeCount; i++) {
            expected.push(Math.round((totalLength * (i + 1)) / (safeCount + 1)));
        }
        return expected;
    }

    function applySplitStrategyWithAnchors(content, strategy = {}, chapterIndex = 1) {
        const source = String(content || '');
        if (!source.trim()) return null;

        const beatCount = Number(strategy?.beat_count);
        if (!Number.isFinite(beatCount) || beatCount < 3 || beatCount > 8) {
            throw createChapterAssetsContractError(chapterIndex - 1, `split_strategy.beat_count 非法: ${strategy?.beat_count}`, {
                strategy,
            });
        }

        const expectedSplitCount = beatCount - 1;
        const splitPoints = Array.isArray(strategy?.split_points)
            ? strategy.split_points.slice(0, expectedSplitCount)
            : [];
        if (splitPoints.length !== expectedSplitCount) {
            throw createChapterAssetsContractError(chapterIndex - 1, `split_points 数量需等于 beat_count-1（期望=${expectedSplitCount}，实际=${splitPoints.length}）`, {
                strategy,
            });
        }

        const expectedPositions = buildExpectedAnchorPositions(source.length, splitPoints.length);
        const anchorStarts = [];
        let searchCursor = 0;

        for (let i = 0; i < splitPoints.length; i++) {
            const point = splitPoints[i] || {};
            const anchor = String(point.anchor || '').trim();
            const anchorLen = anchor.length;

            if (!anchor) {
                throw createChapterAssetsContractError(chapterIndex - 1, `第${i + 1}个 split_point 缺少 anchor`, {
                    splitPointIndex: i + 1,
                    strategy,
                });
            }
            if (anchorLen < MIN_ANCHOR_LEN || anchorLen > MAX_ANCHOR_LEN) {
                throw createChapterAssetsContractError(chapterIndex - 1, `第${i + 1}个 split_point.anchor 长度需在${MIN_ANCHOR_LEN}-${MAX_ANCHOR_LEN}之间，当前为${anchorLen}`, {
                    splitPointIndex: i + 1,
                    strategy,
                });
            }

            let foundAt = source.indexOf(anchor, searchCursor);
            if (foundAt < 0) {
                const expected = expectedPositions[i];
                const fuzzyStart = findBestAnchorStartByFuzzy(source, anchor, expected);
                if (Number.isInteger(fuzzyStart) && fuzzyStart >= searchCursor) {
                    foundAt = fuzzyStart;
                }
            }

            if (foundAt < 0) {
                throw createChapterAssetsContractError(chapterIndex - 1, `第${i + 1}个 split_point.anchor 无法在正文中定位`, {
                    splitPointIndex: i + 1,
                    anchor,
                    strategy,
                });
            }

            if (i > 0 && foundAt <= anchorStarts[i - 1]) {
                throw createChapterAssetsContractError(chapterIndex - 1, `split_point.anchor 定位顺序异常（第${i}与第${i + 1}个锚点发生倒序/重叠）`, {
                    splitPointIndex: i + 1,
                    strategy,
                });
            }

            anchorStarts.push(foundAt);
            searchCursor = Math.max(foundAt + 1, foundAt + Math.floor(anchor.length / 2));
        }

        const cutTargets = anchorStarts;
        const segments = trySplitContentWithCutTargets(source, cutTargets);
        if (!segments) {
            throw createChapterAssetsSplitError(
                chapterIndex - 1,
                '锚点切分后无法满足节拍长度约束（200-1500）或切分数量约束',
                {
                    beatCount,
                    cutTargets,
                    strategy,
                }
            );
        }

        return {
            segments,
            splitPoints,
            anchorStarts,
        };
    }

    function createChapterAssetsValidationError(index, message, detail = null) {
        const error = new Error(`[第${index + 1}章] 章节概览校验失败: ${message}`);
        error.code = 'CHAPTER_ASSETS_VALIDATION';
        if (detail && typeof detail === 'object') {
            error.detail = detail;
        }
        return error;
    }

    function createChapterAssetsContractError(index, message, detail = null) {
        const error = new Error(`[第${index + 1}章] 章节概览契约错误: ${message}`);
        error.code = 'CHAPTER_ASSETS_CONTRACT';
        if (detail && typeof detail === 'object') {
            error.detail = detail;
        }
        return error;
    }

    function createChapterAssetsSplitError(index, message, detail = null) {
        const error = new Error(`[第${index + 1}章] 章节切分失败: ${message}`);
        error.code = 'CHAPTER_ASSETS_SPLIT';
        if (detail && typeof detail === 'object') {
            error.detail = detail;
        }
        return error;
    }

    function summarizeBeatOriginalText(beats) {
        const list = Array.isArray(beats) ? beats : [];
        const lengths = [];
        const emptyBeatIndices = [];

        for (let i = 0; i < list.length; i++) {
            const beat = list[i] || {};
            const text = typeof beat.original_text === 'string' ? beat.original_text : '';
            const len = text.length;
            lengths.push(len);
            if (!text.trim()) {
                emptyBeatIndices.push(i + 1);
            }
        }

        return {
            count: list.length,
            lengths,
            emptyBeatIndices,
        };
    }

    function validateChapterAssetsOrThrow(assets, memory, index) {
        const beats = Array.isArray(assets?.script?.beats) ? assets.script.beats : [];
        const beatSummary = summarizeBeatOriginalText(beats);
        if (beats.length < 3 || beats.length > 8) {
            throw createChapterAssetsValidationError(index, `节拍数量需在3-8之间，当前为${beats.length}`);
        }

        let mergedOriginal = '';
        for (let i = 0; i < beats.length; i++) {
            const beat = beats[i] || {};
            const originalText = typeof beat.original_text === 'string' ? beat.original_text : '';
            const len = originalText.length;
            if (len < 200 || len > 1500) {
                const hint = len === 0 ? '（未提取到 original_text）' : '';
                throw createChapterAssetsValidationError(index, `第${i + 1}个节拍原文长度需在200-1500字，当前为${len}${hint}`, {
                    beatIndex: i + 1,
                    beatCount: beatSummary.count,
                    emptyBeatIndices: beatSummary.emptyBeatIndices,
                    lengths: beatSummary.lengths,
                });
            }

            const splitRule = beat.split_rule && typeof beat.split_rule === 'object' ? beat.split_rule : {};
            const primary = String(splitRule.primary || '').trim();
            const matched = Array.isArray(splitRule.matched)
                ? splitRule.matched.map((rule) => String(rule || '').trim()).filter(Boolean)
                : [];

            if (!primary || matched.length === 0) {
                throw createChapterAssetsValidationError(index, `第${i + 1}个节拍缺少 split_rule.primary 或 split_rule.matched`);
            }
            if (!matched.includes(primary)) {
                throw createChapterAssetsValidationError(index, `第${i + 1}个节拍 split_rule.primary 未包含在 matched 中`);
            }

            mergedOriginal += originalText;
        }

        const chapterContent = String(memory?.content || '');
        if (mergedOriginal !== chapterContent) {
            throw createChapterAssetsValidationError(
                index,
                `节拍原文拼接后与章节正文不一致（必须字级无损、无重叠无遗漏），拼接长度=${mergedOriginal.length}，正文长度=${chapterContent.length}`,
                {
                    beatCount: beatSummary.count,
                    emptyBeatIndices: beatSummary.emptyBeatIndices,
                    lengths: beatSummary.lengths,
                    mergedLength: mergedOriginal.length,
                    chapterLength: chapterContent.length,
                }
            );
        }
    }

    function normalizeSplitPointForContract(rawPoint, idx, chapterIndex) {
        const source = rawPoint && typeof rawPoint === 'object' ? rawPoint : {};
        const anchor = String(source.anchor || source.anchor_text || source.anchorText || '').trim();
        const anchorLen = anchor.length;
        const hint = String(source.hint || source.note || source.summary || '').trim();
        const rawSplitRule = source.split_rule || source.splitRule;

        if (!anchor) {
            throw createChapterAssetsContractError(chapterIndex, `第${idx + 1}个 split_point 缺少 anchor`, {
                splitPointIndex: idx + 1,
            });
        }

        if (anchorLen < MIN_ANCHOR_LEN || anchorLen > MAX_ANCHOR_LEN) {
            throw createChapterAssetsContractError(chapterIndex, `第${idx + 1}个 split_point.anchor 长度需在${MIN_ANCHOR_LEN}-${MAX_ANCHOR_LEN}之间，当前为${anchorLen}`, {
                splitPointIndex: idx + 1,
            });
        }

        if (!rawSplitRule || typeof rawSplitRule !== 'object') {
            throw createChapterAssetsContractError(chapterIndex, `第${idx + 1}个 split_point 缺少 split_rule`, {
                splitPointIndex: idx + 1,
            });
        }

        const rawPrimary = String(rawSplitRule.primary || rawSplitRule.rule || rawSplitRule.main || '').trim();
        if (!rawPrimary || !SPLIT_TYPES.has(rawPrimary)) {
            throw createChapterAssetsContractError(
                chapterIndex,
                `第${idx + 1}个 split_point.split_rule.primary 非法，必须为: ${Array.from(SPLIT_TYPES).join(', ')}`,
                { splitPointIndex: idx + 1 }
            );
        }

        if (!Array.isArray(rawSplitRule.matched) || rawSplitRule.matched.length === 0) {
            throw createChapterAssetsContractError(chapterIndex, `第${idx + 1}个 split_point.split_rule.matched 必须是非空数组`, {
                splitPointIndex: idx + 1,
            });
        }

        const rawMatched = rawSplitRule.matched
            .map((rule) => String(rule || '').trim())
            .filter(Boolean);
        const invalidMatched = rawMatched.filter((rule) => !SPLIT_TYPES.has(rule));
        if (invalidMatched.length > 0) {
            throw createChapterAssetsContractError(
                chapterIndex,
                `第${idx + 1}个 split_point.split_rule.matched 含非法类型: ${invalidMatched.join(', ')}`,
                { splitPointIndex: idx + 1 }
            );
        }
        if (!rawMatched.includes(rawPrimary)) {
            throw createChapterAssetsContractError(
                chapterIndex,
                `第${idx + 1}个 split_point.split_rule.primary 必须包含在 matched 中`,
                { splitPointIndex: idx + 1 }
            );
        }

        const splitRule = normalizeStrategySplitRule(rawSplitRule, rawPrimary);

        return {
            anchor,
            hint,
            split_rule: splitRule,
        };
    }

    function normalizeToNewContract(parsed, memory, index, meta = {}) {
        const fallbackOutline = toShortOutline(memory?.content || '', 140) || `${memory?.chapterTitle || `第${index + 1}章`}剧情推进。`;
        const outline = toShortOutline(parsed?.outline || parsed?.summary || parsed?.chapter_outline || '', 140) || fallbackOutline;

        const parsedScriptCandidate = parsed?.script || parsed?.chapterScript || null;
        if (parsedScriptCandidate && typeof parsedScriptCandidate === 'object' && Array.isArray(parsedScriptCandidate.beats)) {
            const script = normalizeScript(parsedScriptCandidate, outline);
            const hasOriginal = Array.isArray(script?.beats)
                && script.beats.every((b) => typeof b?.original_text === 'string' && b.original_text.trim());
            if (hasOriginal) {
                return {
                    kind: 'script',
                    outline,
                    script,
                    strategy: null,
                    compatibility: 'legacy-script',
                };
            }
        }

        const strategySource = parsed?.split_strategy && typeof parsed.split_strategy === 'object'
            ? parsed.split_strategy
            : parsed;
        const beatCountRaw = Number(strategySource?.beat_count ?? strategySource?.beatCount ?? parsed?.beat_count ?? parsed?.beatCount);
        if (!Number.isFinite(beatCountRaw)) {
            throw createChapterAssetsContractError(index, '缺少 beat_count（3-8）', {
                ...meta,
            });
        }
        const beatCount = Math.round(beatCountRaw);
        if (beatCount < 3 || beatCount > 8) {
            throw createChapterAssetsContractError(index, `beat_count 需在3-8之间，当前为${beatCount}`);
        }

        const rawSplitPoints = strategySource?.split_points ?? strategySource?.splitPoints ?? parsed?.split_points ?? parsed?.splitPoints;
        if (!Array.isArray(rawSplitPoints) || rawSplitPoints.length === 0) {
            throw createChapterAssetsContractError(index, '缺少 split_points 数组');
        }

        const expectedSplitCount = beatCount - 1;
        if (rawSplitPoints.length !== expectedSplitCount) {
            throw createChapterAssetsContractError(
                index,
                `split_points 数量错误：期望 beat_count-1=${expectedSplitCount}，实际=${rawSplitPoints.length}`
            );
        }

        const splitPoints = rawSplitPoints
            .slice(0, expectedSplitCount)
            .map((point, idx) => normalizeSplitPointForContract(point, idx, index));

        return {
            kind: 'strategy',
            outline,
            script: null,
            compatibility: 'new-strategy',
            strategy: {
                beat_count: beatCount,
                split_points: splitPoints,
            },
        };
    }

    function buildChapterAssetsFromSplit(memory, index, outline, strategy, applied, meta = {}) {
        const beats = buildBeatsFromSegments(applied?.segments || [], index + 1, applied?.splitPoints || strategy?.split_points || []);
        const script = normalizeScript({
            goal: '围绕本章核心冲突推进剧情并保持叙事连续。',
            flow: outline,
            keyNodes: [],
            beats,
        }, outline);
        return {
            outline,
            script,
            meta: {
                parsed: true,
                ...meta,
            },
        };
    }

    function parseChapterAssetsResponse(response, memory, index) {
        const rawLength = String(response || '').length;
        const rawPreview = String(response || '').replace(/\s+/g, ' ').slice(0, 180);
        const parsed = extractJsonObject(response);
        if (!parsed) {
            throw createChapterAssetsContractError(index, `导演响应不是有效JSON（响应长度=${rawLength}）`, {
                rawLength,
                rawPreview,
            });
        }

        const normalized = normalizeToNewContract(parsed, memory, index, {
            rawLength,
            rawPreview,
        });

        if (normalized.kind === 'script') {
            return {
                outline: normalized.outline,
                script: normalized.script,
                meta: {
                    parsed: true,
                    rawLength,
                    rawPreview,
                    source: 'legacy-script',
                    compatibility: normalized.compatibility,
                },
            };
        }

        let applied = null;
        try {
            applied = applySplitStrategyWithAnchors(memory?.content || '', normalized.strategy, index + 1);
        } catch (error) {
            if ((error?.code === 'CHAPTER_ASSETS_CONTRACT' || error?.code === 'CHAPTER_ASSETS_SPLIT') && normalized?.strategy) {
                error.detail = {
                    ...(error.detail && typeof error.detail === 'object' ? error.detail : {}),
                    strategy: normalized.strategy,
                    outline: normalized.outline,
                    rawLength,
                    rawPreview,
                };
            }
            throw error;
        }
        return buildChapterAssetsFromSplit(memory, index, normalized.outline, normalized.strategy, applied, {
            rawLength,
            rawPreview,
            source: 'anchor-strategy',
            compatibility: normalized.compatibility,
        });
    }

    function buildChapterAssetsPrompt(memory, index) {
        const chapterIndex = index + 1;
        const chapterTitle = memory.chapterTitle || `第${chapterIndex}章`;
        const previousMemory = index > 0 ? AppState.memory.queue[index - 1] : null;
        const previousOutline = previousMemory?.chapterOutline ? `\n上一章摘要：${previousMemory.chapterOutline}` : '';

        return `${getLanguagePrefix()}你是“章节切分助手”。你的任务只有一个：为本章生成可执行的切分策略 JSON，用于后续代码按锚点切分原文。\n\n硬规则（必须遵守）：\n1) 只输出 JSON，不要代码块，不要解释。\n2) beat_count 必须在 3-8。\n3) split_points 表示“切分点”，数量必须等于 beat_count - 1。\n4) 每个 split_point 必须包含 anchor（原文中的精确子串，长度${MIN_ANCHOR_LEN}-${MAX_ANCHOR_LEN}字），用于定位切分刀口。\n5) 每个 split_point 必须包含 split_rule 对象：{ primary, matched }，且 primary 必须在 matched 里。\n6) hint 仅用于解释该切分点前后发生了什么，不能大段照抄原文。\n\n切分类型枚举（split_rule.primary / matched 只能从以下选择）：\n- scene_switch：场景或时空发生明确切换。示例：从客栈切到街巷追逐。\n- action_closed：关键动作链条完成并得到结果。示例：破门→夺物→撤离完成。\n- dialogue_closed：核心对话话题形成阶段性结论。示例：谈判达成/彻底谈崩。\n- plot_twist：改变后续走向的新信息或突发事件出现。示例：同伴暴露身份。\n- perspective_switch：叙事视角切换到另一角色线。示例：主角线切到反派线。\n- interaction_point：天然适合玩家做选择或行动介入的节点。示例：门前二选一行动。\n\n分割原则（来自需求）：\n- 六铁则用于识别切分候选。\n- 防碎片：同目的不重复切分；300字内密集信号合并。\n- 冲突优先级：plot_twist > perspective_switch > scene_switch > interaction_point > action_closed/dialogue_closed。\n- 防剧透：每个节拍只覆盖自身剧情，不泄露后续核心事件。\n\n输出 JSON 模板（字段名必须一致）：\n{\n  "outline": "章节摘要（1-2句）",\n  "beat_count": 5,\n  "split_points": [\n    {\n      "anchor": "这里放原文中的精确子串（${MIN_ANCHOR_LEN}-${MAX_ANCHOR_LEN}字）",\n      "hint": "这个切分点前后发生了什么",\n      "split_rule": {\n        "primary": "scene_switch",\n        "matched": ["scene_switch", "interaction_point"]\n      }\n    }\n  ]\n}\n\n章节标题：${chapterTitle}${previousOutline}\n\n章节正文（仅供分析与截取 anchor，不要抄整段原文）：\n---\n${memory.content}\n---`;
    }

    async function generateChapterAssets(index, options = {}) {
        const memory = AppState.memory.queue[index];
        if (!memory) throw new Error('章节不存在');
        ensureChapterRuntime(memory, index);

        const {
            force = false,
            taskId = index + 1,
            maxRetries = AppState.settings.chapterOutlineMaxRetries ?? 1,
            runId = null,
        } = options;
        const configuredRetries = Number(maxRetries);
        const contractRetryLimit = Number.isFinite(configuredRetries)
            ? Math.max(0, Math.min(3, Math.round(configuredRetries)))
            : 1;

        throwIfRunInactive(runId);

        // 一致性优先：尽量等上一章状态落稳后再构造“上一章摘要”上下文。
        await waitForPreviousChapterReady(index, runId);
        throwIfRunInactive(runId);

        if (!force && memory.chapterOutlineStatus === 'done' && memory.chapterOutline) {
            return {
                outline: memory.chapterOutline,
                script: memory.chapterScript,
            };
        }

        throwIfRunInactive(runId);
        memory.chapterOutlineStatus = 'generating';
        memory.chapterOutlineError = '';
        updateMemoryQueueUI();

        const prompt = buildChapterAssetsPrompt(memory, index);
        let lastError = null;
        const chapterAssetsCaller = typeof callDirectorAPI === 'function' ? callDirectorAPI : callAPI;
        const commitAssets = (assets, source = '导演API') => {
            memory.chapterOutline = assets.outline;
            memory.chapterScript = assets.script;
            const beatCount = Array.isArray(memory.chapterScript?.beats) ? memory.chapterScript.beats.length : 0;
            if (!Number.isInteger(memory.chapterCurrentBeatIndex)) {
                memory.chapterCurrentBeatIndex = 0;
            }
            if (beatCount > 0) {
                memory.chapterCurrentBeatIndex = Math.max(0, Math.min(memory.chapterCurrentBeatIndex, beatCount - 1));
            } else {
                memory.chapterCurrentBeatIndex = 0;
            }
            memory.chapterOutlineStatus = 'done';
            memory.chapterOutlineError = '';
            updateStreamContent(`✅ [第${index + 1}章][${source}] 章节资产校验通过，beats=${beatCount}\n`);
            updateMemoryQueueUI();
            return assets;
        };

        for (let attempt = 0; attempt <= contractRetryLimit; attempt++) {
            try {
                throwIfRunInactive(runId);
                updateStreamContent(`🧭 [第${index + 1}章][导演API] 发起章节资产请求（尝试 ${attempt + 1}/${contractRetryLimit + 1}）\n`);
                const response = await runWithApiSemaphore('director', runId, async () => chapterAssetsCaller(prompt, taskId));
                throwIfRunInactive(runId);
                const assets = parseChapterAssetsResponse(response, memory, index);
                const beatSummary = summarizeBeatOriginalText(assets?.script?.beats);
                const sourceTag = assets?.meta?.source || 'director-unknown';
                updateStreamContent(`🔎 [第${index + 1}章][导演API] 响应解析完成: source=${sourceTag}, beats=${beatSummary.count}, 空原文节拍=${beatSummary.emptyBeatIndices.length}${beatSummary.emptyBeatIndices.length ? `(${beatSummary.emptyBeatIndices.join(',')})` : ''}\n`);
                validateChapterAssetsOrThrow(assets, memory, index);
                throwIfRunInactive(runId);
                return commitAssets(assets, sourceTag);
            } catch (error) {
                lastError = error;
                if (error?.message === 'ABORTED') {
                    throw error;
                }

                const isContractError = error?.code === 'CHAPTER_ASSETS_CONTRACT';
                const isSplitError = error?.code === 'CHAPTER_ASSETS_SPLIT' || error?.code === 'CHAPTER_ASSETS_VALIDATION';

                if (isContractError && error?.detail?.splitPointIndex) {
                    updateStreamContent(`ℹ️ [第${index + 1}章][导演API] 契约诊断: split_point[${error.detail.splitPointIndex}] 字段异常，请检查 anchor/split_rule\n`);
                }

                const canRetry = shouldRetryError(error);
                const brief = formatProcessingError(error, { chapterIndex: index + 1, task: '导演API' });
                if (attempt < contractRetryLimit && isRunActive(runId) && canRetry) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    updateStreamContent(`⚠️ ${brief}，${delay / 1000}秒后重试...\n`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                if (isSplitError) {
                    updateStreamContent(`🛑 [第${index + 1}章][导演API] 章节切分失败，已标记该章节失败并继续后续流程（可在章节概览页重roll本章）\n`);
                }
                if (!canRetry) {
                    updateStreamContent(`🛑 ${brief}（不可重试，已停止自动重试）\n`);
                }
            }
        }

        throwIfRunInactive(runId);

        memory.chapterOutlineStatus = 'failed';
        memory.chapterOutlineError = compactErrorMessage(lastError || new Error('大纲生成失败'));
        updateStreamContent(`⚠️ ${formatProcessingError(lastError || new Error(memory.chapterOutlineError), { chapterIndex: index + 1, task: '导演API' })}\n`);
        updateMemoryQueueUI();
        throw lastError || new Error(memory.chapterOutlineError);
    }

    async function processMemoryChunkIndependent(options) {
        const {
            index,
            retryCount = 0,
            customPromptSuffix = '',
            runId = AppState.processing.runId || null,
        } = options;
        const memory = AppState.memory.queue[index];
        const maxRetries = 3;
        const taskId = index + 1;
        const chapterIndex = index + 1;

        if (!AppState.processing.isRerolling && AppState.processing.isStopped) throw new Error('ABORTED');
        throwIfRunInactive(runId);

        await waitForPreviousChapterReady(index, runId);
        throwIfRunInactive(runId);

        ensureChapterRuntime(memory, index);
        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + buildSystemPrompt();

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0 && AppState.memory.queue[index - 1].content) {
            prompt += `\n\n前文结尾（供参考）：\n---\n${AppState.memory.queue[index - 1].content.slice(-800)}\n---\n`;
        }

        prompt += `\n\n当前需要分析的内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        const enabledCatNamesList = getEnabledCategories().map(c => c.name);
        if (AppState.settings.enablePlotOutline) enabledCatNamesList.push('剧情大纲');
        if (AppState.settings.enableLiteraryStyle) enabledCatNamesList.push('文风配置');

        const enabledCatNamesStr = enabledCatNamesList.join('、');

        prompt += `\n\n【输出限制】只允许输出以下分类：${enabledCatNamesStr}。禁止输出未列出的任何其他分类，直接输出JSON。`;

        if (AppState.settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += chapterForcePrompt;
        }

        if (customPromptSuffix) {
            prompt += `\n\n${customPromptSuffix}`;
        }

        if (AppState.settings.customSuffixPrompt && AppState.settings.customSuffixPrompt.trim()) {
            prompt += `\n\n${AppState.settings.customSuffixPrompt.trim()}`;
        }

        updateStreamContent(`\n🔄 [第${chapterIndex}章] 开始处理: ${memory.title}\n`);
        debugLog(`[第${chapterIndex}章] 开始, prompt长度=${prompt.length}字符, 重试=${retryCount}`);
        updateStreamContent(`📡 [第${chapterIndex}章] 已发起并行子任务：主API世界书 + 导演API章节资产\n`);

        let chapterAssetsPromise = null;
        const throughputMode = resolveChapterCompletionMode() === 'throughput';
        try {
            debugLog(`[第${chapterIndex}章] 启动并行子任务: 主API世界书 + 导演API章节资产`);
            const worldbookPromise = (async () => {
                debugLog(`[第${chapterIndex}章][主API] 调用中...`);
                const response = await runWithApiSemaphore('main', runId, async () => callAPI(prompt, taskId));
                throwIfRunInactive(runId);

                debugLog(`[第${chapterIndex}章][主API] 检查TokenLimit...`);
                if (isTokenLimitError(response)) throw new Error('Token limit exceeded');

                debugLog(`[第${chapterIndex}章][主API] 解析AI响应...`);
                let memoryUpdate = parseAIResponse(response, { strict: false });

                debugLog(`[第${chapterIndex}章][主API] 后处理章节索引...`);
                memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
                updateStreamContent(`✅ [第${chapterIndex}章][主API] 世界书响应解析完成\n`);
                return memoryUpdate;
            })();

            chapterAssetsPromise = (async () => {
                try {
                    return await generateChapterAssets(index, { taskId, force: true, runId });
                } catch (error) {
                    if (error?.message === 'ABORTED') throw error;
                    // 章节大纲失败不阻断世界书主流程
                    return null;
                }
            })();

            let memoryUpdate = null;
            if (throughputMode) {
                memoryUpdate = await worldbookPromise;
                if (chapterAssetsPromise) trackBackgroundChapterAssets(chapterAssetsPromise);
                updateStreamContent(`🧩 [第${chapterIndex}章] 世界书已完成，导演资产后台补齐中\n`);
            } else {
                [memoryUpdate] = await Promise.all([worldbookPromise, chapterAssetsPromise]);
            }
            throwIfRunInactive(runId);

            debugLog(`[第${chapterIndex}章] 处理完成`);
            updateStreamContent(`✅ [第${chapterIndex}章] 处理完成\n`);
            return memoryUpdate;

        } catch (error) {
            memory.processing = false;
            if (error.message === 'ABORTED') throw error;

            const brief = formatProcessingError(error, { chapterIndex, task: '主流程' });
            updateStreamContent(`❌ ${brief}\n`);

            if (isTokenLimitError(error.message)) {
                if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                throw new Error(`TOKEN_LIMIT:${index}`);
            }

            const canRetry = shouldRetryError(error);
            if (retryCount < maxRetries && isRunActive(runId) && canRetry) {
                if (chapterAssetsPromise) {
                    await chapterAssetsPromise.catch(() => null);
                }
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateStreamContent(`🔄 [第${chapterIndex}章] ${delay / 1000}秒后重试...\n`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return processMemoryChunkIndependent({ index, retryCount: retryCount + 1, customPromptSuffix, runId });
            }

            if (!canRetry) {
                updateStreamContent(`🛑 ${brief}（不可重试，已停止自动重试）\n`);
            }
            if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
            throw error;
        }
    }

    async function processMemoryChunksParallel(startIndex, endIndex) {
        const tasks = [];
        const results = new Map();
        const tokenLimitIndices = [];
        const runId = AppState.processing.runId || null;

        for (let i = startIndex; i < endIndex && i < AppState.memory.queue.length; i++) {
            if (AppState.memory.queue[i].processed && !AppState.memory.queue[i].failed) continue;
            tasks.push({ index: i, memory: AppState.memory.queue[i] });
        }

        if (tasks.length === 0) return { tokenLimitIndices };

        updateStreamContent(`
🚀 并行处理 ${tasks.length} 个记忆块 (并发: ${AppState.config.parallel.concurrency})
${'='.repeat(50)}
`);
        debugLog(`并行处理开始: ${tasks.length}任务, 并发=${AppState.config.parallel.concurrency}, 范围=${startIndex}-${endIndex}`);

        let completed = 0;
        AppState.globalSemaphore = new Semaphore(AppState.config.parallel.concurrency);

        const processOne = async (task) => {
            if (AppState.processing.isStopped) return null;
            try { await AppState.globalSemaphore.acquire(); }
            catch (e) { if (e.message === 'ABORTED') return null; throw e; }
            if (AppState.processing.isStopped) { AppState.globalSemaphore.release(); return null; }

            AppState.processing.activeTasks.add(task.index);

            try {
                debugLog(`[任务${task.index + 1}] 获取信号量成功, 开始处理`);
                updateProgress(((startIndex + completed) / AppState.memory.queue.length) * 100, `🚀 并行处理中 (${completed}/${tasks.length})`);
                const result = await processMemoryChunkIndependent({ index: task.index, runId });
                completed++;
                if (result && isRunActive(runId)) {
                    results.set(task.index, result);
                }
                updateMemoryQueueUI();
                return result;
            } catch (error) {
                completed++;
                task.memory.processing = false;

                if (error.message === 'ABORTED') { updateMemoryQueueUI(); return null; }
                if (error.message.startsWith('TOKEN_LIMIT:')) {
                    tokenLimitIndices.push(parseInt(error.message.split(':')[1], 10));
                } else {
                    task.memory.failed = true;
                    task.memory.failedError = error.message;
                    task.memory.processed = true;
                }
                updateMemoryQueueUI();
                return null;
            } finally {
                AppState.processing.activeTasks.delete(task.index);
                AppState.globalSemaphore.release();
            }
        };

        await Promise.allSettled(tasks.map(task => processOne(task)));
        AppState.processing.activeTasks.clear();
        AppState.globalSemaphore = null;

        const orderedTasks = tasks.filter(task => results.has(task.index)).sort((a, b) => a.index - b.index);
        for (const task of orderedTasks) {
            const result = results.get(task.index);
            task.memory.processed = true;
            task.memory.failed = false;
            task.memory.processing = false;
            task.memory.result = result;
            await mergeWorldbookDataWithHistory({ target: AppState.worldbook.generated, source: result, memoryIndex: task.index, memoryTitle: task.memory.title });
            await MemoryHistoryDB.saveRollResult(task.index, result);
        }

        updateMemoryQueueUI();
        updateStreamContent(`
${'='.repeat(50)}
📦 并行处理完成，成功: ${results.size}/${tasks.length}
`);
        return { tokenLimitIndices };
    }

    async function processMemoryChunk(index, retryCount = 0, options = {}) {
        if (AppState.processing.isStopped) return;

        const runId = options.runId ?? AppState.processing.runId ?? null;
        throwIfRunInactive(runId);
        await waitForPreviousChapterReady(index, runId);
        throwIfRunInactive(runId);

        const memory = AppState.memory.queue[index];
        const progress = ((index + 1) / AppState.memory.queue.length) * 100;
        const maxRetries = 3;
        const chapterIndex = index + 1;

        ensureChapterRuntime(memory, index);

        debugLog(`[串行][第${chapterIndex}章] 开始, 重试=${retryCount}`);
        updateProgress(progress, `正在处理: ${memory.title} (第${chapterIndex}章)${retryCount > 0 ? ` (重试 ${retryCount})` : ''}`);
        updateStreamContent(`📡 [第${chapterIndex}章] 已发起并行子任务：主API世界书 + 导演API章节资产\n`);

        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + buildSystemPrompt();

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0) {
            prompt += `\n\n上次阅读结尾：\n---\n${AppState.memory.queue[index - 1].content.slice(-200)}\n---\n`;
            const relevantContext = buildRelevantWorldbookContext(memory.content);
            if (relevantContext) {
                prompt += relevantContext;
            }
        }
        prompt += `\n现在阅读的部分（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        if (index === 0 || index === AppState.memory.startIndex) {
            prompt += '\n请开始分析小说内容。';
        } else if (AppState.processing.incrementalMode) {
            prompt += '\n请增量更新世界书，只输出变更的条目。';
        } else {
            prompt += '\n请累积补充世界书。';
        }

        if (AppState.settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += '\n直接输出JSON格式结果。';
            prompt += chapterForcePrompt;
        } else {
            prompt += '\n直接输出JSON格式结果。';
        }

        let chapterAssetsPromise = null;
        const throughputMode = resolveChapterCompletionMode() === 'throughput';
        try {
            chapterAssetsPromise = (async () => {
                try {
                    return await generateChapterAssets(index, { taskId: chapterIndex, force: true, runId });
                } catch (error) {
                    if (error?.message === 'ABORTED') throw error;
                    // 章节大纲失败不阻断世界书主流程
                    return null;
                }
            })();

            debugLog(`[串行][第${chapterIndex}章] 主API调用中, prompt长度=${prompt.length}`);
            const response = await runWithApiSemaphore('main', runId, async () => callAPI(prompt));
            throwIfRunInactive(runId);

            if (AppState.processing.isStopped) {
                if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                memory.processing = false;
                updateMemoryQueueUI();
                return;
            }

            debugLog(`[串行][第${chapterIndex}章] 检查TokenLimit...`);
            if (isTokenLimitError(response)) {
                if (AppState.processing.volumeMode) {
                    if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                    handleStartNewVolume();
                    await MemoryHistoryDB.saveState(index);
                    await processMemoryChunk(index, 0, { runId });
                    return;
                }
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(index);
                    await processMemoryChunk(index, 0, { runId });
                    await processMemoryChunk(index + 1, 0, { runId });
                    return;
                }
            }

            debugLog(`[串行][第${chapterIndex}章] 解析AI响应...`);
            let memoryUpdate = parseAIResponse(response, { strict: false });
            memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
            updateStreamContent(`✅ [第${chapterIndex}章][主API] 世界书响应解析完成\n`);

            debugLog(`[串行][第${chapterIndex}章] 合并世界书...`);
            await mergeWorldbookDataWithHistory({ target: AppState.worldbook.generated, source: memoryUpdate, memoryIndex: index, memoryTitle: memory.title });
            debugLog(`[串行][第${chapterIndex}章] 保存Roll结果...`);
            await MemoryHistoryDB.saveRollResult(index, memoryUpdate);

            if (chapterAssetsPromise && !throughputMode) {
                await chapterAssetsPromise;
            } else if (chapterAssetsPromise) {
                trackBackgroundChapterAssets(chapterAssetsPromise);
                updateStreamContent(`🧩 [第${chapterIndex}章] 世界书已完成，导演资产后台补齐中\n`);
            }
            throwIfRunInactive(runId);

            debugLog(`[串行][第${chapterIndex}章] 完成`);

            memory.processing = false;
            memory.processed = true;
            memory.result = memoryUpdate;
            updateMemoryQueueUI();

        } catch (error) {
            memory.processing = false;

            if (error?.message === 'ABORTED') {
                updateMemoryQueueUI();
                return;
            }

            const brief = formatProcessingError(error, { chapterIndex, task: '主流程' });
            updateStreamContent(`❌ ${brief}\n`);

            if (isTokenLimitError(error.message || '')) {
                if (AppState.processing.volumeMode) {
                    if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                    handleStartNewVolume();
                    await MemoryHistoryDB.saveState(index);
                    await new Promise(r => setTimeout(r, 500));
                    await processMemoryChunk(index, 0, { runId });
                    return;
                }
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(index);
                    await new Promise(r => setTimeout(r, 500));
                    await processMemoryChunk(index, 0, { runId });
                    await processMemoryChunk(index + 1, 0, { runId });
                    return;
                }
            }

            const canRetry = shouldRetryError(error);
            if (retryCount < maxRetries && canRetry && isRunActive(runId)) {
                if (chapterAssetsPromise) {
                    await chapterAssetsPromise.catch(() => null);
                }
                const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateProgress(progress, `处理失败，${retryDelay / 1000}秒后重试`);
                await new Promise(r => setTimeout(r, retryDelay));
                return processMemoryChunk(index, retryCount + 1, { runId });
            }

            if (!canRetry) {
                updateStreamContent(`🛑 ${brief}（不可重试，已停止自动重试）\n`);
            }

            if (chapterAssetsPromise) chapterAssetsPromise.catch(() => null);

            memory.processed = true;
            memory.failed = true;
            memory.failedError = error.message;
            if (!AppState.memory.failedQueue.find(m => m.index === index)) {
                AppState.memory.failedQueue.push({ index, memory, error: error.message });
            }
            updateMemoryQueueUI();
        }

        if (memory.processed) await new Promise(r => setTimeout(r, 1000));
    }

    function handleStopProcessing() {
        transitionTo('stopped');
        AppState.processing.runId = null;

        if (AppState.globalSemaphore) AppState.globalSemaphore.abort();
        abortApiSemaphores();
        AppState.processing.activeTasks.clear();
        if (AppState.processing.pendingChapterAssets instanceof Set) {
            AppState.processing.pendingChapterAssets.clear();
        }
        AppState.memory.queue.forEach(m => { if (m.processing) m.processing = false; });
        updateMemoryQueueUI();
        updateStreamContent('\n⏸️ 已暂停\n');
        updateStopButtonVisibility(true);
    }

    async function handleStartProcessing() {
        showProgressSection(true);
        transitionTo('running');
        const runId = nextRunId();
        AppState.processing.runId = runId;

        updateStopButtonVisibility(true);

        if (AppState.globalSemaphore) AppState.globalSemaphore.reset();
        abortApiSemaphores();
        setupApiSemaphores();
        AppState.processing.activeTasks.clear();
        ensurePendingChapterAssetsSet().clear();

        updateStreamContent('', true);

        const enabledCatNames = getEnabledCategories().map(c => c.name).join(', ');
        const chapterCompletionModeLabel = resolveChapterCompletionMode() === 'throughput'
            ? '吞吐优先（主先落地，导演后补）'
            : '一致性优先（主+导演汇合）';
        const chainDesc = (AppState.settings.promptMessageChain || []).filter(m => m.enabled !== false);
        const chainSummary = chainDesc.length <= 1 ? '默认(单条用户消息)' : `${chainDesc.length}条消息[${chainDesc.map(m => m.role === 'system' ? '系统' : m.role === 'assistant' ? 'AI' : '用户').join('→')}]`;
        updateStreamContent(`🚀 开始处理...\n📊 处理模式: ${AppState.config.parallel.enabled ? `并行 (${AppState.config.parallel.concurrency}并发)` : '串行'}\n🧩 章节完成策略: ${chapterCompletionModeLabel}\n🧵 API并发: 主API=${AppState.processing.mainApiConcurrency || 1} | 导演API=${AppState.processing.directorApiConcurrency || 1}\n🔧 API模式: ${AppState.settings.useTavernApi ? '酒馆API' : '自定义API (' + AppState.settings.customApiProvider + ')'}\n📌 强制章节标记: ${AppState.settings.forceChapterMarker ? '开启' : '关闭'}\n💬 消息链: ${chainSummary}\n🏷️ 启用分类: ${enabledCatNames}\n${'='.repeat(50)}\n`);
        debugLog('调试模式已开启 - 将记录每步耗时');

        const effectiveStartIndex = AppState.memory.userSelectedIndex !== null ? AppState.memory.userSelectedIndex : AppState.memory.startIndex;

        if (effectiveStartIndex === 0) {
            const hasProcessedMemories = AppState.memory.queue.some(m => m.processed && !m.failed && m.result);
            if (!hasProcessedMemories) {
                AppState.worldbook.volumes = [];
                AppState.worldbook.currentVolumeIndex = 0;

                AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
                applyDefaultWorldbookEntries();
            }
        }

        AppState.memory.userSelectedIndex = null;

        if (AppState.processing.volumeMode) updateVolumeIndicator();
        updateStartButtonState(true);

        try {
            if (AppState.config.parallel.enabled) {
                if (AppState.config.parallel.mode === 'independent') {
                    const { tokenLimitIndices } = await processMemoryChunksParallel(effectiveStartIndex, AppState.memory.queue.length);
                    if (AppState.processing.isStopped) {
                        const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                        updateProgress((processedCount / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                        await MemoryHistoryDB.saveState(processedCount);
                        updateStartButtonState(false);
                        return;
                    }
                    if (tokenLimitIndices.length > 0) {
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) {
                            splitMemoryIntoTwo(idx);
                        }
                        updateMemoryQueueUI();
                        for (let i = 0; i < AppState.memory.queue.length; i++) {
                            if (AppState.processing.isStopped) break;
                            if (!AppState.memory.queue[i].processed || AppState.memory.queue[i].failed) {
                                await processMemoryChunk(i, 0, { runId });
                            }
                        }
                    }
                } else {
                    const batchSize = AppState.config.parallel.concurrency;
                    let i = effectiveStartIndex;
                    while (i < AppState.memory.queue.length && !AppState.processing.isStopped) {
                        const batchEnd = Math.min(i + batchSize, AppState.memory.queue.length);
                        const { tokenLimitIndices } = await processMemoryChunksParallel(i, batchEnd);
                        if (AppState.processing.isStopped) break;
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) splitMemoryIntoTwo(idx);
                        for (let j = i; j < batchEnd && j < AppState.memory.queue.length && !AppState.processing.isStopped; j++) {
                            if (!AppState.memory.queue[j].processed || AppState.memory.queue[j].failed) await processMemoryChunk(j, 0, { runId });
                        }
                        i = batchEnd;
                        await MemoryHistoryDB.saveState(i);
                    }
                }
            } else {
                let i = effectiveStartIndex;
                while (i < AppState.memory.queue.length) {
                    if (AppState.processing.isStopped) {
                        updateProgress((i / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                        await MemoryHistoryDB.saveState(i);
                        updateStartButtonState(false);
                        return;
                    }
                    if (AppState.memory.queue[i].processed && !AppState.memory.queue[i].failed) { i++; continue; }
                    const currentLen = AppState.memory.queue.length;
                    await processMemoryChunk(i, 0, { runId });
                    if (AppState.memory.queue.length > currentLen) i += (AppState.memory.queue.length - currentLen);
                    i++;
                    await MemoryHistoryDB.saveState(i);
                }
            }

            if (AppState.processing.isStopped) {
                const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                updateProgress((processedCount / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                await MemoryHistoryDB.saveState(processedCount);
                updateStartButtonState(false);
                return;
            }

            if (AppState.processing.volumeMode && Object.keys(AppState.worldbook.generated).length > 0) {
                AppState.worldbook.volumes.push({ volumeIndex: AppState.worldbook.currentVolumeIndex, worldbook: JSON.parse(JSON.stringify(AppState.worldbook.generated)), timestamp: Date.now() });
            }

            if (resolveChapterCompletionMode() === 'throughput') {
                await flushBackgroundChapterAssets(runId);
            }

            const failedCount = AppState.memory.queue.filter(m => m.failed).length;
            if (failedCount > 0) {
                updateProgress(100, `⚠️ 完成，但有 ${failedCount} 个失败`);
            } else {
                updateProgress(100, '✅ 全部完成！');
            }

            showResultSection(true);
            updateWorldbookPreview();
            updateStreamContent(`\n${'='.repeat(50)}\n✅ 处理完成！\n`);

            await MemoryHistoryDB.saveState(AppState.memory.queue.length);
            await MemoryHistoryDB.clearState();
            transitionTo('idle');
            updateStartButtonState(false);

        } catch (error) {
            if (error?.message === 'ABORTED') {
                const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                const progress = AppState.memory.queue.length > 0
                    ? (processedCount / AppState.memory.queue.length) * 100
                    : 0;
                const tip = AppState.processing.isStopped ? '⏸️ 已暂停' : '⏹️ 本次任务已中断';
                updateProgress(progress, tip);
                updateStreamContent(`\nℹ️ ${tip}\n`);
                if (currentStatus() !== 'stopped') transitionTo('idle');
                updateStartButtonState(false);
                return;
            }

            ErrorHandler.handle(error, 'startAIProcessing');
            const brief = formatProcessingError(error, { task: '处理总流程' });
            updateProgress(0, `❌ 出错: ${compactErrorMessage(error)}`);
            updateStreamContent(`\n❌ ${brief}\n`);
            if (currentStatus() !== 'stopped') transitionTo('idle');
            updateStartButtonState(false);
        } finally {
            if (AppState.processing.runId === runId && currentStatus() !== 'running') {
                AppState.processing.runId = null;
            }
            if (!AppState.processing.runId || AppState.processing.runId === runId) {
                abortApiSemaphores();
            }
        }
    }

    async function handleRepairFailedMemories() {
        const failedMemories = AppState.memory.queue.filter(m => m.failed);
        if (failedMemories.length === 0) { ErrorHandler.showUserError('没有需要修复的记忆'); return; }

        transitionTo('repairing');

        showProgressSection(true);
        updateStopButtonVisibility(true);
        updateProgress(0, `修复中 (0/${failedMemories.length})`);

        const stats = { successCount: 0, stillFailedCount: 0 };

        for (let i = 0; i < failedMemories.length; i++) {
            if (AppState.processing.isStopped) break;
            const memory = failedMemories[i];
            const memoryIndex = AppState.memory.queue.indexOf(memory);
            if (memoryIndex === -1) continue;
            updateProgress(((i + 1) / failedMemories.length) * 100, `修复: ${memory.title}`);
            await handleRepairMemoryWithSplit(memoryIndex, stats);
        }

        AppState.memory.failedQueue = AppState.memory.failedQueue.filter(item => AppState.memory.queue[item.index]?.failed);
        updateProgress(100, `修复完成: 成功 ${stats.successCount}, 仍失败 ${stats.stillFailedCount}`);
        await MemoryHistoryDB.saveState(AppState.memory.queue.length);
        if (currentStatus() !== 'stopped') transitionTo('idle');

        ErrorHandler.showUserSuccess(`修复完成！成功: ${stats.successCount}, 仍失败: ${stats.stillFailedCount}`);
        updateMemoryQueueUI();
    }

    async function retryChapterOutline(index) {
        if (index < 0 || index >= AppState.memory.queue.length) {
            throw new Error('章节索引无效');
        }
        const result = await generateChapterAssets(index, {
            force: true,
            taskId: index + 1,
            maxRetries: Math.max(1, AppState.settings.chapterOutlineMaxRetries ?? 1),
        });

        const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
        await MemoryHistoryDB.saveState(processedCount);
        return result;
    }

    return {
        processMemoryChunkIndependent,
        processMemoryChunksParallel,
        processMemoryChunk,
        handleStopProcessing,
        handleStartProcessing,
        handleRepairFailedMemories,
        retryChapterOutline,
    };
}
