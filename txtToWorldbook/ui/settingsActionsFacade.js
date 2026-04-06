export function createSettingsActionsFacade(deps = {}) {
    const {
        apiModeView,
        modelActionsView,
        promptPreviewModal,
    } = deps;

    function handleUseTavernApiChange() {
        if (!apiModeView) return;
        apiModeView.handleUseTavernApiChange();
    }

    function handleProviderChange(target = 'main') {
        if (!apiModeView) return;
        apiModeView.handleProviderChange(target);
    }

    function switchApiTab(target = 'main') {
        if (!apiModeView || typeof apiModeView.switchApiTab !== 'function') return;
        apiModeView.switchApiTab(target);
    }

    function updateModelStatus(text, type, target = 'main') {
        if (!modelActionsView) return;
        modelActionsView.updateModelStatus(text, type, target);
    }

    async function handleFetchModels(target = 'main') {
        if (!modelActionsView) return;
        return modelActionsView.handleFetchModels(target);
    }

    async function handleQuickTest(target = 'main') {
        if (!modelActionsView) return;
        return modelActionsView.handleQuickTest(target);
    }

    function showPromptPreview() {
        if (!promptPreviewModal) return;
        promptPreviewModal.showPromptPreview();
    }

    return {
        handleUseTavernApiChange,
        handleProviderChange,
        switchApiTab,
        updateModelStatus,
        handleFetchModels,
        handleQuickTest,
        showPromptPreview,
    };
}
