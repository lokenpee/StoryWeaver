export function createModelActionsView(deps = {}) {
    const {
        saveCurrentSettings,
        handleFetchModelList,
        handleQuickTestModel,
        Logger,
    } = deps;

    function updateModelStatus(text, type) {
        const statusEl = document.getElementById('ttw-model-status');
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'ttw-model-status';
        if (type) {
            statusEl.classList.add(type);
        }
    }

    async function handleFetchModels() {
        const fetchBtn = document.getElementById('ttw-fetch-models');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        saveCurrentSettings();

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '⏳ 拉取中...';
        }
        updateModelStatus('正在拉取模型列表...', 'loading');

        try {
            const models = await handleFetchModelList();

            if (models.length === 0) {
                updateModelStatus('❌ 未拉取到模型', 'error');
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

            const currentModel = document.getElementById('ttw-api-model')?.value;
            if (models.includes(currentModel)) {
                if (modelSelect) modelSelect.value = currentModel;
            } else if (models.length > 0) {
                if (modelSelect) modelSelect.value = models[0];
                const modelInput = document.getElementById('ttw-api-model');
                if (modelInput) modelInput.value = models[0];
                saveCurrentSettings();
            }

            updateModelStatus(`✅ 找到 ${models.length} 个模型`, 'success');
        } catch (error) {
            Logger.error('API', '拉取模型列表失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = '🔄 拉取模型';
            }
        }
    }

    async function handleQuickTest() {
        const testBtn = document.getElementById('ttw-quick-test');

        saveCurrentSettings();

        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        updateModelStatus('正在测试连接...', 'loading');

        try {
            const result = await handleQuickTestModel();
            updateModelStatus(`✅ 测试成功 (${result.elapsed}ms)`, 'success');
            if (result.response) {
                Logger.info('API', `快速测试响应: ${result.response?.substring(0, 100)}`);
            }
        } catch (error) {
            Logger.error('API', '快速测试失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
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
