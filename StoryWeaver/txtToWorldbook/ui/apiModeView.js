export function createApiModeView(deps = {}) {
    const {
        AppState,
        updateModelStatus,
    } = deps;

    function handleUseTavernApiChange() {
        const useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        const customApiSection = document.getElementById('ttw-custom-api-section');
        if (customApiSection) {
            customApiSection.style.display = useTavernApi ? 'none' : 'block';
        }
        AppState.settings.useTavernApi = useTavernApi;

        const chainWarning = document.getElementById('ttw-chain-tavern-warning');
        if (chainWarning) {
            const chain = AppState.settings.promptMessageChain || [];
            const hasNonUserRole = chain.some((m) => m.enabled !== false && m.role !== 'user');
            chainWarning.style.display = (useTavernApi && hasNonUserRole) ? 'block' : 'none';
        }
    }

    function handleProviderChange() {
        const provider = document.getElementById('ttw-api-provider')?.value || 'openai-compatible';
        const endpointContainer = document.getElementById('ttw-endpoint-container');
        const modelActionsContainer = document.getElementById('ttw-model-actions');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        if (provider === 'openai-compatible' || provider === 'gemini' || provider === 'anthropic') {
            if (endpointContainer) endpointContainer.style.display = 'block';
        } else if (endpointContainer) {
            endpointContainer.style.display = 'none';
        }

        if (provider === 'openai-compatible') {
            if (modelActionsContainer) modelActionsContainer.style.display = 'flex';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } else {
            if (modelActionsContainer) modelActionsContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
        }

        updateModelStatus('', '');
    }

    return {
        handleUseTavernApiChange,
        handleProviderChange,
    };
}
