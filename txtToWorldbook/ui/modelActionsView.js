export function createModelActionsView(deps = {}) {
    const {
        saveCurrentSettings,
        handleFetchModelList,
        handleQuickTestModel,
        Logger,
    } = deps;

    function updateModelStatus(text, type, target = 'main') {
        const suffix = target === 'director' ? 'director' : 'main';
        const statusEl = document.getElementById(`ttw-model-status-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-status') : null);
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'ttw-model-status';
        if (type) {
            statusEl.classList.add(type);
        }
    }

    async function handleFetchModels(target = 'main') {
        const suffix = target === 'director' ? 'director' : 'main';
        const fetchBtn = document.getElementById(`ttw-fetch-models-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-fetch-models') : null);
        const modelSelect = document.getElementById(`ttw-model-select-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-select') : null);
        const modelSelectContainer = document.getElementById(`ttw-model-select-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-select-container') : null);
        const modelInputContainer = document.getElementById(`ttw-model-input-container-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-model-input-container') : null);

        saveCurrentSettings();

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '⏳ 拉取中...';
        }
        updateModelStatus('正在拉取模型列表...', 'loading', suffix);

        try {
            const models = await handleFetchModelList(suffix);

            if (models.length === 0) {
                updateModelStatus('❌ 未拉取到模型', 'error', suffix);
                if (modelInputContainer) modelInputContainer.style.display = 'block';
                if (modelSelectContainer) modelSelectContainer.style.display = 'none';
                return;
            }

            if (modelSelect) {
                modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
                models.forEach((model) => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
            }

            if (modelInputContainer) modelInputContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'block';

            const currentModel = document.getElementById(`ttw-api-model-${suffix}`)?.value
                || (suffix === 'main' ? document.getElementById('ttw-api-model')?.value : '');
            if (models.includes(currentModel)) {
                if (modelSelect) modelSelect.value = currentModel;
            } else if (models.length > 0) {
                if (modelSelect) modelSelect.value = models[0];
                const modelInput = document.getElementById(`ttw-api-model-${suffix}`)
                    || (suffix === 'main' ? document.getElementById('ttw-api-model') : null);
                if (modelInput) modelInput.value = models[0];
                saveCurrentSettings();
            }

            updateModelStatus(`✅ 找到 ${models.length} 个模型`, 'success', suffix);
        } catch (error) {
            Logger.error('API', '拉取模型列表失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error', suffix);
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = '🔄 拉取模型';
            }
        }
    }

    async function handleQuickTest(target = 'main') {
        const suffix = target === 'director' ? 'director' : 'main';
        const testBtn = document.getElementById(`ttw-quick-test-${suffix}`)
            || (suffix === 'main' ? document.getElementById('ttw-quick-test') : null);

        saveCurrentSettings();

        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        updateModelStatus('正在测试连接...', 'loading', suffix);

        try {
            const result = await handleQuickTestModel(suffix);
            updateModelStatus(`✅ 测试成功 (${result.elapsed}ms)`, 'success', suffix);
            if (result.response) {
                Logger.info('API', `快速测试响应: ${result.response?.substring(0, 100)}`);
            }
        } catch (error) {
            Logger.error('API', '快速测试失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error', suffix);
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = '⚡ 快速测试';
            }
        }
    }

    return {
        updateModelStatus,
        handleFetchModels,
        handleQuickTest,
    };
}
