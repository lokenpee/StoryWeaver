export function createModalController(deps) {
    const {
        AppState,
        setProcessingStatus,
        getGlobalSemaphore,
        getModalContainer,
        setModalContainer,
        removeEscListener,
        buildModalHtml,
        initializeModalState,
        restoreModalData,
        restoreExistingState,
        checkAndRestoreState,
        saveStateSnapshot,
        onRestoreStateError,
    } = deps;

    let exitPersistenceBound = false;
    let exitPersistenceHandler = null;
    const MODAL_SCROLL_STORAGE_KEY = 'westworldTxtToWorldbookModalScrollState';
    const SCROLL_STATE_VERSION = 2;
    const SCROLLABLE_SELECTORS = [
        '.ttw-modal-body',
        '#ttw-memory-queue',
        '#ttw-result-preview',
        '#ttw-stream-content',
        '#ttw-default-entries-list',
    ];
    let scrollSyncBound = false;
    let scrollSyncHandler = null;

    function getClampedScrollTop(element, desiredTop) {
        if (!element) return 0;
        const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
        const top = Number.isFinite(Number(desiredTop)) ? Number(desiredTop) : 0;
        return Math.max(0, Math.min(top, maxTop));
    }

    function collectScrollableState(container) {
        const root = container || getModalContainer();
        const entries = {};
        if (!root) return entries;

        SCROLLABLE_SELECTORS.forEach((selector) => {
            const node = root.querySelector(selector);
            if (!node) return;
            const top = Number(node.scrollTop || 0);
            if (top > 0) {
                entries[selector] = Math.round(top);
            }
        });

        return entries;
    }

    function applyScrollableState(stateMap = {}) {
        const container = getModalContainer();
        if (!container || !stateMap || typeof stateMap !== 'object') return;

        Object.entries(stateMap).forEach(([selector, top]) => {
            if (!SCROLLABLE_SELECTORS.includes(selector)) return;
            const node = container.querySelector(selector);
            if (!node) return;
            node.scrollTop = getClampedScrollTop(node, top);
        });
    }

    function getModalScrollContainer() {
        const container = getModalContainer();
        if (!container) return null;
        return container.querySelector('.ttw-modal-body');
    }

    function readSavedScrollTop() {
        if (Number.isFinite(Number(AppState?.ui?.lastModalScrollTop))) {
            return Math.max(0, Number(AppState.ui.lastModalScrollTop));
        }

        try {
            const raw = localStorage.getItem(MODAL_SCROLL_STORAGE_KEY);
            if (!raw) return 0;
            const parsed = JSON.parse(raw);
            const top = Number(parsed?.top);
            return Number.isFinite(top) ? Math.max(0, top) : 0;
        } catch (_) {
            return 0;
        }
    }

    function readSavedScrollState() {
        if (AppState?.ui?.lastModalScrollState && typeof AppState.ui.lastModalScrollState === 'object') {
            return { ...AppState.ui.lastModalScrollState };
        }

        try {
            const raw = localStorage.getItem(MODAL_SCROLL_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.scrollBySelector === 'object') {
                return { ...parsed.scrollBySelector };
            }
            return {};
        } catch (_) {
            return {};
        }
    }

    function syncScrollStateFromDom() {
        const container = getModalContainer();
        if (!container) return;

        const scrollBySelector = collectScrollableState(container);
        const modalBodyTop = Number(scrollBySelector['.ttw-modal-body'] || 0);

        if (!AppState.ui || typeof AppState.ui !== 'object') {
            AppState.ui = {};
        }
        AppState.ui.lastModalScrollTop = modalBodyTop;
        AppState.ui.lastModalScrollState = { ...scrollBySelector };
    }

    function ensureScrollSyncBinding() {
        if (scrollSyncBound) return;
        const container = getModalContainer();
        if (!container) return;

        scrollSyncHandler = () => {
            syncScrollStateFromDom();
        };

        container.addEventListener('scroll', scrollSyncHandler, { capture: true, passive: true });
        scrollSyncBound = true;
    }

    function removeScrollSyncBinding() {
        if (!scrollSyncBound) return;
        const container = getModalContainer();
        if (container && scrollSyncHandler) {
            container.removeEventListener('scroll', scrollSyncHandler, { capture: true });
        }
        scrollSyncBound = false;
        scrollSyncHandler = null;
    }

    function saveModalScrollPosition() {
        syncScrollStateFromDom();

        const top = Math.max(0, Number(AppState?.ui?.lastModalScrollTop || 0));
        const scrollBySelector = AppState?.ui?.lastModalScrollState && typeof AppState.ui.lastModalScrollState === 'object'
            ? { ...AppState.ui.lastModalScrollState }
            : {};

        if (!AppState.ui || typeof AppState.ui !== 'object') {
            AppState.ui = {};
        }
        AppState.ui.lastModalScrollTop = top;
        AppState.ui.lastModalScrollState = { ...scrollBySelector };

        try {
            localStorage.setItem(MODAL_SCROLL_STORAGE_KEY, JSON.stringify({
                v: SCROLL_STATE_VERSION,
                top,
                scrollBySelector,
                at: Date.now(),
            }));
        } catch (_) {
            // ignore localStorage write errors
        }
    }

    function restoreModalScrollPosition() {
        const savedTop = readSavedScrollTop();
        const savedState = readSavedScrollState();
        const hasModalTop = Number.isFinite(savedTop) && savedTop > 0;
        const hasState = savedState && Object.keys(savedState).length > 0;
        if (!hasModalTop && !hasState) return;

        const apply = () => {
            if (hasState) {
                applyScrollableState(savedState);
            }

            if (hasModalTop) {
                const scrollContainer = getModalScrollContainer();
                if (!scrollContainer) return;
                scrollContainer.scrollTop = getClampedScrollTop(scrollContainer, savedTop);
            }
        };

        // 重复应用以覆盖异步内容渲染导致的滚动重置。
        apply();
        requestAnimationFrame(apply);
        requestAnimationFrame(() => requestAnimationFrame(apply));
        setTimeout(apply, 120);
        setTimeout(apply, 320);
        setTimeout(apply, 700);
    }

    function persistSnapshotOnExit() {
        saveModalScrollPosition();
        if (typeof saveStateSnapshot !== 'function') return;
        Promise.resolve(saveStateSnapshot()).catch(onRestoreStateError);
    }

    function ensureExitPersistenceBinding() {
        if (exitPersistenceBound) return;
        exitPersistenceHandler = () => persistSnapshotOnExit();
        window.addEventListener('pagehide', exitPersistenceHandler);
        window.addEventListener('beforeunload', exitPersistenceHandler);
        exitPersistenceBound = true;
    }

    async function createModal() {
        const previousContainer = getModalContainer();
        if (previousContainer) previousContainer.remove();

        const modalContainer = document.createElement('div');
        modalContainer.id = 'txt-to-worldbook-modal';
        modalContainer.className = 'ttw-modal-container';
        modalContainer.innerHTML = buildModalHtml();
        document.body.appendChild(modalContainer);
        setModalContainer(modalContainer);

        initializeModalState();
        restoreModalData();
        await restoreExistingState().catch(onRestoreStateError);

        // Auto-restore persisted snapshot for page refresh/browser reopen scenarios.
        if (AppState.memory.queue.length <= 0 && typeof checkAndRestoreState === 'function') {
            await checkAndRestoreState({ autoRestore: true }).catch(onRestoreStateError);
        }

        ensureScrollSyncBinding();
        restoreModalScrollPosition();

        ensureExitPersistenceBinding();
    }

    function handleEscKey(e) {
        if (e.key !== 'Escape') return;

        // 误触保护：ESC只关闭子模态框（世界书预览、历史记录等），不关闭主UI
        const subModals = document.querySelectorAll('.ttw-modal-container:not(#txt-to-worldbook-modal)');
        if (subModals.length <= 0) return;

        const topModal = subModals[subModals.length - 1];
        if (topModal?.dataset?.ttwAllowGlobalEscClose === 'false') {
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        e.stopPropagation();
        e.preventDefault();
        topModal.remove(); // 关闭最顶层的子模态框
        // 主模态框不响应ESC，只能通过右上角关闭按钮退出
    }

    function closeModal() {
        persistSnapshotOnExit();
        removeScrollSyncBinding();
        setProcessingStatus('stopped');

        const globalSemaphore = getGlobalSemaphore();
        if (globalSemaphore) globalSemaphore.abort();

        AppState.processing.activeTasks.clear();
        AppState.memory.queue.forEach(memory => {
            if (memory.processing) memory.processing = false;
        });

        const modalContainer = getModalContainer();
        if (modalContainer) {
            modalContainer.remove();
            setModalContainer(null);
        }

        removeEscListener(handleEscKey);
    }

    function open() {
        createModal();
    }

    return {
        createModal,
        handleEscKey,
        closeModal,
        open,
    };
}
