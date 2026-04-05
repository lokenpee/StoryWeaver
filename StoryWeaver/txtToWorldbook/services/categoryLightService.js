export function createCategoryLightService(deps) {
    const {
        AppState,
        storageKey = 'storyweaverTxtToWorldbookSettings',
    } = deps;

    function saveCategoryLightSettings() {
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        try {
            localStorage.setItem(storageKey, JSON.stringify(AppState.settings));
        } catch (e) { }
    }

    function loadCategoryLightSettings() {
        if (AppState.settings.categoryLightSettings) {
            AppState.config.categoryLight = {
                ...AppState.config.categoryLight,
                ...AppState.settings.categoryLightSettings,
            };
        }
    }

    return {
        saveCategoryLightSettings,
        loadCategoryLightSettings,
    };
}
