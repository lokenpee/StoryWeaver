export function createSettingsPersistenceService(deps) {
    const {
        AppState,
        defaultSettings,
        updateSettingsUI,
        updateChapterRegexUI,
        handleProviderChange,
    } = deps;

    function readApiConfigFromDom(target) {
        const suffix = target === 'director' ? 'director' : 'main';
        const provider = document.getElementById(`ttw-api-provider-${suffix}`)?.value
            || document.getElementById('ttw-api-provider')?.value
            || 'openai-compatible';
        const apiKey = document.getElementById(`ttw-api-key-${suffix}`)?.value
            || (suffix === 'main' ? document.getElementById('ttw-api-key')?.value : '')
            || '';
        const endpoint = document.getElementById(`ttw-api-endpoint-${suffix}`)?.value
            || (suffix === 'main' ? document.getElementById('ttw-api-endpoint')?.value : '')
            || '';
        const model = document.getElementById(`ttw-api-model-${suffix}`)?.value
            || (suffix === 'main' ? document.getElementById('ttw-api-model')?.value : '')
            || 'gemini-2.5-flash';
        const maxTokensRaw = parseInt(
            document.getElementById(`ttw-api-max-tokens-${suffix}`)?.value
                || (suffix === 'main' ? document.getElementById('ttw-api-max-tokens')?.value : ''),
            10
        );
        const maxTokens = Number.isFinite(maxTokensRaw) ? Math.max(1, Math.min(8192, maxTokensRaw)) : 2048;

        return { provider, apiKey, endpoint, model, maxTokens };
    }

    function normalizeApiConfig(raw, fallback = {}) {
        const base = {
            provider: 'openai-compatible',
            apiKey: '',
            endpoint: '',
            model: 'gemini-2.5-flash',
            maxTokens: 2048,
            ...fallback,
            ...(raw || {}),
        };
        const parsedMax = parseInt(base.maxTokens, 10);
        base.maxTokens = Number.isFinite(parsedMax) ? Math.max(1, Math.min(8192, parsedMax)) : 2048;
        return base;
    }

    function saveCurrentSettings() {
        AppState.settings.chunkSize = parseInt(document.getElementById('ttw-chunk-size')?.value) || 8000;
        AppState.settings.apiTimeout = (parseInt(document.getElementById('ttw-api-timeout')?.value) || 120) * 1000;
        AppState.processing.incrementalMode = document.getElementById('ttw-incremental-mode')?.checked ?? true;
        AppState.processing.volumeMode = document.getElementById('ttw-volume-mode')?.checked ?? false;
        AppState.settings.useVolumeMode = AppState.processing.volumeMode;
        AppState.settings.enablePlotOutline = document.getElementById('ttw-enable-plot')?.checked ?? false;
        AppState.settings.enableLiteraryStyle = document.getElementById('ttw-enable-style')?.checked ?? false;
        AppState.settings.customWorldbookPrompt = document.getElementById('ttw-worldbook-prompt')?.value || '';
        AppState.settings.customPlotPrompt = document.getElementById('ttw-plot-prompt')?.value || '';
        AppState.settings.customStylePrompt = document.getElementById('ttw-style-prompt')?.value || '';
        AppState.settings.useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        AppState.settings.parallelEnabled = AppState.config.parallel.enabled;
        AppState.settings.parallelConcurrency = AppState.config.parallel.concurrency;
        AppState.settings.parallelMode = AppState.config.parallel.mode;
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        AppState.settings.forceChapterMarker = document.getElementById('ttw-force-chapter-marker')?.checked ?? true;
        AppState.settings.chapterRegexPattern = document.getElementById('ttw-chapter-regex')?.value || AppState.config.chapterRegex.pattern;
        AppState.settings.defaultWorldbookEntriesUI = AppState.persistent.defaultEntries;
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;
        AppState.settings.customSuffixPrompt = document.getElementById('ttw-suffix-prompt')?.value || '';
        const mainApi = readApiConfigFromDom('main');
        const directorApi = readApiConfigFromDom('director');

        const mainModelSelectContainer = document.getElementById('ttw-model-select-container-main');
        const mainModelSelect = document.getElementById('ttw-model-select-main');
        const mainModelInput = document.getElementById('ttw-api-model-main') || document.getElementById('ttw-api-model');
        if (mainModelSelectContainer && mainModelSelectContainer.style.display !== 'none' && mainModelSelect?.value) {
            mainApi.model = mainModelSelect.value;
            if (mainModelInput) mainModelInput.value = mainModelSelect.value;
        }

        const directorModelSelectContainer = document.getElementById('ttw-model-select-container-director');
        const directorModelSelect = document.getElementById('ttw-model-select-director');
        const directorModelInput = document.getElementById('ttw-api-model-director');
        if (directorModelSelectContainer && directorModelSelectContainer.style.display !== 'none' && directorModelSelect?.value) {
            directorApi.model = directorModelSelect.value;
            if (directorModelInput) directorModelInput.value = directorModelSelect.value;
        }

        AppState.settings.mainApi = normalizeApiConfig(mainApi, AppState.settings.mainApi);
        AppState.settings.directorApi = normalizeApiConfig(directorApi, AppState.settings.directorApi);
        AppState.settings.directorEnabled = document.getElementById('ttw-director-enabled')?.checked ?? AppState.settings.directorEnabled ?? true;
        AppState.settings.directorAutoFallbackToMain = document.getElementById('ttw-director-fallback-main')?.checked ?? AppState.settings.directorAutoFallbackToMain ?? true;
        AppState.settings.directorRunEveryTurn = document.getElementById('ttw-director-run-every-turn')?.checked ?? AppState.settings.directorRunEveryTurn ?? true;

        // Backward compatibility mirror fields
        AppState.settings.customApiProvider = AppState.settings.mainApi.provider;
        AppState.settings.customApiKey = AppState.settings.mainApi.apiKey;
        AppState.settings.customApiEndpoint = AppState.settings.mainApi.endpoint;
        AppState.settings.customApiModel = AppState.settings.mainApi.model;
        AppState.settings.customApiMaxTokens = AppState.settings.mainApi.maxTokens;

        try {
            localStorage.setItem('storyweaverTxtToWorldbookSettings', JSON.stringify(AppState.settings));
        } catch (e) { }

        AppState.settings.allowRecursion = document.getElementById('ttw-allow-recursion')?.checked ?? false;
        AppState.settings.filterResponseTags = document.getElementById('ttw-filter-tags')?.value || 'thinking,/think';
        AppState.settings.debugMode = document.getElementById('ttw-debug-mode')?.checked ?? false;
        AppState.settings.plotOutlineExportConfig = AppState.config.plotOutline;
    }

    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem('storyweaverTxtToWorldbookSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                AppState.settings = { ...defaultSettings, ...parsed };

                const migratedMainApi = normalizeApiConfig(
                    parsed.mainApi,
                    {
                        provider: parsed.customApiProvider || defaultSettings.mainApi?.provider || 'openai-compatible',
                        apiKey: parsed.customApiKey || defaultSettings.mainApi?.apiKey || '',
                        endpoint: parsed.customApiEndpoint || defaultSettings.mainApi?.endpoint || '',
                        model: parsed.customApiModel || defaultSettings.mainApi?.model || 'gemini-2.5-flash',
                        maxTokens: parsed.customApiMaxTokens || defaultSettings.mainApi?.maxTokens || 2048,
                    }
                );
                const migratedDirectorApi = normalizeApiConfig(
                    parsed.directorApi,
                    {
                        provider: migratedMainApi.provider,
                        apiKey: '',
                        endpoint: migratedMainApi.endpoint,
                        model: migratedMainApi.model,
                        maxTokens: migratedMainApi.maxTokens,
                    }
                );
                AppState.settings.mainApi = migratedMainApi;
                AppState.settings.directorApi = migratedDirectorApi;
                AppState.settings.directorEnabled = parsed.directorEnabled ?? true;
                AppState.settings.directorAutoFallbackToMain = parsed.directorAutoFallbackToMain ?? true;
                AppState.settings.directorRunEveryTurn = parsed.directorRunEveryTurn ?? true;

                // Backward compatibility mirror fields
                AppState.settings.customApiProvider = migratedMainApi.provider;
                AppState.settings.customApiKey = migratedMainApi.apiKey;
                AppState.settings.customApiEndpoint = migratedMainApi.endpoint;
                AppState.settings.customApiModel = migratedMainApi.model;
                AppState.settings.customApiMaxTokens = migratedMainApi.maxTokens;

                // 迁移旧默认配置到更稳妥的新默认（仅迁移历史默认值，不覆盖用户自定义值）
                if (parsed.chunkSize === 15000) {
                    AppState.settings.chunkSize = 8000;
                }
                if (parsed.parallelConcurrency === 3) {
                    AppState.settings.parallelConcurrency = 1;
                }

                AppState.processing.volumeMode = AppState.settings.useVolumeMode || false;
                AppState.config.parallel.enabled = AppState.settings.parallelEnabled !== undefined ? AppState.settings.parallelEnabled : true;
                AppState.config.parallel.concurrency = AppState.settings.parallelConcurrency || 1;
                AppState.config.parallel.mode = AppState.settings.parallelMode || 'independent';
                const maxTokens = parseInt(AppState.settings.customApiMaxTokens, 10);
                AppState.settings.customApiMaxTokens = Number.isFinite(maxTokens)
                    ? Math.max(1, Math.min(8192, maxTokens))
                    : 2048;

                if (AppState.settings.chapterRegexPattern) {
                    AppState.config.chapterRegex.pattern = AppState.settings.chapterRegexPattern;
                }
                if (AppState.settings.defaultWorldbookEntriesUI) {
                    AppState.persistent.defaultEntries = AppState.settings.defaultWorldbookEntriesUI;
                }
                if (AppState.settings.categoryDefaultConfig) {
                    AppState.config.categoryDefault = AppState.settings.categoryDefaultConfig;
                }
                if (AppState.settings.entryPositionConfig) {
                    AppState.config.entryPosition = AppState.settings.entryPositionConfig;
                }
                if (AppState.settings.plotOutlineExportConfig) {
                    AppState.config.plotOutline = AppState.settings.plotOutlineExportConfig;
                }
            }
        } catch (e) { }

        updateSettingsUI();
        updateChapterRegexUI();
        handleProviderChange('main');
        handleProviderChange('director');
    }

    return {
        saveCurrentSettings,
        loadSavedSettings,
    };
}
