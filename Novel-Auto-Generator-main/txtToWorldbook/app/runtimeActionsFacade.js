export function createRuntimeActionsFacade(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        saveCurrentSettings,
        handleStartProcessing,
        replaceAndCleanService,
        entryConfigModals,
    } = deps;

    function showCleanTagsModal() {
        if (!replaceAndCleanService) return;
        replaceAndCleanService.showCleanTagsModal();
    }

    function showEntryConfigModal(category, entryName) {
        if (!entryConfigModals) return;
        entryConfigModals.showEntryConfigModal(category, entryName);
    }

    function showPlotOutlineConfigModal() {
        if (!entryConfigModals) return;
        entryConfigModals.showPlotOutlineConfigModal();
    }

    function showCategoryConfigModal(category) {
        if (!entryConfigModals) return;
        entryConfigModals.showCategoryConfigModal(category);
    }

    async function handleStartConversion() {
        saveCurrentSettings();

        if (AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError('请先上传文件');
            return;
        }

        if (!AppState.settings.useTavernApi) {
            const provider = AppState.settings.customApiProvider;
            if ((provider === 'gemini' || provider === 'anthropic') && !AppState.settings.customApiKey) {
                ErrorHandler.showUserError('请先设置 API Key');
                return;
            }
        }

        await handleStartProcessing();
    }

    return {
        showCleanTagsModal,
        showEntryConfigModal,
        showPlotOutlineConfigModal,
        showCategoryConfigModal,
        handleStartConversion,
    };
}
