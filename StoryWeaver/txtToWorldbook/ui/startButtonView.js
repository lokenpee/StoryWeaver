export function createStartButtonView(deps = {}) {
    const {
        AppState,
    } = deps;

    function updateStartButtonState(isProcessing) {
        const startBtn = document.getElementById('ttw-start-btn');
        if (!startBtn) return;

        if (!isProcessing && AppState.processing.activeTasks.size > 0) {
            return;
        }

        if (isProcessing) {
            startBtn.disabled = true;
            startBtn.textContent = '转换中...';
            return;
        }

        startBtn.disabled = false;
        if (AppState.memory.userSelectedIndex !== null) {
            startBtn.textContent = `▶️ 从第${AppState.memory.userSelectedIndex + 1}章开始`;
            AppState.memory.startIndex = AppState.memory.userSelectedIndex;
            return;
        }

        const firstUnprocessed = AppState.memory.queue.findIndex((memory) => !memory.processed || memory.failed);
        const hasProcessedMemories = AppState.memory.queue.some((memory) => memory.processed && !memory.failed);
        if (hasProcessedMemories && firstUnprocessed !== -1 && firstUnprocessed < AppState.memory.queue.length) {
            startBtn.textContent = `▶️ 继续转换 (从第${firstUnprocessed + 1}章)`;
            AppState.memory.startIndex = firstUnprocessed;
        } else if (AppState.memory.queue.length > 0 && AppState.memory.queue.every((memory) => memory.processed && !memory.failed)) {
            startBtn.textContent = '🚀 重新转换';
            AppState.memory.startIndex = 0;
        } else {
            startBtn.textContent = '🚀 开始转换';
            AppState.memory.startIndex = 0;
        }
    }

    return {
        updateStartButtonState,
    };
}
