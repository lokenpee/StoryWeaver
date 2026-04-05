export function createModalLifecycle(deps) {
    const {
        addModalStyles,
        bindModalEvents,
        loadSavedSettings,
        loadCategoryLightSettings,
        loadCustomCategories,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        checkAndRestoreState,
    } = deps;

    function initializeModalState() {
        addModalStyles();
        bindModalEvents();
        loadSavedSettings();
        loadCategoryLightSettings();
    }

    function restoreModalData() {
        loadCustomCategories().then(() => {
            renderCategoriesList();
            renderDefaultWorldbookEntriesUI();
        });
        checkAndRestoreState();
    }

    return {
        initializeModalState,
        restoreModalData,
    };
}
