export function createStopButtonView() {
    function updateStopButtonVisibility(show) {
        const stopBtn = document.getElementById('ttw-stop-btn');
        if (!stopBtn) return;
        stopBtn.style.display = 'inline-block';
        stopBtn.disabled = !show;
    }

    return {
        updateStopButtonVisibility,
    };
}
