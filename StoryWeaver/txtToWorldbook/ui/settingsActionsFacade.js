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

    function handleProviderChange() {
        if (!apiModeView) return;
        apiModeView.handleProviderChange();
    }

    function updateModelStatus(text, type) {
        if (!modelActionsView) return;
        modelActionsView.updateModelStatus(text, type);
    }

    async function handleFetchModels() {
        if (!modelActionsView) return;
        return modelActionsView.handleFetchModels();
    }

    async function handleQuickTest() {
        if (!modelActionsView) return;
        return modelActionsView.handleQuickTest();
    }

    function showPromptPreview() {
        if (!promptPreviewModal) return;
        promptPreviewModal.showPromptPreview();
    }

    return {
        handleUseTavernApiChange,
        handleProviderChange,
        updateModelStatus,
        handleFetchModels,
        handleQuickTest,
        showPromptPreview,
    };
}
