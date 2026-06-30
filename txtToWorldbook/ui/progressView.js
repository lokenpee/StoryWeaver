export function createProgressView(deps = {}) {
    const {
        AppState,
    } = deps;

    const LAST_MODAL_VIEW_STORAGE_KEY = 'westworldTxtToWorldbookLastModalView';
    const NON_TXT_VIEWS = new Set(['outline', 'current', 'progress', 'settings', 'prompt-editor', 'director-debug']);

    function getPersistedViewMode() {
        const fromUi = String(AppState?.ui?.lastModalView || '').trim().toLowerCase();
        if (NON_TXT_VIEWS.has(fromUi)) return fromUi;

        const fromSettings = String(AppState?.settings?.lastModalView || '').trim().toLowerCase();
        if (NON_TXT_VIEWS.has(fromSettings)) return fromSettings;

        try {
            const fromStorage = String(localStorage.getItem(LAST_MODAL_VIEW_STORAGE_KEY) || '').trim().toLowerCase();
            if (NON_TXT_VIEWS.has(fromStorage)) return fromStorage;
        } catch (_) {
            // ignore localStorage read errors
        }

        return '';
    }

    function showQueueSection(show) {
        const el = document.getElementById('ttw-queue-section');
        if (!el) return;

        const activeTab = document.querySelector('.ttw-view-tab.active[data-view]');
        const activeView = activeTab?.getAttribute('data-view') || 'txt';
        const persistedView = getPersistedViewMode();
        const hiddenByNonTxtMode = (el.dataset.swHiddenByMode === '1' && activeView !== 'txt')
            || (!activeTab && persistedView)
            || (activeView === 'txt' && persistedView && !el.dataset.swHiddenByMode);

        if (show && hiddenByNonTxtMode) {
            el.dataset.swHiddenByMode = '1';
            el.dataset.swPrevDisplayMode = 'block';
            el.style.display = 'none';
            return;
        }

        el.style.display = show ? 'block' : 'none';
        if (show && el.dataset.swHiddenByMode === '1') {
            el.dataset.swPrevDisplayMode = 'block';
        }
    }

    function showProgressSection(show) {
        document.getElementById('ttw-progress-section').style.display = show ? 'block' : 'none';
    }

    function showResultSection(show) {
        document.getElementById('ttw-result-section').style.display = show ? 'block' : 'none';
        const volumeExportBtn = document.getElementById('ttw-export-volumes');
        if (volumeExportBtn) {
            volumeExportBtn.style.display = (show && AppState.processing.volumeMode && AppState.worldbook.volumes.length > 0)
                ? 'inline-block'
                : 'none';
        }
    }

    function updateProgress(percent, text) {
        document.getElementById('ttw-progress-fill').style.width = `${percent}%`;

        const worldbookCompleted = AppState.memory.queue.filter((memory) => {
            const status = String(memory?.worldbookStatus || '').trim().toLowerCase();
            return status === 'done' || status === 'failed';
        }).length;
        const directorCompleted = AppState.memory.queue.filter((memory) => {
            const status = String(memory?.directorStatus || memory?.chapterOutlineStatus || '').trim().toLowerCase();
            return status === 'done' || status === 'failed';
        }).length;
        const total = AppState.memory.queue.length;
        const suffix = total > 0
            ? ` | 世界书 ${worldbookCompleted}/${total} | 导演 ${directorCompleted}/${total}`
            : '';
        document.getElementById('ttw-progress-text').textContent = `${text}${suffix}`;

        const failedCount = AppState.memory.queue.filter((m) => {
            const status = String(m?.worldbookStatus || '').trim().toLowerCase();
            return status === 'failed';
        }).length;
        const repairBtn = document.getElementById('ttw-repair-btn');
        if (failedCount > 0) {
            repairBtn.style.display = 'inline-block';
            repairBtn.textContent = `🔧 修复世界书失败 (${failedCount})`;
        } else {
            repairBtn.style.display = 'none';
        }
    }

    return {
        showQueueSection,
        showProgressSection,
        showResultSection,
        updateProgress,
    };
}
