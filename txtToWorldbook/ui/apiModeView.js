export function createApiModeView(deps = {}) {
    const {
        AppState,
        updateModelStatus,
    } = deps;

    function handleUseTavernApiChange() {
        const useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        const customApiSection = document.getElementById('ttw-custom-api-section');
        if (customApiSection) {
            customApiSection.style.display = 'block';
        }
        AppState.settings.useTavernApi = useTavernApi;

        const chainWarning = document.getElementById('ttw-chain-tavern-warning');
        if (chainWarning) {
            const chain = AppState.settings.promptMessageChain || [];
            const hasNonUserRole = chain.some((m) => m.enabled !== false && m.role !== 'user');
            chainWarning.style.display = (useTavernApi && hasNonUserRole) ? 'block' : 'none';
        }
    }

    function switchApiTab(target = 'main') {
        const normalized = target === 'director' ? 'director' : 'main';
        document.querySelectorAll('.ttw-api-card').forEach((card) => {
            const cardTarget = card.getAttribute('data-api-card');
            card.style.display = cardTarget === normalized ? 'block' : 'none';
        });
        document.querySelectorAll('.ttw-api-tab').forEach((tab) => {
            const tabTarget = tab.getAttribute('data-api-tab');
            if (tabTarget === normalized) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    function handleProviderChange(target = 'main') {
        const suffix = target === 'director' ? 'director' : 'main';
        const provider = document.getElementById(`ttw-api-provider-${suffix}`)?.value
            || (suffix === 'main' ? (document.getElementById('ttw-api-provider')?.value || 'openai-compatible') : 'openai-compatible');
        const endpointContainer = document.getElementById(`ttw-endpoint-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-endpoint-container') : null);
        const modelActionsContainer = document.getElementById(`ttw-model-actions-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-actions') : null);
        const modelSelectContainer = document.getElementById(`ttw-model-select-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-select-container') : null);
        const modelInputContainer = document.getElementById(`ttw-model-input-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-input-container') : null);
        const maxTokensContainer = document.getElementById(`ttw-max-tokens-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-max-tokens-container') : null);

        if (provider === 'openai-compatible' || provider === 'gemini' || provider === 'anthropic') {
            if (endpointContainer) endpointContainer.style.display = 'block';
        } else if (endpointContainer) {
            endpointContainer.style.display = 'none';
        }

        if (provider === 'openai-compatible') {
            if (modelActionsContainer) modelActionsContainer.style.display = 'flex';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
            if (maxTokensContainer) maxTokensContainer.style.display = 'block';
        } else {
            if (modelActionsContainer) modelActionsContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (maxTokensContainer) maxTokensContainer.style.display = 'none';
        }

        updateModelStatus('', '', suffix);
    }

    return {
        handleUseTavernApiChange,
        switchApiTab,
        handleProviderChange,
    };
}
