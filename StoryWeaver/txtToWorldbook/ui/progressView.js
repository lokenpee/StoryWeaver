export function createProgressView(deps = {}) {
    const {
        AppState,
    } = deps;

    function showQueueSection(show) {
        document.getElementById('ttw-queue-section').style.display = show ? 'block' : 'none';
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
        document.getElementById('ttw-progress-text').textContent = text;

        const failedCount = AppState.memory.queue.filter((m) => m.failed).length;
        const repairBtn = document.getElementById('ttw-repair-btn');
        if (failedCount > 0) {
            repairBtn.style.display = 'inline-block';
            repairBtn.textContent = `🔧 修复失败 (${failedCount})`;
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
