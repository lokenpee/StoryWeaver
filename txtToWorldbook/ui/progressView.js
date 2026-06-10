export function createProgressView(deps = {}) {
    const {
        AppState,
    } = deps;

    function isTxtViewActive() {
        const activeFromState = String(AppState?.ui?.lastModalView || AppState?.settings?.lastModalView || '').trim().toLowerCase();
        if (activeFromState) return activeFromState === 'txt';
        const txtTab = document.getElementById('ttw-view-mode-txt');
        return !txtTab || txtTab.classList.contains('active');
    }

    function showQueueSection(show) {
        const queueSection = document.getElementById('ttw-queue-section');
        if (!queueSection) return;
        queueSection.dataset.ttwDesiredDisplay = show ? 'block' : 'none';
        queueSection.style.display = show && isTxtViewActive() ? 'block' : 'none';
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
