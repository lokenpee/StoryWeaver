import { defaultConsolidatePrompt, defaultWorldbookPrompt } from '../core/constants.js';

export function bindActionEvents(deps = {}) {
    const {
        AppState,
        handleStartConversion,
        handleStopProcessing,
        handleRepairFailedMemories,
        showStartFromSelector,
        showProcessedResults,
        toggleMultiSelectMode,
        deleteSelectedMemories,
        updateMemoryQueueUI,
        showSearchModal,
        showReplaceModal,
        showWorldbookView,
        showHistoryView,
        showConsolidateCategorySelector,
        showCleanTagsModal,
        showAliasMergeUI,
        showTxtConverterPanel,
        showProgressPanel,
        showStoryOutlinePanel,
        showCurrentChapterPanel,
        showSettingsPanel,
    } = deps;

    document.getElementById('ttw-start-btn').addEventListener('click', handleStartConversion);
    document.getElementById('ttw-stop-btn').addEventListener('click', handleStopProcessing);
    document.getElementById('ttw-repair-btn').addEventListener('click', handleRepairFailedMemories);
    document.getElementById('ttw-select-start').addEventListener('click', showStartFromSelector);
    document.getElementById('ttw-view-processed').addEventListener('click', showProcessedResults);

    document.getElementById('ttw-multi-delete-btn').addEventListener('click', toggleMultiSelectMode);
    document.getElementById('ttw-confirm-multi-delete').addEventListener('click', deleteSelectedMemories);
    document.getElementById('ttw-cancel-multi-select').addEventListener('click', () => {
        AppState.ui.isMultiSelectMode = false;
        AppState.ui.selectedIndices.clear();
        updateMemoryQueueUI();
    });

    document.getElementById('ttw-search-btn').addEventListener('click', showSearchModal);
    document.getElementById('ttw-replace-btn').addEventListener('click', showReplaceModal);
    document.getElementById('ttw-view-worldbook').addEventListener('click', showWorldbookView);
    document.getElementById('ttw-view-history').addEventListener('click', showHistoryView);
    document.getElementById('ttw-consolidate-entries').addEventListener('click', showConsolidateCategorySelector);
    document.getElementById('ttw-clean-tags').addEventListener('click', showCleanTagsModal);
    document.getElementById('ttw-alias-merge').addEventListener('click', showAliasMergeUI);

    const storyOutlineBtn = document.getElementById('ttw-open-story-outline');
    if (storyOutlineBtn && typeof showStoryOutlinePanel === 'function') {
        storyOutlineBtn.addEventListener('click', showStoryOutlinePanel);
    }

    const currentChapterBtn = document.getElementById('ttw-open-current-chapter');
    if (currentChapterBtn && typeof showCurrentChapterPanel === 'function') {
        currentChapterBtn.addEventListener('click', showCurrentChapterPanel);
    }

    const progressBtn = document.getElementById('ttw-open-progress');
    if (progressBtn && typeof showProgressPanel === 'function') {
        progressBtn.addEventListener('click', showProgressPanel);
    }

    if (typeof showTxtConverterPanel === 'function') {
        showTxtConverterPanel();
    }
}

export function bindExportEvents(deps = {}) {
    const {
        AppState,
        showPromptPreview,
        showPlotOutlineConfigModal,
        showBatchDeleteRepeatedSegmentsModal,
        importAndMergeWorldbook,
        loadTaskState,
        saveTaskState,
        exportSettings,
        importSettings,
        exportCharacterCard,
        exportVolumes,
        exportToSillyTavern,
        showMemoryContentModal,
    } = deps;

    document.getElementById('ttw-preview-prompt').addEventListener('click', showPromptPreview);
    document.getElementById('ttw-plot-export-config').addEventListener('click', showPlotOutlineConfigModal);
    document.getElementById('ttw-import-json').addEventListener('click', importAndMergeWorldbook);
    const cleanRepeatBtn = document.getElementById('ttw-clean-repeat-segments');
    if (cleanRepeatBtn && typeof showBatchDeleteRepeatedSegmentsModal === 'function') {
        cleanRepeatBtn.addEventListener('click', showBatchDeleteRepeatedSegmentsModal);
    }
    document.getElementById('ttw-import-task').addEventListener('click', loadTaskState);
    document.getElementById('ttw-export-task').addEventListener('click', saveTaskState);
    document.getElementById('ttw-export-settings').addEventListener('click', exportSettings);
    document.getElementById('ttw-import-settings').addEventListener('click', importSettings);
    document.getElementById('ttw-export-json').addEventListener('click', exportCharacterCard);
    document.getElementById('ttw-export-volumes').addEventListener('click', exportVolumes);
    document.getElementById('ttw-export-st').addEventListener('click', exportToSillyTavern);
    const memoryQueueContainer = document.getElementById('ttw-memory-queue');
    if (memoryQueueContainer) {
        memoryQueueContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.ttw-memory-item');
            if (!item) return;

            const index = parseInt(item.dataset.index, 10);
            if (isNaN(index)) return;

            if (AppState.ui.isMultiSelectMode) {
                const checkbox = item.querySelector('.ttw-memory-checkbox');
                if (e.target.type !== 'checkbox' && checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            } else {
                showMemoryContentModal(index);
            }
        });

        memoryQueueContainer.addEventListener('change', (e) => {
            if (!e.target.classList.contains('ttw-memory-checkbox')) return;

            const item = e.target.closest('.ttw-memory-item');
            const index = parseInt(item?.dataset.index, 10);
            if (isNaN(index)) return;

            if (e.target.checked) {
                AppState.ui.selectedIndices.add(index);
                item.classList.add('selected-for-delete');
            } else {
                AppState.ui.selectedIndices.delete(index);
                item.classList.remove('selected-for-delete');
            }

            const selectedCountEl = document.getElementById('ttw-selected-count');
            if (selectedCountEl) {
                selectedCountEl.textContent = `已选: ${AppState.ui.selectedIndices.size}`;
            }
        });
    }
}

export function bindFileEvents(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        confirmAction,
        handleFileSelect,
        handleClearFile,
        previewRepeatedSegmentsCleanup,
        executeRepeatedSegmentsCleanup,
    } = deps;

    const uploadArea = document.getElementById('ttw-upload-area');
    const fileInput = document.getElementById('ttw-file-input');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e67e22';
        uploadArea.style.background = 'rgba(230,126,34,0.1)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#555';
        uploadArea.style.background = 'transparent';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#555';
        uploadArea.style.background = 'transparent';
        if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });

    document.getElementById('ttw-clear-file').addEventListener('click', handleClearFile);
    document.getElementById('ttw-novel-name-input').addEventListener('input', (e) => {
        AppState.file.novelName = e.target.value.trim();
    });

    const cleanInput = document.getElementById('ttw-inline-clean-repeat-input');
    const cleanHint = document.getElementById('ttw-inline-clean-repeat-hint');
    const cleanPreviewBtn = document.getElementById('ttw-inline-clean-repeat-preview');
    const cleanExecBtn = document.getElementById('ttw-inline-clean-repeat-execute');
    const cleanResultWrap = document.getElementById('ttw-inline-clean-repeat-results');
    const cleanSummary = document.getElementById('ttw-inline-clean-repeat-summary');
    const cleanDetails = document.getElementById('ttw-inline-clean-repeat-details');
    const rangeEls = document.querySelectorAll('input[name="ttw-inline-clean-repeat-range"]');

    if (!cleanInput || !cleanPreviewBtn || !cleanExecBtn || !cleanResultWrap || !cleanSummary || !cleanDetails) {
        return;
    }

    const showError = (message) => {
        if (ErrorHandler && typeof ErrorHandler.showUserError === 'function') {
            ErrorHandler.showUserError(message);
            return;
        }
        alert(message);
    };

    const showSuccess = (message) => {
        if (ErrorHandler && typeof ErrorHandler.showUserSuccess === 'function') {
            ErrorHandler.showUserSuccess(message);
            return;
        }
        alert(message);
    };

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const parseSegmentsForHint = (input) => {
        const raw = String(input || '').replace(/\r\n?/g, '\n').trim();
        if (!raw) return [];

        const blocks = raw
            .split(/\n\s*\n+/)
            .map((item) => item.trim())
            .filter(Boolean);

        const source = blocks.length > 1
            ? blocks
            : raw
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean);

        const unique = [];
        const seen = new Set();
        for (const item of source) {
            if (!item || seen.has(item)) continue;
            seen.add(item);
            unique.push(item);
        }
        return unique;
    };

    const getRangeMode = () => {
        const selected = document.querySelector('input[name="ttw-inline-clean-repeat-range"]:checked');
        return selected ? selected.value : 'all';
    };

    const renderPreviewResult = (preview) => {
        cleanResultWrap.style.display = 'block';

        if (!preview || preview.totalHits <= 0) {
            cleanSummary.innerHTML = '<span style="color:#95a5a6;">预览完成：未命中任何重复片段。</span>';
            cleanDetails.innerHTML = '';
            cleanExecBtn.disabled = true;
            cleanExecBtn.textContent = '🧹 执行删除';
            return;
        }

        cleanSummary.innerHTML = `
            <div style="color:#2ecc71;font-weight:bold;">预览命中 ${preview.totalHits} 次，涉及 ${preview.chapterStats.length} 章，预计删除 ${preview.totalRemovedChars} 字。</div>
            <div style="font-size:11px;color:#aaa;margin-top:4px;">匹配方式：精确字面量匹配（不使用正则）。</div>
        `;

        const chapterLines = preview.chapterStats
            .slice(0, 12)
            .map((item) => {
                const chapter = escapeHtml(item.chapterTitle || `第${item.index + 1}章`);
                return `<li>${chapter}：命中 ${item.hits} 次，删除 ${item.removedChars} 字</li>`;
            })
            .join('');

        const segmentLines = preview.segmentHits
            .filter((item) => item.hits > 0)
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 6)
            .map((item) => {
                const text = escapeHtml(item.segment.slice(0, 40));
                const suffix = item.segment.length > 40 ? '...' : '';
                return `<li>片段「${text}${suffix}」命中 ${item.hits} 次</li>`;
            })
            .join('');

        cleanDetails.innerHTML = `
            <div style="font-size:12px;color:#ddd;margin-bottom:6px;">章节命中（最多12条）</div>
            <ul style="margin:0 0 8px 16px;padding:0;line-height:1.7;">${chapterLines}</ul>
            <div style="font-size:12px;color:#ddd;margin-bottom:6px;">片段统计（Top 6）</div>
            <ul style="margin:0 0 0 16px;padding:0;line-height:1.7;">${segmentLines || '<li>无</li>'}</ul>
        `;

        cleanExecBtn.disabled = false;
        cleanExecBtn.textContent = `🧹 执行删除（${preview.totalHits} 处）`;
    };

    let previewState = null;

    const markPreviewDirty = () => {
        previewState = null;
        cleanExecBtn.disabled = true;
        cleanExecBtn.textContent = '🧹 执行删除';
        cleanResultWrap.style.display = 'none';
    };

    const refreshHint = () => {
        const segments = parseSegmentsForHint(cleanInput.value || '');
        if (!cleanHint) return;
        cleanHint.textContent = segments.length > 0
            ? `已解析 ${segments.length} 个待删片段（去重后）`
            : '尚未解析片段';
    };

    cleanInput.addEventListener('input', () => {
        refreshHint();
        markPreviewDirty();
    });

    rangeEls.forEach((el) => {
        el.addEventListener('change', markPreviewDirty);
    });

    cleanPreviewBtn.addEventListener('click', () => {
        if (typeof previewRepeatedSegmentsCleanup !== 'function') {
            showError('当前版本不支持预览清洗');
            return;
        }

        const rangeMode = getRangeMode();
        const previewResult = previewRepeatedSegmentsCleanup(cleanInput.value || '', rangeMode, []);
        if (!previewResult || !previewResult.ok) {
            showError((previewResult && previewResult.error) || '预览失败');
            return;
        }

        previewState = {
            segments: previewResult.segments,
            chapterIndices: previewResult.chapterIndices,
            preview: previewResult.preview,
        };

        renderPreviewResult(previewResult.preview);
    });

    cleanExecBtn.addEventListener('click', async () => {
        if (!previewState || !previewState.preview || previewState.preview.totalHits <= 0) {
            showError('请先预览并确认有命中内容');
            return;
        }

        const preview = previewState.preview;
        const confirmed = typeof confirmAction === 'function'
            ? await confirmAction(
                `确定执行删除吗？\n\n将删除 ${preview.totalHits} 处重复片段，涉及 ${preview.chapterStats.length} 章。`,
                { title: '确认批量删除', danger: true },
            )
            : window.confirm(`确定执行删除吗？\n\n将删除 ${preview.totalHits} 处重复片段，涉及 ${preview.chapterStats.length} 章。`);

        if (!confirmed) return;

        if (typeof executeRepeatedSegmentsCleanup !== 'function') {
            showError('当前版本不支持执行清洗');
            return;
        }

        const executeResult = executeRepeatedSegmentsCleanup(previewState.segments, previewState.chapterIndices);
        if (!executeResult || !executeResult.ok) {
            showError((executeResult && executeResult.error) || '执行失败');
            return;
        }

        const result = executeResult.result || {
            changedIndices: [],
            resetProcessedIndices: [],
            deletedHits: 0,
            deletedChars: 0,
        };

        if (result.changedIndices.length === 0) {
            showError('执行完成，但没有检测到可删除内容');
            return;
        }

        const resetCount = result.resetProcessedIndices.length;
        const suffix = resetCount > 0
            ? `，其中 ${resetCount} 章原为已处理，已重置为未处理`
            : '';
        showSuccess(`清洗完成：删除 ${result.deletedHits} 处，影响 ${result.changedIndices.length} 章，共移除约 ${result.deletedChars} 字${suffix}`);

        markPreviewDirty();
    });

    refreshHint();
}

export function bindStreamEvents(deps = {}) {
    const {
        updateStreamContent,
    } = deps;

    document.getElementById('ttw-toggle-stream').addEventListener('click', () => {
        const container = document.getElementById('ttw-stream-container');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('ttw-clear-stream').addEventListener('click', () => updateStreamContent('', true));

    document.getElementById('ttw-copy-stream').addEventListener('click', () => {
        const streamEl = document.getElementById('ttw-stream-content');
        if (streamEl && streamEl.textContent) {
            navigator.clipboard.writeText(streamEl.textContent).then(() => {
                const btn = document.getElementById('ttw-copy-stream');
                const orig = btn.textContent;
                btn.textContent = '✅ 已复制';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = streamEl.textContent;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                const btn = document.getElementById('ttw-copy-stream');
                btn.textContent = '✅ 已复制';
                setTimeout(() => { btn.textContent = '📋 复制全部'; }, 1500);
            });
        }
    });

    document.getElementById('ttw-debug-mode').addEventListener('change', (e) => {
        const copyBtn = document.getElementById('ttw-copy-stream');
        if (copyBtn) copyBtn.style.display = e.target.checked ? 'inline-block' : 'none';
    });
}

export function bindSettingEvents(deps = {}) {
    const {
        EventDelegate,
        modalContainer,
        AppState,
        saveCurrentSettings,
        handleUseTavernApiChange,
        handleProviderChange,
        switchApiTab,
        handleFetchModels,
        handleQuickTest,
        rechunkMemories,
        showAddCategoryModal,
        confirmAction,
        resetToDefaultCategories,
        renderCategoriesList,
        showAddDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
        applyDefaultWorldbookEntries,
        showResultSection,
        updateWorldbookPreview,
        ErrorHandler,
        testChapterRegex,
        handlePluginSelfUpdate,
    } = deps;

    const getPromptDefaultValue = (type) => {
        if (type === 'worldbook') return defaultWorldbookPrompt;
        if (type === 'consolidate') return defaultConsolidatePrompt;
        return '';
    };

    const savePromptByType = (type) => {
        const textarea = document.getElementById(`ttw-${type}-prompt`);
        if (!textarea) return;

        if (type === 'worldbook') {
            AppState.settings.customWorldbookPrompt = textarea.value || '';
        } else if (type === 'consolidate') {
            AppState.settings.customConsolidatePrompt = textarea.value || '';
        }

        saveCurrentSettings({ syncPromptFieldsFromDom: false });
        if (ErrorHandler && typeof ErrorHandler.showUserSuccess === 'function') {
            ErrorHandler.showUserSuccess('提示词已保存');
        }
    };

    EventDelegate.batchOn(modalContainer, {
        '#ttw-use-tavern-api': { change: () => { handleUseTavernApiChange(); saveCurrentSettings(); } },
        '#ttw-api-provider': { change: () => { handleProviderChange('main'); saveCurrentSettings(); } },
        '#ttw-api-provider-main': { change: () => { handleProviderChange('main'); saveCurrentSettings(); } },
        '#ttw-api-provider-director': { change: () => { handleProviderChange('director'); saveCurrentSettings(); } },
        '#ttw-model-select': { change: (e) => { if (e.target.value) { const input = document.getElementById('ttw-api-model-main') || document.getElementById('ttw-api-model'); if (input) input.value = e.target.value; saveCurrentSettings(); } } },
        '#ttw-model-select-main': { change: (e) => { if (e.target.value) { const input = document.getElementById('ttw-api-model-main') || document.getElementById('ttw-api-model'); if (input) input.value = e.target.value; saveCurrentSettings(); } } },
        '#ttw-model-select-director': { change: (e) => { if (e.target.value) { const input = document.getElementById('ttw-api-model-director'); if (input) input.value = e.target.value; saveCurrentSettings(); } } },
        '#ttw-fetch-models': { click: () => handleFetchModels('main') },
        '#ttw-quick-test': { click: () => handleQuickTest('main') },
        '#ttw-fetch-models-main': { click: () => handleFetchModels('main') },
        '#ttw-quick-test-main': { click: () => handleQuickTest('main') },
        '#ttw-fetch-models-director': { click: () => handleFetchModels('director') },
        '#ttw-quick-test-director': { click: () => handleQuickTest('director') },
        '#ttw-api-tab-main': { click: () => switchApiTab?.('main') },
        '#ttw-api-tab-director': { click: () => switchApiTab?.('director') },
        '#ttw-parallel-enabled': { change: (e) => { AppState.config.parallel.enabled = e.target.checked; saveCurrentSettings(); } },
        '#ttw-parallel-concurrency': { change: (e) => {
            AppState.config.parallel.concurrency = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3));
            AppState.config.parallel.mainConcurrency = AppState.config.parallel.concurrency;
            AppState.config.parallel.directorConcurrency = AppState.config.parallel.concurrency;
            e.target.value = AppState.config.parallel.concurrency;
            const mainEl = document.getElementById('ttw-parallel-main-concurrency');
            if (mainEl) mainEl.value = AppState.config.parallel.mainConcurrency;
            const directorEl = document.getElementById('ttw-parallel-director-concurrency');
            if (directorEl) directorEl.value = AppState.config.parallel.directorConcurrency;
            saveCurrentSettings();
        } },
        '#ttw-parallel-main-concurrency': { change: (e) => {
            AppState.config.parallel.mainConcurrency = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
            e.target.value = AppState.config.parallel.mainConcurrency;
            saveCurrentSettings();
        } },
        '#ttw-parallel-director-concurrency': { change: (e) => {
            AppState.config.parallel.directorConcurrency = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
            e.target.value = AppState.config.parallel.directorConcurrency;
            saveCurrentSettings();
        } },
        '#ttw-parallel-mode': { change: (e) => { AppState.config.parallel.mode = e.target.value; saveCurrentSettings(); } },
        '#ttw-volume-mode': { change: (e) => { AppState.processing.volumeMode = e.target.checked; const indicator = document.getElementById('ttw-volume-indicator'); if (indicator) indicator.style.display = AppState.processing.volumeMode ? 'block' : 'none'; } },
        '#ttw-rechunk-btn': { click: rechunkMemories },
        '#ttw-add-category': { click: showAddCategoryModal },
        '#ttw-reset-categories': { click: async () => { if (await confirmAction('确定重置为默认分类配置吗？这将清除所有自定义分类。', { title: '重置分类', danger: true })) { await resetToDefaultCategories(); renderCategoriesList(); } } },
        '#ttw-add-default-entry': { click: showAddDefaultEntryModal },
        '#ttw-apply-default-entries': { click: () => { saveDefaultWorldbookEntriesUI(); const applied = applyDefaultWorldbookEntries(); if (applied) { showResultSection(true); updateWorldbookPreview(); ErrorHandler.showUserSuccess('默认世界书条目已应用！'); } else { ErrorHandler.showUserError('没有默认世界书条目'); } } },
        '#ttw-chapter-regex': { change: (e) => { AppState.config.chapterRegex.pattern = e.target.value; saveCurrentSettings(); } },
        '#ttw-test-chapter-regex': { click: testChapterRegex },
        '#ttw-update-plugin-btn': { click: () => { if (typeof handlePluginSelfUpdate === 'function') handlePluginSelfUpdate(); } },
        '.ttw-chapter-preset': { click: (e, btn) => { const regex = btn.dataset.regex; document.getElementById('ttw-chapter-regex').value = regex; AppState.config.chapterRegex.pattern = regex; saveCurrentSettings(); } },
        '.ttw-reset-prompt': {
            click: (e, btn) => {
                const type = btn.getAttribute('data-type');
                const textarea = document.getElementById(`ttw-${type}-prompt`);
                if (!textarea) return;

                if (type === 'worldbook' || type === 'consolidate') {
                    textarea.value = getPromptDefaultValue(type);
                    if (ErrorHandler && typeof ErrorHandler.showUserSuccess === 'function') {
                        ErrorHandler.showUserSuccess('已恢复默认内容，请点击保存按钮生效');
                    }
                    return;
                }

                textarea.value = '';
                saveCurrentSettings({ syncPromptFieldsFromDom: true });
            }
        },
        '#ttw-save-worldbook-prompt': { click: () => savePromptByType('worldbook') },
        '#ttw-save-consolidate-prompt': { click: () => savePromptByType('consolidate') }
    });

    ['ttw-api-key', 'ttw-api-endpoint', 'ttw-api-model', 'ttw-api-max-tokens', 'ttw-chunk-size', 'ttw-api-timeout', 'ttw-api-key-main', 'ttw-api-endpoint-main', 'ttw-api-model-main', 'ttw-api-max-tokens-main', 'ttw-api-key-director', 'ttw-api-endpoint-director', 'ttw-api-model-director', 'ttw-api-max-tokens-director'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveCurrentSettings);
    });

    ['ttw-incremental-mode', 'ttw-volume-mode', 'ttw-enable-plot', 'ttw-enable-style', 'ttw-force-chapter-marker', 'ttw-allow-recursion', 'ttw-director-enabled', 'ttw-director-fallback-main', 'ttw-director-run-every-turn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveCurrentSettings);
    });
}

export function bindPromptEvents(deps = {}) {
    const {
        saveCurrentSettings,
    } = deps;

    ['ttw-plot-prompt', 'ttw-style-prompt', 'ttw-suffix-prompt'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => saveCurrentSettings({ syncPromptFieldsFromDom: true }));
    });
}

export function bindMessageChainEvents(deps = {}) {
    const {
        AppState,
        renderMessageChainUI,
        saveCurrentSettings,
        confirmAction,
    } = deps;

    renderMessageChainUI();
    document.getElementById('ttw-add-chain-msg').addEventListener('click', () => {
        if (!AppState.settings.promptMessageChain) AppState.settings.promptMessageChain = [];
        AppState.settings.promptMessageChain.push({ role: 'user', content: '', enabled: true });
        renderMessageChainUI();
        saveCurrentSettings();
    });
    document.getElementById('ttw-reset-chain').addEventListener('click', async () => {
        if (await confirmAction('确定恢复默认消息链？', { title: '恢复默认消息链' })) {
            AppState.settings.promptMessageChain = [{ role: 'user', content: '{PROMPT}', enabled: true }];
            renderMessageChainUI();
            saveCurrentSettings();
        }
    });
}

function toggleCollapsePanel(contentId, header) {
    const content = document.getElementById(contentId);
    const icon = header.querySelector('.ttw-collapse-icon');
    if (content.style.display === 'none' || !content.style.display) {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

export function bindCollapsePanelEvents() {
    const defaultEntriesHeader = document.querySelector('[data-target="ttw-default-entries-content"]');
    if (defaultEntriesHeader) {
        defaultEntriesHeader.addEventListener('click', () => toggleCollapsePanel('ttw-default-entries-content', defaultEntriesHeader));
    }

    document.querySelectorAll('.ttw-prompt-header[data-target]').forEach((header) => {
        header.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            const targetId = header.getAttribute('data-target');
            if (targetId === 'ttw-default-entries-content') return;
            toggleCollapsePanel(targetId, header);
        });
    });
}

export function bindModalBasicEvents(deps = {}) {
    const {
        modalContainer,
        closeModal,
        showHelpModal,
        handleEscKey,
    } = deps;

    const modal = modalContainer.querySelector('.ttw-modal');
    if (!modal) return;

    // Prevent bubbling to SillyTavern extension bar (collapse side effect).
    const stopPropagationHandler = (e) => e.stopPropagation();
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach((eventName) => {
        modalContainer.addEventListener(eventName, stopPropagationHandler);
    });

    modalContainer.querySelector('.ttw-modal-close').addEventListener('click', closeModal);
    modalContainer.querySelector('.ttw-help-btn').addEventListener('click', showHelpModal);
    document.addEventListener('keydown', handleEscKey, true);
}
