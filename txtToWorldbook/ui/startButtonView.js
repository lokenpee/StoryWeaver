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

        const worldbookStatus = (memory) => {
            const status = String(memory?.worldbookStatus || '').trim().toLowerCase();
            return status || 'pending';
        };
        const directorStatus = (memory) => {
            const status = String(memory?.directorStatus || '').trim().toLowerCase();
            if (status) return status;
            const outlineStatus = String(memory?.chapterOutlineStatus || '').trim().toLowerCase();
            if (outlineStatus) return outlineStatus;
            return 'pending';
        };

        const firstWorldbookPending = AppState.memory.queue.findIndex((memory) => {
            const status = worldbookStatus(memory);
            return status !== 'done';
        });
        const firstDirectorPending = AppState.memory.queue.findIndex((memory) => {
            const status = directorStatus(memory);
            return status !== 'done' && status !== 'failed';
        });

        const hasProcessedMemories = AppState.memory.queue.some((memory) => worldbookStatus(memory) === 'done');
        if (hasProcessedMemories && firstWorldbookPending !== -1 && firstWorldbookPending < AppState.memory.queue.length) {
            const directorLabel = firstDirectorPending === -1 ? '导演已完成' : `导演第${firstDirectorPending + 1}章`;
            startBtn.textContent = `▶️ 继续转换 (世界书第${firstWorldbookPending + 1}章 / ${directorLabel})`;
            AppState.memory.startIndex = firstWorldbookPending;
        } else if (
            AppState.memory.queue.length > 0
            && AppState.memory.queue.every((memory) => worldbookStatus(memory) === 'done')
            && AppState.memory.queue.every((memory) => {
                const status = directorStatus(memory);
                return status === 'done' || status === 'failed';
            })
        ) {
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
