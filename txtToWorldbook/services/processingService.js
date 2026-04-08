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
        if (error?.code === 'CHAPTER_ASSETS_VALIDATION') return true;

        const status = extractStatusCode(error);
        if (status === 429) return true;
        if (status >= 500 && status < 600) return true;
        if (status >= 400 && status < 500) return false;

        const message = String(error?.message || '').toLowerCase();
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
        const singleLine = raw.replace(/\s+/g, ' ').trim();
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

        const fenceCleaned = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            const parsed = JSON.parse(fenceCleaned);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {
            // ignore and try fallback
        }

        const start = fenceCleaned.indexOf('{');
        const end = fenceCleaned.lastIndexOf('}');
        if (start !== -1 && end > start) {
            const candidate = fenceCleaned.slice(start, end + 1);
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) {
                return null;
            }
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

    function createChapterAssetsValidationError(index, message) {
        const error = new Error(`[第${index + 1}章] 章节概览校验失败: ${message}`);
        error.code = 'CHAPTER_ASSETS_VALIDATION';
        return error;
    }

    function validateChapterAssetsOrThrow(assets, memory, index) {
        const beats = Array.isArray(assets?.script?.beats) ? assets.script.beats : [];
        if (beats.length < 3 || beats.length > 8) {
            throw createChapterAssetsValidationError(index, `节拍数量需在3-8之间，当前为${beats.length}`);
        }

        let mergedOriginal = '';
        for (let i = 0; i < beats.length; i++) {
            const beat = beats[i] || {};
            const originalText = typeof beat.original_text === 'string' ? beat.original_text : '';
            const len = originalText.length;
            if (len < 200 || len > 1500) {
                throw createChapterAssetsValidationError(index, `第${i + 1}个节拍原文长度需在200-1500字，当前为${len}`);
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
            throw createChapterAssetsValidationError(index, '节拍原文拼接后与章节正文不一致（必须字级无损、无重叠无遗漏）');
        }
    }

    function parseChapterAssetsResponse(response, memory, index) {
        const fallbackOutline = toShortOutline(memory.content, 140) || `${memory.chapterTitle || `第${index + 1}章`}剧情推进。`;
        const parsed = extractJsonObject(response);

        if (!parsed) {
            const plain = toShortOutline(response, 140) || fallbackOutline;
            return {
                outline: plain,
                script: normalizeScript({}, plain),
            };
        }

        const outline = toShortOutline(parsed.outline || parsed.summary || parsed.chapter_outline || '', 140) || fallbackOutline;
        const script = normalizeScript(parsed.script || parsed.chapterScript || {}, outline);
        return { outline, script };
    }

    function buildChapterAssetsPrompt(memory, index) {
        const chapterIndex = index + 1;
        const chapterTitle = memory.chapterTitle || `第${chapterIndex}章`;
        const previousMemory = index > 0 ? AppState.memory.queue[index - 1] : null;
        const previousOutline = previousMemory?.chapterOutline ? `\n上一章摘要：${previousMemory.chapterOutline}` : '';

        return `${getLanguagePrefix()}你是小说章节分析助手。请基于章节正文输出“摘要 + 节拍剧本”，并严格遵守分割规则。\n\n核心拆分规则（必须遵守）：\n1) 六条分割铁则（用于识别可切点）：动作闭环、场景切换、对话闭环、剧情转折、视角切换、互动切口。\n2) 碎片挂靠：回忆/心理/碎嘴对话不可独立成节拍，需挂靠核心节拍。\n3) 合并规则：同一叙事目的的连续小事件必须合并。\n4) 节拍数量：每章 3-8 个。\n5) 节拍原文字数：每个 200-1500 字。\n6) 无损约束：beats.original_text 按顺序拼接后，必须与章节正文逐字完全一致，且无重叠无遗漏。\n7) 剧透防护：当前节拍原文不得包含后续节拍核心信息。\n\n防碎片三保险：\n- 同目的只切一次。\n- 信号优先级：剧情转折 > 视角切换 > 场景切换 > 互动切口 > 动作/对话闭环。\n- 连续300字内多个信号按同一次叙事波动处理，仅取最强切分。\n\n输出要求：\n1) 只输出 JSON，不要代码块。\n2) 必须包含字段 outline 与 script。\n3) outline 为 1-2 句中文摘要。\n4) script 必须包含 goal、flow、keyNodes(最多3条)、beats(3-8个)。\n5) beats 每项必须包含：id、summary、exitCondition、tags、original_text、split_rule。\n6) split_rule 必须包含：primary（主导规则）、matched（命中规则数组，需包含 primary）。\n7) 不允许额外文本。\n\n输出格式：\n{\n  "outline": "...",\n  "script": {\n    "goal": "...",\n    "flow": "...",\n    "keyNodes": ["...", "...", "..."],\n    "beats": [\n      {\n        "id": "b1",\n        "summary": "...",\n        "exitCondition": "...",\n        "tags": ["...", "..."],\n        "original_text": "该节拍对应原文（必须是正文原句片段）",\n        "split_rule": {\n          "primary": "剧情转折",\n          "matched": ["剧情转折", "互动切口"]\n        }\n      }\n    ]\n  }\n}\n\n章节标题：${chapterTitle}${previousOutline}\n\n章节正文：\n---\n${memory.content}\n---`;
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

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                throwIfRunInactive(runId);
                const response = await runWithApiSemaphore('director', runId, async () => chapterAssetsCaller(prompt, taskId));
                throwIfRunInactive(runId);
                const assets = parseChapterAssetsResponse(response, memory, index);
                validateChapterAssetsOrThrow(assets, memory, index);
                throwIfRunInactive(runId);
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
                updateStreamContent(`🧭 [第${index + 1}章] 大纲生成完成\n`);
                updateMemoryQueueUI();
                return assets;
            } catch (error) {
                lastError = error;
                if (error?.message === 'ABORTED') {
                    throw error;
                }
                const canRetry = shouldRetryError(error);
                const brief = formatProcessingError(error, { chapterIndex: index + 1, task: '导演API' });
                if (attempt < maxRetries && isRunActive(runId) && canRetry) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    updateStreamContent(`⚠️ ${brief}，${delay / 1000}秒后重试...\n`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
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
                let memoryUpdate = parseAIResponse(response);

                debugLog(`[第${chapterIndex}章][主API] 后处理章节索引...`);
                memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
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
            prompt += `\n\n上次阅读结尾：\n---\n${AppState.memory.queue[index - 1].content.slice(-500)}\n---\n`;
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
            let memoryUpdate = parseAIResponse(response);
            memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);

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
