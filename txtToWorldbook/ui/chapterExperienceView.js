export function createChapterExperienceView(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        callAPI,
        getLanguagePrefix,
        retryChapterOutline,
        showResultSection,
    } = deps;

    const selectors = {
        outlineSection: 'ttw-story-outline-section',
        currentSection: 'ttw-current-chapter-section',
        outlineList: 'ttw-story-outline-list',
        currentTitle: 'ttw-current-chapter-title',
        currentSummary: 'ttw-current-story-summary',
        currentScript: 'ttw-current-script',
        currentOpening: 'ttw-current-opening',
        chapterHint: 'ttw-current-chapter-hint',
        nextButton: 'ttw-next-chapter-btn',
        startFirstButton: 'ttw-start-reading-first',
        viewTabs: 'ttw-view-nav',
        txtModeButton: 'ttw-view-mode-txt',
        progressModeButton: 'ttw-view-mode-progress',
        outlineModeButton: 'ttw-view-mode-outline',
        currentModeButton: 'ttw-view-mode-current',
        progressSection: 'ttw-progress-section',
        txtModeClass: 'ttw-mode-txt',
    };

    function hideWithRestore(el) {
        if (!el) return;
        if (el.dataset.swHiddenByMode === '1') return;
        el.dataset.swHiddenByMode = '1';
        el.dataset.swPrevDisplayMode = el.style.display || '';
        el.style.display = 'none';
    }

    function restoreFromHide(el) {
        if (!el) return;
        if (el.dataset.swHiddenByMode !== '1') return;
        el.style.display = el.dataset.swPrevDisplayMode || '';
        delete el.dataset.swHiddenByMode;
        delete el.dataset.swPrevDisplayMode;
    }

    function forceShowWithRestore(el) {
        if (!el) return;
        if (el.dataset.swShownByMode === '1') return;
        el.dataset.swShownByMode = '1';
        el.dataset.swPrevDisplayForced = el.style.display || '';
        el.style.display = 'block';
    }

    function restoreFromForcedShow(el) {
        if (!el) return;
        if (el.dataset.swShownByMode !== '1') return;
        el.style.display = el.dataset.swPrevDisplayForced || '';
        delete el.dataset.swShownByMode;
        delete el.dataset.swPrevDisplayForced;
    }

    function forceHideResultWithRestore(el) {
        if (!el) return;
        if (el.dataset.swResultHiddenByMode === '1') return;
        el.dataset.swResultHiddenByMode = '1';
        el.dataset.swPrevResultDisplay = el.style.display || '';
        el.style.display = 'none';
    }

    function restoreResultFromForcedHide(el) {
        if (!el) return;
        if (el.dataset.swResultHiddenByMode !== '1') return;
        el.style.display = el.dataset.swPrevResultDisplay || '';
        delete el.dataset.swResultHiddenByMode;
        delete el.dataset.swPrevResultDisplay;
    }

    function setModeTabActive(mode) {
        const tabMap = {
            txt: selectors.txtModeButton,
            progress: selectors.progressModeButton,
            outline: selectors.outlineModeButton,
            current: selectors.currentModeButton,
        };
        Object.entries(tabMap).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (key === mode) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function setTxtSectionsVisible(show) {
        const sections = document.querySelectorAll(`.${selectors.txtModeClass}`);
        sections.forEach((el) => {
            if (show) {
                restoreFromHide(el);
            } else {
                hideWithRestore(el);
            }
        });
    }

    function setResultSectionVisibleForMode(mode) {
        const resultSection = document.getElementById('ttw-result-section');
        if (!resultSection) return;

        if (mode === 'txt') {
            restoreResultFromForcedHide(resultSection);
            restoreFromForcedShow(resultSection);
            if (typeof showResultSection === 'function') {
                showResultSection(true);
            }
            return;
        }

        restoreFromForcedShow(resultSection);
        if (typeof showResultSection === 'function') {
            showResultSection(false);
        }
        forceHideResultWithRestore(resultSection);
    }

    function ensureState() {
        if (!AppState.experience) {
            AppState.experience = { currentChapterIndex: 0 };
        }
    }

    function getMemory(index) {
        return AppState.memory.queue[index] || null;
    }

    function ensureMemoryRuntime(memory, index) {
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
            memory.chapterScript = { goal: '', flow: '', keyNodes: [] };
        }
        if (!Array.isArray(memory.chapterScript.keyNodes)) {
            memory.chapterScript.keyNodes = [];
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
        if (typeof memory.chapterOpeningGenerating !== 'boolean') {
            memory.chapterOpeningGenerating = false;
        }
    }

    function toShortText(text, maxLen = 180) {
        const plain = String(text || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';
        return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
    }

    function deriveOutlineFromContent(memory) {
        const raw = toShortText(memory.content || '', 140);
        if (!raw) return `${memory.chapterTitle}剧情推进。`;
        const firstSentence = raw.split(/[。！？!?]/).map((s) => s.trim()).filter(Boolean).slice(0, 2).join('，');
        return firstSentence || raw;
    }

    function deriveScriptFromOutline(outline) {
        const text = toShortText(outline, 160);
        const nodes = text
            .split(/[，,。]/)
            .map((node) => node.trim())
            .filter(Boolean)
            .slice(0, 3);

        return {
            goal: '围绕本章关键冲突推进叙事并保持角色动机一致。',
            flow: text || '本章推进关键事件并承接上章内容。',
            keyNodes: nodes,
        };
    }

    function statusTag(status) {
        if (status === 'done') return '<span class="ttw-outline-status ttw-outline-status-done">已生成</span>';
        if (status === 'generating') return '<span class="ttw-outline-status ttw-outline-status-generating">生成中</span>';
        if (status === 'failed') return '<span class="ttw-outline-status ttw-outline-status-failed">生成失败</span>';
        return '<span class="ttw-outline-status ttw-outline-status-pending">待生成</span>';
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setSectionVisibility({ showOutline = false, showCurrent = false, showProgress = false }) {
        const outlineSection = document.getElementById(selectors.outlineSection);
        const currentSection = document.getElementById(selectors.currentSection);
        const progressSection = document.getElementById(selectors.progressSection);
        if (outlineSection) outlineSection.style.display = showOutline ? 'block' : 'none';
        if (currentSection) currentSection.style.display = showCurrent ? 'block' : 'none';
        if (progressSection) progressSection.style.display = showProgress ? 'block' : 'none';
    }

    function renderOutlineList() {
        const listEl = document.getElementById(selectors.outlineList);
        if (!listEl) return;

        if (AppState.memory.queue.length === 0) {
            listEl.innerHTML = '<div class="ttw-outline-empty">暂无章节数据，请先导入并完成处理。</div>';
            return;
        }

        const html = AppState.memory.queue.map((memory, index) => {
            ensureMemoryRuntime(memory, index);
            const title = memory.chapterTitle || `第${index + 1}章`;
            const outline = memory.chapterOutline || '';
            const outlineText = outline || (memory.chapterOutlineStatus === 'failed' ? '该章大纲生成失败，请点击重试。' : '该章尚未生成大纲。');
            const isGenerating = memory.chapterOutlineStatus === 'generating';
            const rerollLabel = isGenerating ? '⏳ 本章生成中...' : '🔄 重roll本章';
            const rerollDisabledAttr = isGenerating ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : '';

            return `
<div class="ttw-outline-item" data-index="${index}">
    <button class="ttw-outline-toggle" data-action="toggle" data-index="${index}">
        <span class="ttw-outline-title">${escapeHtml(title)}</span>
        ${statusTag(memory.chapterOutlineStatus)}
    </button>
    <div class="ttw-outline-body" id="ttw-outline-body-${index}" style="display:none;">
        <div class="ttw-outline-summary">${escapeHtml(outlineText)}</div>
        <button class="ttw-btn ttw-btn-small" data-action="reroll-chapter-assets" data-index="${index}" ${rerollDisabledAttr}>${rerollLabel}</button>
        <button class="ttw-btn ttw-btn-small" data-action="view-chapter" data-index="${index}">📖 查看当前章节概览</button>
    </div>
</div>`;
        }).join('');

        listEl.innerHTML = html;
    }

    function buildScriptHtml(memory) {
        const script = memory.chapterScript && typeof memory.chapterScript === 'object'
            ? memory.chapterScript
            : deriveScriptFromOutline(memory.chapterOutline);

        const goal = toShortText(script.goal, 140) || '围绕本章核心冲突推进剧情。';
        const flow = toShortText(script.flow, 220) || (memory.chapterOutline || '本章沿主线推进。');
        const keyNodes = Array.isArray(script.keyNodes)
            ? script.keyNodes.map((node) => toShortText(node, 60)).filter(Boolean)
            : [];

        const nodesHtml = keyNodes.length > 0
            ? `<ul>${keyNodes.map((node) => `<li>${escapeHtml(node)}</li>`).join('')}</ul>`
            : '<div class="ttw-script-empty">暂无关键节点，将按摘要推进。</div>';

        return `
<div class="ttw-script-block">
    <div class="ttw-script-field"><strong>目标：</strong>${escapeHtml(goal)}</div>
    <div class="ttw-script-field"><strong>流程：</strong>${escapeHtml(flow)}</div>
    <div class="ttw-script-field"><strong>关键节点：</strong>${nodesHtml}</div>
</div>`;
    }

    function renderCurrentPanel() {
        ensureState();
        const idx = Math.max(0, Math.min(AppState.experience.currentChapterIndex || 0, Math.max(0, AppState.memory.queue.length - 1)));
        AppState.experience.currentChapterIndex = idx;

        const memory = getMemory(idx);
        const titleEl = document.getElementById(selectors.currentTitle);
        const summaryEl = document.getElementById(selectors.currentSummary);
        const scriptEl = document.getElementById(selectors.currentScript);
        const openingEl = document.getElementById(selectors.currentOpening);
        const hintEl = document.getElementById(selectors.chapterHint);
        const nextBtn = document.getElementById(selectors.nextButton);

        if (!memory) {
            if (titleEl) titleEl.textContent = '当前章节概览';
            if (summaryEl) summaryEl.textContent = '暂无章节数据';
            if (scriptEl) scriptEl.innerHTML = '<div class="ttw-script-empty">暂无剧本数据</div>';
            if (openingEl) openingEl.textContent = '暂无开场白';
            if (hintEl) hintEl.textContent = '请先完成TXT处理。';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }

        ensureMemoryRuntime(memory, idx);

        const title = memory.chapterTitle || `第${idx + 1}章`;
        const outline = memory.chapterOutline || deriveOutlineFromContent(memory);
        if (!memory.chapterOutline) {
            memory.chapterOutline = outline;
        }

        if (titleEl) titleEl.textContent = title;
        if (summaryEl) summaryEl.textContent = outline;
        if (scriptEl) scriptEl.innerHTML = buildScriptHtml(memory);

        if (memory.chapterOpeningGenerating) {
            if (openingEl) openingEl.textContent = '正在生成开场白...';
        } else if (memory.chapterOpeningPreview) {
            if (openingEl) openingEl.textContent = memory.chapterOpeningPreview;
        } else if (memory.chapterOpeningError) {
            if (openingEl) openingEl.textContent = `开场白生成失败：${memory.chapterOpeningError}`;
        } else {
            if (openingEl) {
                openingEl.textContent = idx === 0
                    ? '点击“开始阅读第一章”后将自动生成并发送开场白。'
                    : '该章开场白会在你从上一章点击“下一章”进入时生成并发送。';
            }
        }

        const isLast = idx >= AppState.memory.queue.length - 1;
        if (nextBtn) {
            nextBtn.disabled = isLast;
            nextBtn.textContent = isLast ? '⏹ 已是最后一章' : '⏭ 下一章';
        }
        if (hintEl) {
            if (isLast) {
                hintEl.textContent = '当前已到最后一章。';
            } else if (idx === 0) {
                hintEl.textContent = '首章由“开始阅读第一章”触发开场白；后续章节由“下一章”触发。';
            } else {
                hintEl.textContent = '点击“下一章”将进入下一章并自动发送其开场白。';
            }
        }
    }

    function collectRecentDialogueContext() {
        try {
            const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
            if (!st || typeof st.getContext !== 'function') return '';
            const context = st.getContext();
            const chat = Array.isArray(context?.chat) ? context.chat : [];
            if (chat.length === 0) return '';

            let lastUser = null;
            let lastAssistant = null;
            for (let i = chat.length - 1; i >= 0; i--) {
                const item = chat[i];
                const text = String(item?.mes || '').trim();
                if (!text) continue;
                if (!lastUser && item?.is_user) lastUser = text;
                if (!lastAssistant && !item?.is_user) lastAssistant = text;
                if (lastUser && lastAssistant) break;
            }

            if (lastUser && lastAssistant) {
                return `最新一轮对话：\n玩家：${toShortText(lastUser, 260)}\nAI：${toShortText(lastAssistant, 260)}`;
            }
            if (lastUser || lastAssistant) {
                return `最新一轮对话：\n${lastUser ? `玩家：${toShortText(lastUser, 260)}` : ''}\n${lastAssistant ? `AI：${toShortText(lastAssistant, 260)}` : ''}`.trim();
            }
            return '';
        } catch (_) {
            return '';
        }
    }

    function buildPreviousChapterContext(index) {
        if (index <= 0) return '';

        const prevMemory = getMemory(index - 1);
        if (!prevMemory) return '';
        ensureMemoryRuntime(prevMemory, index - 1);

        const prevTitle = prevMemory.chapterTitle || `第${index}章`;
        const prevOutline = prevMemory.chapterOutline || deriveOutlineFromContent(prevMemory);
        const prevScript = prevMemory.chapterScript && typeof prevMemory.chapterScript === 'object'
            ? prevMemory.chapterScript
            : deriveScriptFromOutline(prevOutline);
        const prevNodes = Array.isArray(prevScript.keyNodes)
            ? prevScript.keyNodes.map((node) => toShortText(node, 40)).filter(Boolean).slice(0, 4)
            : [];

        return `上一章：${prevTitle}\n上一章摘要：${toShortText(prevOutline, 160)}\n上一章目标：${toShortText(prevScript.goal, 120)}\n上一章流程：${toShortText(prevScript.flow, 160)}\n上一章关键节点：${prevNodes.join('、') || '无'}`;
    }

    function buildChapterLeadSnippet(memory, minLen = 50, maxLen = 100) {
        const plain = String(memory?.content || '').replace(/\s+/g, ' ').trim();
        if (!plain) return '';

        let snippet = plain.slice(0, maxLen);
        const punctIndex = snippet.search(/[。！？!?]/);
        if (punctIndex >= minLen - 1) {
            snippet = snippet.slice(0, punctIndex + 1);
        }
        if (snippet.length < minLen && plain.length > snippet.length) {
            snippet = plain.slice(0, Math.min(maxLen, Math.max(minLen, plain.length)));
        }
        return snippet.trim();
    }

    function trimOpeningText(text, minLen = 50, maxLen = 100) {
        let normalized = String(text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return '';

        if (normalized.length > maxLen) {
            const sliced = normalized.slice(0, maxLen);
            const boundary = Math.max(
                sliced.lastIndexOf('。'),
                sliced.lastIndexOf('！'),
                sliced.lastIndexOf('？'),
                sliced.lastIndexOf('!'),
                sliced.lastIndexOf('?')
            );
            normalized = boundary >= minLen - 1 ? sliced.slice(0, boundary + 1) : sliced;
        }

        return normalized;
    }

    function buildOpeningFallback(memory, index) {
        const title = memory.chapterTitle || `第${index + 1}章`;
        const leadSnippet = buildChapterLeadSnippet(memory, 50, 100);
        const base = index === 0
            ? `${title}，故事在此刻拉开帷幕，你已站在命运转折的门前。`
            : `${title}，上一程的余波尚在，你的脚步已踏入新的局面。`;
        const fallback = leadSnippet
            ? `${base}${leadSnippet}`
            : `${base}你收拢思绪，准备接住眼前即将展开的变化。`;
        return trimOpeningText(fallback, 50, 100);
    }

    function sanitizeOpeningText(raw, memory, index) {
        const text = trimOpeningText(String(raw || '')
            .replace(/^```[a-z]*\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim(), 50, 100);
        if (!text) {
            return buildOpeningFallback(memory, index);
        }
        return text;
    }

    async function generateOpeningText(memory, index) {
        const chapterTitle = memory.chapterTitle || `第${index + 1}章`;
        const previousChapterContext = buildPreviousChapterContext(index) || '上一章信息：无（当前为第一章）';
        const dialogueContext = collectRecentDialogueContext() || '最新一轮对话：无可用历史。';
        const chapterLead = buildChapterLeadSnippet(memory, 50, 100) || '本章开头素材：无可用原文。';

        const prompt = `${getLanguagePrefix()}你是互动小说旁白。请生成“承上启下型开场白”。\n\n硬性要求：\n1) 仅输出 50-100 字中文。\n2) 只能用于衔接上文并引入本章，不要推进剧情。\n3) 不得泄露本章的目标、流程、关键节点、核心冲突、转折或结局。\n4) 文风自然沉浸，不要解释规则，不要输出JSON，不要分点。\n\n背景信息（仅用于衔接）：\n当前章节：${chapterTitle}\n${previousChapterContext}\n${dialogueContext}\n本章开头素材（仅前50-100字）：${chapterLead}\n\n请直接输出开场白正文：`;

        const response = await callAPI(prompt, index + 1);
        return sanitizeOpeningText(response, memory, index);
    }

    async function pushOpeningMessage(text, index) {
        const st = typeof SillyTavern !== 'undefined' ? SillyTavern : null;
        if (!st || typeof st.getContext !== 'function') {
            throw new Error('无法访问SillyTavern上下文');
        }

        const context = st.getContext();
        if (!context || !Array.isArray(context.chat)) {
            throw new Error('当前聊天上下文不可用');
        }

        const openingMessage = {
            is_user: false,
            mes: text,
            _storyweaver_auto_opening: true,
            _storyweaver_chapter: index + 1,
            _generatedAt: Date.now(),
        };

        if (typeof context.addOneMessage === 'function') {
            await context.addOneMessage(openingMessage);
            return;
        }

        context.chat.push(openingMessage);

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }
        if (typeof context.reloadCurrentChat === 'function') {
            await context.reloadCurrentChat();
        } else if (typeof context.renderChat === 'function') {
            context.renderChat();
        }
    }

    async function ensureOpeningForChapter(index) {
        const memory = getMemory(index);
        if (!memory) return;
        ensureMemoryRuntime(memory, index);
        if (memory.chapterOpeningSent || memory.chapterOpeningGenerating) {
            return;
        }

        memory.chapterOpeningGenerating = true;
        memory.chapterOpeningError = '';
        renderCurrentPanel();

        try {
            const opening = await generateOpeningText(memory, index);
            memory.chapterOpeningPreview = opening;

            try {
                await pushOpeningMessage(opening, index);
                memory.chapterOpeningSent = true;
            } catch (sendError) {
                memory.chapterOpeningSent = false;
                memory.chapterOpeningError = String(sendError?.message || '发送失败');
                ErrorHandler.showUserError(`开场白发送失败：${memory.chapterOpeningError}`);
            }
        } catch (error) {
            const fallback = buildOpeningFallback(memory, index);
            memory.chapterOpeningPreview = fallback;
            try {
                await pushOpeningMessage(fallback, index);
                memory.chapterOpeningSent = true;
                memory.chapterOpeningError = '开场白生成失败，已使用安全降级文案发送。';
            } catch (sendError) {
                memory.chapterOpeningSent = false;
                memory.chapterOpeningError = String(sendError?.message || error?.message || '开场白生成失败');
                ErrorHandler.showUserError(`开场白生成失败：${memory.chapterOpeningError}`);
            }
        } finally {
            memory.chapterOpeningGenerating = false;
            renderCurrentPanel();
        }
    }

    async function enterChapter(index, options = {}) {
        const { triggerOpening = true } = options;
        if (index < 0 || index >= AppState.memory.queue.length) return;
        ensureState();
        AppState.experience.currentChapterIndex = index;
        renderCurrentPanel();
        if (triggerOpening) {
            await ensureOpeningForChapter(index);
        }
    }

    async function showCurrentChapterPanelInternal() {
        setModeTabActive('current');
        setTxtSectionsVisible(false);
        setResultSectionVisibleForMode('current');
        setSectionVisibility({ showOutline: false, showCurrent: true, showProgress: false });
        renderCurrentPanel();
    }

    function showStoryOutlinePanelInternal() {
        setModeTabActive('outline');
        setTxtSectionsVisible(false);
        setResultSectionVisibleForMode('outline');
        setSectionVisibility({ showOutline: true, showCurrent: false, showProgress: false });
        renderOutlineList();
    }

    function showProgressPanelInternal() {
        setModeTabActive('progress');
        setTxtSectionsVisible(false);
        setResultSectionVisibleForMode('progress');
        setSectionVisibility({ showOutline: false, showCurrent: false, showProgress: true });
    }

    function showTxtConverterPanel() {
        setModeTabActive('txt');
        setTxtSectionsVisible(true);
        setResultSectionVisibleForMode('txt');
        setSectionVisibility({ showOutline: false, showCurrent: false, showProgress: false });
    }

    async function handleOutlineAction(action, index) {
        if (action === 'toggle') {
            const body = document.getElementById(`ttw-outline-body-${index}`);
            if (body) {
                body.style.display = body.style.display === 'none' ? 'block' : 'none';
            }
            return;
        }

        if (action === 'retry-outline' || action === 'reroll-chapter-assets') {
            try {
                await retryChapterOutline(index);
                const memory = getMemory(index);
                if (memory) {
                    ensureMemoryRuntime(memory, index);
                    memory.chapterOpeningPreview = '';
                    memory.chapterOpeningSent = false;
                    memory.chapterOpeningError = '';
                    memory.chapterOpeningGenerating = false;
                }
                ErrorHandler.showUserSuccess(`第${index + 1}章重roll成功（摘要/小剧本/开场白已重置）`);
            } catch (error) {
                ErrorHandler.showUserError(`第${index + 1}章重roll失败：${error.message}`);
            }
            renderOutlineList();
            renderCurrentPanel();
            return;
        }

        if (action === 'view-chapter') {
            await enterChapter(index, { triggerOpening: false });
            await showCurrentChapterPanelInternal();
            return;
        }
    }

    function bindOutlineEvents() {
        const listEl = document.getElementById(selectors.outlineList);
        if (listEl && !listEl.dataset.bound) {
            listEl.dataset.bound = '1';
            listEl.addEventListener('click', async (event) => {
                const target = event.target.closest('[data-action]');
                if (!target) return;
                const action = target.getAttribute('data-action');
                const index = parseInt(target.getAttribute('data-index') || '-1', 10);
                if (Number.isNaN(index) || index < 0) return;
                await handleOutlineAction(action, index);
            });
        }

        const startBtn = document.getElementById(selectors.startFirstButton);
        if (startBtn && !startBtn.dataset.bound) {
            startBtn.dataset.bound = '1';
            startBtn.addEventListener('click', async () => {
                await enterChapter(0);
                await showCurrentChapterPanelInternal();
            });
        }
    }

    function bindViewModeEvents() {
        const nav = document.getElementById(selectors.viewTabs);
        if (!nav || nav.dataset.bound) return;

        nav.dataset.bound = '1';
        nav.addEventListener('click', async (event) => {
            const btn = event.target.closest('.ttw-view-tab[data-view]');
            if (!btn) return;

            const view = btn.getAttribute('data-view');
            if (view === 'txt') {
                showTxtConverterPanel();
                return;
            }
            if (view === 'outline') {
                showStoryOutlinePanelInternal();
                return;
            }
            if (view === 'current') {
                await showCurrentChapterPanelInternal();
                return;
            }
            if (view === 'progress') {
                showProgressPanelInternal();
            }
        });
    }

    function bindCurrentEvents() {
        const nextBtn = document.getElementById(selectors.nextButton);
        if (nextBtn && !nextBtn.dataset.bound) {
            nextBtn.dataset.bound = '1';
            nextBtn.addEventListener('click', async () => {
                ensureState();
                const nextIndex = (AppState.experience.currentChapterIndex || 0) + 1;
                if (nextIndex >= AppState.memory.queue.length) {
                    ErrorHandler.showUserError('已是最后一章');
                    return;
                }
                await enterChapter(nextIndex);
            });
        }
    }

    function preparePanels() {
        bindViewModeEvents();
        bindOutlineEvents();
        bindCurrentEvents();
    }

    return {
        showTxtConverterPanel: () => {
            preparePanels();
            showTxtConverterPanel();
        },
        showStoryOutlinePanel: () => {
            preparePanels();
            showStoryOutlinePanelInternal();
        },
        showCurrentChapterPanel: async () => {
            preparePanels();
            await showCurrentChapterPanelInternal();
        },
        showProgressPanel: () => {
            preparePanels();
            showProgressPanelInternal();
        },
        renderStoryOutline: () => {
            preparePanels();
            renderOutlineList();
        },
        renderCurrentChapter: () => {
            preparePanels();
            renderCurrentPanel();
        },
    };
}
