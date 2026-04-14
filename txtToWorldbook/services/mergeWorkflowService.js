import { mergeContentByFieldFusion } from './nameNormalizationService.js';

export function createMergeWorkflowService(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        ModalFactory,
        getEntryTotalTokens,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        mergeService,
        createMergeService,
        Logger,
        getAllVolumesWorldbook,
        defaultConsolidatePrompt,
        confirmAction,
        showProgressSection,
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        Semaphore,
        getProcessingStatus,
        updateWorldbookPreview,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        escapeHtml,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        handleStopProcessing,
    } = deps;

    const mergedService = mergeService || (createMergeService && createMergeService({
        AppState,
        Logger,
        getAllVolumesWorldbook,
        getLanguagePrefix,
        updateStreamContent,
        Semaphore,
        callAPI,
        parseAIResponse,
    }));

    if (!mergedService) {
        throw new Error('createMergeWorkflowService requires mergeService or createMergeService deps');
    }

    let lastConsolidateFailedEntries = [];

    function dedupeStructuredContent(content) {
        return mergeContentByFieldFusion(content, '');
    }

    function getGlobalConsolidatePromptTemplate() {
        const custom = String(AppState.settings.customConsolidatePrompt || '').trim();
        return custom || defaultConsolidatePrompt;
    }

    async function consolidateEntry(category, entryName, promptTemplate) {
        const entry = AppState.worldbook.generated[category]?.[entryName];
        if (!entry || !entry['内容']) return;

        const preCleanedContent = dedupeStructuredContent(entry['内容']);

        const template = (promptTemplate && promptTemplate.trim()) ? promptTemplate.trim() : getGlobalConsolidatePromptTemplate();
        const prompt = `${template.replace('{CONTENT}', preCleanedContent)}\n\n【强制输出要求】\n1. 去重目标是字段重复，不是删减事实。\n2. 同字段同内容只保留一份，禁止重复输出。\n3. 同字段不同内容必须融合保留，不得覆盖或遗漏。\n4. 禁止输出“字段补充1/补充2/补充N”键名，补充信息必须并入主字段。\n5. 若同一字段有多条信息，写在同一个字段值内（用“；”分隔）。\n6. 尽量采用“字段: 值”的结构化格式输出。\n7. 不要输出解释文字，只输出整理后的正文。`;
        let response = await callAPI(getLanguagePrefix() + prompt);

        response = filterResponseContent(response);

        const finalContent = response ? response.trim() : '';
        if (!finalContent) {
            throw new Error('AI 返回了空内容，保留原条目内容');
        }

        const mergedAfterApi = mergeContentByFieldFusion(preCleanedContent, finalContent);
        entry['内容'] = dedupeStructuredContent(mergedAfterApi);
        if (Array.isArray(entry['关键词'])) {
            entry['关键词'] = [...new Set(entry['关键词'])];
        }
    }

    function consolidateEntryLocal(category, entryName) {
        const entry = AppState.worldbook.generated[category]?.[entryName];
        if (!entry || !entry['内容']) return;

        entry['内容'] = dedupeStructuredContent(entry['内容']);
        if (Array.isArray(entry['关键词'])) {
            entry['关键词'] = [...new Set(entry['关键词'])];
        }
    }

    function showConsolidateCategorySelector() {
        const categories = Object.keys(AppState.worldbook.generated).filter((cat) => {
            const entries = AppState.worldbook.generated[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        if (categories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有任何条目，无法整理');
            return;
        }

        const existingModal = document.getElementById('ttw-consolidate-modal');
        if (existingModal) existingModal.remove();

        let categoriesHtml = '';
        categories.forEach((cat) => {
            const entryNames = Object.keys(AppState.worldbook.generated[cat]);
            const entryCount = entryNames.length;

            let entriesListHtml = '';
            entryNames.forEach((name) => {
                const isFailed = lastConsolidateFailedEntries.some((e) => e.category === cat && e.name === name);
                const failedBadge = isFailed ? '<span style="color:#e74c3c;font-size:9px;margin-left:4px;">❗失败</span>' : '';
                const entryTokens = getEntryTotalTokens(AppState.worldbook.generated[cat][name]);
                entriesListHtml += `
			<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
				<input type="checkbox" class="ttw-consolidate-entry-cb" data-category="${cat}" data-entry="${name}" ${isFailed ? 'checked' : ''}>
				<span style="flex:1;">${name}${failedBadge}</span>
				<span style="color:#888;font-size:10px;white-space:nowrap;">${entryTokens}t</span>
			</label>
			`;
            });

            const hasFailedInCat = lastConsolidateFailedEntries.some((e) => e.category === cat);

            let catTotalTokens = 0;
            entryNames.forEach((name) => { catTotalTokens += getEntryTotalTokens(AppState.worldbook.generated[cat][name]); });

            categoriesHtml += `
		<div class="ttw-consolidate-cat-group" style="margin-bottom:10px;">
			<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(52,152,219,0.15);border-radius:6px;cursor:pointer;" data-cat-toggle="${cat}">
				<input type="checkbox" class="ttw-consolidate-cat-cb" data-category="${cat}" ${hasFailedInCat ? 'checked' : ''}>
				<span style="font-weight:bold;font-size:12px;flex:1;">${cat}</span>
				<span style="color:#888;font-size:11px;">(${entryCount}条 ~${catTotalTokens}t)</span>
				${hasFailedInCat ? '<span style="color:#e74c3c;font-size:10px;">有失败</span>' : ''}
				<span class="ttw-cat-expand-icon" style="font-size:10px;transition:transform 0.2s;">▶</span>
			</div>
			<div class="ttw-cat-entries-list" data-cat-list="${cat}" style="display:none;margin-left:20px;margin-top:4px;max-height:200px;overflow-y:auto;">
				<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:4px;">
					<button class="ttw-btn-tiny ttw-select-all-entries" data-category="${cat}">全选</button>
					<button class="ttw-btn-tiny ttw-deselect-all-entries" data-category="${cat}">全不选</button>
					${hasFailedInCat ? `<button class="ttw-btn-tiny ttw-select-failed-entries" data-category="${cat}" style="color:#e74c3c;">选失败项</button>` : ''}
				</div>
				${entriesListHtml}
			</div>
		</div>
		`;
        });

        const hasAnyFailed = lastConsolidateFailedEntries.length > 0;
        const usingCustomPrompt = !!String(AppState.settings.customConsolidatePrompt || '').trim();

        const bodyHtml = `
		<div style="margin-bottom:12px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">展开分类可多选具体条目。AI将去除重复信息并优化格式。</div>
		</div>
		<div style="margin-bottom:12px;">
            <div style="font-size:12px;color:#f39c12;">
                当前使用：${usingCustomPrompt ? '提示词编辑页中的“整理条目AI提示词（自定义）”' : '内置默认整理提示词'}。
            </div>
		</div>
		${hasAnyFailed ? `
		<div style="margin-bottom:12px;padding:10px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<span style="color:#e74c3c;font-weight:bold;font-size:12px;">❗ 上次有 ${lastConsolidateFailedEntries.length} 个条目失败</span>
				<button class="ttw-btn ttw-btn-small ttw-btn-warning" id="ttw-select-all-failed">🔧 只选失败项</button>
			</div>
		</div>
		` : ''}
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
			<span style="font-weight:bold;">选择分类和条目 <span id="ttw-consolidate-selected-count" style="color:#888;font-size:11px;font-weight:normal;"></span></span>
			<div style="display:flex;gap:8px;">
				<button class="ttw-btn-tiny" id="ttw-check-all-cats">全选所有</button>
				<button class="ttw-btn-tiny" id="ttw-uncheck-all-cats">全不选</button>
			</div>
		</div>
		<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">
			${categoriesHtml}
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-consolidate">取消</button>
        <button class="ttw-btn ttw-btn-secondary" id="ttw-start-local-consolidate" title="仅使用本地函数整理，不调用AI">🧩 本地整理</button>
        <button class="ttw-btn ttw-btn-primary" id="ttw-start-consolidate" title="调用AI整理，并在前后执行本地兜底">🤖 AI整理</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-consolidate-modal',
            title: '🧹 整理条目 - 选择条目',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '600px',
        });

        function updateSelectedCount() {
            const count = modal.querySelectorAll('.ttw-consolidate-entry-cb:checked').length;
            const countEl = modal.querySelector('#ttw-consolidate-selected-count');
            if (countEl) countEl.textContent = `(已选 ${count} 条)`;
        }

        modal.querySelectorAll('[data-cat-toggle]').forEach((header) => {
            header.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const cat = header.dataset.catToggle;
                const list = modal.querySelector(`[data-cat-list="${cat}"]`);
                const icon = header.querySelector('.ttw-cat-expand-icon');
                if (list.style.display === 'none') {
                    list.style.display = 'block';
                    icon.style.transform = 'rotate(90deg)';
                } else {
                    list.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            });
        });

        modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const cat = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((entryCb) => {
                    entryCb.checked = e.target.checked;
                });
                updateSelectedCount();
            });
        });

        modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach((cb) => {
            cb.addEventListener('change', updateSelectedCount);
        });

        modal.querySelectorAll('.ttw-select-all-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => { cb.checked = true; });
                updateSelectedCount();
            });
        });
        modal.querySelectorAll('.ttw-deselect-all-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => { cb.checked = false; });
                updateSelectedCount();
            });
        });
        modal.querySelectorAll('.ttw-select-failed-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => {
                    const isFailed = lastConsolidateFailedEntries.some((e) => e.category === cat && e.name === cb.dataset.entry);
                    cb.checked = isFailed;
                });
                updateSelectedCount();
            });
        });

        modal.querySelector('#ttw-check-all-cats').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        });
        modal.querySelector('#ttw-uncheck-all-cats').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            });
        });

        const selectAllFailedBtn = modal.querySelector('#ttw-select-all-failed');
        if (selectAllFailedBtn) {
            selectAllFailedBtn.addEventListener('click', () => {
                modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach((cb) => { cb.checked = false; });
                modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => { cb.checked = false; });
                lastConsolidateFailedEntries.forEach((failed) => {
                    const cb = modal.querySelector(`.ttw-consolidate-entry-cb[data-category="${failed.category}"][data-entry="${failed.name}"]`);
                    if (cb) cb.checked = true;
                });
                updateSelectedCount();
            });
        }

        modal.querySelector('#ttw-cancel-consolidate').addEventListener('click', () => ModalFactory.close(modal));

        function collectSelectedEntries() {
            const promptTemplate = getGlobalConsolidatePromptTemplate();
            return [...modal.querySelectorAll('.ttw-consolidate-entry-cb:checked')].map((cb) => {
                return {
                    category: cb.dataset.category,
                    name: cb.dataset.entry,
                    promptTemplate,
                };
            });
        }

        async function startConsolidation(mode = 'ai') {
            const selectedEntries = collectSelectedEntries();
            if (selectedEntries.length === 0) {
                ErrorHandler.showUserError('请至少选择一个条目');
                return;
            }

            const usageSummary = usingCustomPrompt ? '自定义整理提示词' : '内置默认整理提示词';
            const modeText = mode === 'local' ? '本地整理（仅函数）' : 'AI整理（含本地兜底）';
            if (!await confirmAction(`确定要执行${modeText}，共 ${selectedEntries.length} 个条目吗？\n\n提示词来源：${usageSummary}`, { title: '整理条目' })) return;

            modal.remove();
            await consolidateSelectedEntries(selectedEntries, { mode });
        }

        modal.querySelector('#ttw-start-local-consolidate').addEventListener('click', async () => {
            await startConsolidation('local');
        });

        modal.querySelector('#ttw-start-consolidate').addEventListener('click', async () => {
            await startConsolidation('ai');
        });

        updateSelectedCount();
    }

    async function consolidateSelectedEntries(entries, options = {}) {
        const mode = options.mode === 'local' ? 'local' : 'ai';
        const modeText = mode === 'local' ? '本地整理' : 'AI整理';

        showProgressSection(true);
        setProcessingStatus('running');
        updateProgress(0, `开始${modeText}条目...`);
        updateStreamContent('', true);
        updateStreamContent(`${mode === 'local' ? '🧩' : '🤖'} 开始${modeText} ${entries.length} 个条目\n${'='.repeat(50)}\n`);

        const semaphore = new Semaphore(AppState.config.parallel.concurrency);
        let completed = 0;
        let failed = 0;
        const failedEntries = [];

        const processOne = async (entry, index) => {
            if (AppState.processing.isStopped) return;

            try {
                await semaphore.acquire();
            } catch (e) {
                if (e.message === 'ABORTED') return;
                throw e;
            }

            if (AppState.processing.isStopped) {
                semaphore.release();
                return;
            }

            try {
                updateStreamContent(`📝 [${index + 1}/${entries.length}] ${entry.category} - ${entry.name}\n`);
                if (mode === 'local') {
                    consolidateEntryLocal(entry.category, entry.name);
                } else {
                    await consolidateEntry(entry.category, entry.name, entry.promptTemplate);
                }
                completed++;
                updateProgress(((completed + failed) / entries.length) * 100, `${modeText}中 (${completed}✅ ${failed}❌ / ${entries.length})`);
                updateStreamContent('   ✅ 完成\n');
            } catch (error) {
                failed++;
                failedEntries.push({ category: entry.category, name: entry.name, error: error.message });
                updateProgress(((completed + failed) / entries.length) * 100, `${modeText}中 (${completed}✅ ${failed}❌ / ${entries.length})`);
                updateStreamContent(`   ❌ 失败: ${error.message}\n`);
            } finally {
                semaphore.release();
            }
        };

        await Promise.allSettled(entries.map((entry, i) => processOne(entry, i)));

        lastConsolidateFailedEntries = failedEntries;

        updateProgress(100, `${modeText}完成: 成功 ${completed}, 失败 ${failed}`);
        updateStreamContent(`\n${'='.repeat(50)}\n✅ ${modeText}完成！成功 ${completed}, 失败 ${failed}\n`);

        if (failedEntries.length > 0) {
            updateStreamContent('\n❗ 失败条目:\n');
            failedEntries.forEach((f) => {
                updateStreamContent(`   • [${f.category}] ${f.name}: ${f.error}\n`);
            });
            updateStreamContent('\n💡 再次打开"整理条目"可以只选失败项重试\n');
        }
        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

        updateWorldbookPreview();

        let msg = `条目${modeText}完成！\n成功: ${completed}\n失败: ${failed}`;
        if (failed > 0) {
            msg += '\n\n再次点击"整理条目"可以只选失败项重试';
            ErrorHandler.showUserError(msg);
            return;
        }
        ErrorHandler.showUserSuccess(msg);
    }

    function showManualMergeUI(onMergeComplete) {
        const existingModal = document.getElementById('ttw-manual-merge-modal');
        if (existingModal) existingModal.remove();

        const worldbook = mergedService.getManualMergeViewWorldbook();
        const categories = Object.keys(worldbook).filter((cat) => {
            const entries = worldbook[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        if (categories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有条目，无法进行手动合并');
            return;
        }

        let entriesHtml = '';
        let totalEntries = 0;
        for (const cat of categories) {
            const entries = worldbook[cat];
            const entryNames = naturalSortEntryNames(Object.keys(entries));
            totalEntries += entryNames.length;

            entriesHtml += `<div class="ttw-mm-category" style="margin-bottom:10px;">
		<div class="ttw-collapse-toggle" style="background:linear-gradient(135deg,#e67e22,#d35400);padding:8px 12px;border-radius:6px 6px 0 0;cursor:pointer;font-weight:bold;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
			<span>📁 ${cat} (${entryNames.length})</span>
			<span style="font-size:11px;color:rgba(255,255,255,0.7);">点击展开/收起</span>
		</div>
		<div style="background:#2d2d2d;border:1px solid #555;border-top:none;border-radius:0 0 6px 6px;display:none;max-height:300px;overflow-y:auto;">`;

            for (const name of entryNames) {
                const sourceInfo = mergedService.resolveDisplayedEntrySource(cat, name);
                const entry = sourceInfo?.entry || entries[name];
                const sourceType = sourceInfo?.sourceType || 'generated';
                const volumeIndex = Number.isInteger(sourceInfo?.volumeIndex) ? sourceInfo.volumeIndex : AppState.worldbook.currentVolumeIndex;
                const actualName = sourceInfo?.actualName || name;
                const keywords = Array.isArray(entry?.['关键词']) ? entry['关键词'].slice(0, 4).join(', ') : '';
                const tokenCount = getEntryTotalTokens(entry);
                entriesHtml += `
			<label class="ttw-mm-entry-label" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #3a3a3a;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='rgba(155,89,182,0.15)'" onmouseleave="this.style.background='transparent'">
				<input type="checkbox" class="ttw-mm-entry-cb" data-category="${cat}" data-entry="${name}" data-actual-entry="${actualName}" data-source-type="${sourceType}" data-source-volume="${volumeIndex}" style="width:16px;height:16px;accent-color:#9b59b6;flex-shrink:0;">
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${name}</div>
					<div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${keywords ? '🔑 ' + keywords : ''} <span style="color:#f1c40f;">${tokenCount}tk</span></div>
				</div>
			</label>`;
            }
            entriesHtml += '</div></div>';
        }

        const bodyHtml = `
		<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
			💡 勾选2个或更多条目，将它们合并为一个。适用于AI别名识别未能发现的重复条目。<br>
			<span style="color:#f39c12;">支持跨分类合并，合并后条目将归入您指定的目标分类。</span>
		</div>

		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
			<span style="font-size:13px;color:#ccc;">共 ${totalEntries} 个条目</span>
			<div style="display:flex;gap:8px;align-items:center;">
				<input type="text" id="ttw-mm-filter" placeholder="筛选条目名..." style="padding:4px 8px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;width:150px;">
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-expand-all">全部展开</button>
			</div>
		</div>

		<div id="ttw-mm-entries-container" style="max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.15);border-radius:6px;padding:8px;">
			${entriesHtml}
		</div>

		<div id="ttw-mm-selected-bar" style="display:none;margin-top:12px;padding:10px;background:rgba(155,89,182,0.2);border:1px solid #9b59b6;border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-size:13px;color:#9b59b6;font-weight:bold;">已选: <span id="ttw-mm-selected-count">0</span> 个条目</span>
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-clear-selection" style="font-size:11px;">清除选择</button>
			</div>
			<div id="ttw-mm-selected-list" style="font-size:12px;color:#ccc;max-height:80px;overflow-y:auto;"></div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-cancel">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-next" disabled>下一步 → 配置合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-manual-merge-modal',
            title: '✋ 手动合并条目',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '800px',
        });

        modal.querySelector('#ttw-mm-cancel').addEventListener('click', () => ModalFactory.close(modal));

        EventDelegate.on(modal, '.ttw-collapse-toggle', 'click', (e, toggleEl) => {
            const contentEl = toggleEl.nextElementSibling;
            if (!contentEl) return;
            contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
        });

        modal.querySelector('#ttw-mm-expand-all').addEventListener('click', () => {
            const btn = modal.querySelector('#ttw-mm-expand-all');
            const allCatBodies = modal.querySelectorAll('.ttw-mm-category > div:nth-child(2)');
            const anyHidden = [...allCatBodies].some((d) => d.style.display === 'none');
            allCatBodies.forEach((d) => { d.style.display = anyHidden ? 'block' : 'none'; });
            btn.textContent = anyHidden ? '全部收起' : '全部展开';
        });

        const filterEntries = PerfUtils.debounce((keyword) => {
            modal.querySelectorAll('.ttw-mm-entry-label').forEach((label) => {
                const entryName = label.querySelector('.ttw-mm-entry-cb').dataset.entry.toLowerCase();
                label.style.display = !keyword || entryName.includes(keyword) ? 'flex' : 'none';
            });
            if (keyword) {
                modal.querySelectorAll('.ttw-mm-category').forEach((catDiv) => {
                    const body = catDiv.querySelector('div:nth-child(2)');
                    const hasVisible = [...body.querySelectorAll('.ttw-mm-entry-label')].some((l) => l.style.display !== 'none');
                    if (hasVisible) body.style.display = 'block';
                });
            }
        }, 150);
        modal.querySelector('#ttw-mm-filter').addEventListener('input', (e) => {
            filterEntries(e.target.value.toLowerCase());
        });

        function updateSelection() {
            const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
            const count = checked.length;
            const bar = modal.querySelector('#ttw-mm-selected-bar');
            const nextBtn = modal.querySelector('#ttw-mm-next');

            if (count > 0) {
                bar.style.display = 'block';
                modal.querySelector('#ttw-mm-selected-count').textContent = count;

                const listHtml = checked.map((cb) => {
                    const cat = cb.dataset.category;
                    const name = cb.dataset.entry;
                    return `<span style="display:inline-block;padding:2px 8px;background:rgba(155,89,182,0.3);border-radius:4px;margin:2px;font-size:11px;">[${cat}] ${name}</span>`;
                }).join('');
                modal.querySelector('#ttw-mm-selected-list').innerHTML = listHtml;
            } else {
                bar.style.display = 'none';
            }

            nextBtn.disabled = count < 2;
            nextBtn.textContent = count < 2 ? '下一步 → 配置合并（至少选2个）' : `下一步 → 配置合并 (${count}个)`;
        }

        modal.querySelectorAll('.ttw-mm-entry-cb').forEach((cb) => {
            cb.addEventListener('change', updateSelection);
        });

        modal.querySelector('#ttw-mm-clear-selection').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-mm-entry-cb:checked').forEach((cb) => { cb.checked = false; });
            updateSelection();
        });

        modal.querySelector('#ttw-mm-next').addEventListener('click', () => {
            const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
            if (checked.length < 2) return;

            const selectedEntries = checked.map((cb) => ({
                category: cb.dataset.category,
                name: cb.dataset.entry,
                actualName: cb.dataset.actualEntry || cb.dataset.entry,
                sourceType: cb.dataset.sourceType || 'generated',
                volumeIndex: cb.dataset.sourceVolume !== undefined && cb.dataset.sourceVolume !== '' ? parseInt(cb.dataset.sourceVolume, 10) : AppState.worldbook.currentVolumeIndex,
            }));

            ModalFactory.close(modal);
            showManualMergeConfigModal(selectedEntries, onMergeComplete);
        });
    }

    function showManualMergeConfigModal(selectedEntries, onMergeComplete) {
        const existingModal = document.getElementById('ttw-mm-config-modal');
        if (existingModal) existingModal.remove();

        const worldbook = mergedService.getManualMergeViewWorldbook();
        const entriesInfo = selectedEntries.map((e) => {
            const resolved = mergedService.resolveManualMergeEntryRef(e);
            const entry = resolved?.entry;
            return {
                ...e,
                actualName: resolved?.actualName || e.actualName || e.name,
                sourceType: resolved?.sourceType || e.sourceType || 'generated',
                volumeIndex: Number.isInteger(resolved?.volumeIndex) ? resolved.volumeIndex : (Number.isInteger(e.volumeIndex) ? e.volumeIndex : AppState.worldbook.currentVolumeIndex),
                keywords: entry?.['关键词'] || [],
                content: entry?.['内容'] || '',
                tokens: getEntryTotalTokens(entry),
            };
        });

        const involvedCategories = [...new Set(selectedEntries.map((e) => e.category))];
        const nameOptions = selectedEntries.map((e) => e.name);

        let mergedKeywords = [];
        let mergedContent = '';
        for (const info of entriesInfo) {
            mergedKeywords.push(...info.keywords);
            mergedKeywords.push(info.name);
            if (info.content) {
                mergedContent += (mergedContent ? '\n\n---\n\n' : '') + info.content;
            }
        }
        mergedKeywords = [...new Set(mergedKeywords)];

        const allCategories = Object.keys(worldbook);
        const catOptionsHtml = allCategories.map((cat) => {
            const selected = cat === involvedCategories[0] ? 'selected' : '';
            return `<option value="${cat}" ${selected}>${cat}</option>`;
        }).join('');

        const nameOptionsHtml = nameOptions.map((name, idx) => {
            const cat = selectedEntries[idx].category;
            return `
		<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:4px;cursor:pointer;">
			<input type="radio" name="ttw-mm-main-name" value="${name}" ${idx === 0 ? 'checked' : ''} style="accent-color:#27ae60;">
			<span style="color:#e0e0e0;font-size:13px;">${name}</span>
			<span style="color:#888;font-size:11px;margin-left:auto;">[${cat}]</span>
		</label>`;
        }).join('');

        const detailsHtml = entriesInfo.map((info, idx) => {
            const kwStr = info.keywords.join(', ') || '无';
            const contentPreview = info.content.length > 200 ? info.content.substring(0, 200) + '...' : info.content;
            return `
		<div style="border:1px solid #555;border-radius:6px;margin-bottom:8px;overflow:hidden;">
			<div class="ttw-collapse-toggle" style="background:#3a3a3a;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;cursor:pointer;">
				<span style="color:#e67e22;">[${info.category}] ${info.name}</span>
				<span style="color:#f1c40f;font-size:11px;">${info.tokens}tk</span>
			</div>
			<div style="display:${idx === 0 ? 'block' : 'none'};padding:10px;background:#1c1c1c;font-size:12px;">
				<div style="margin-bottom:6px;"><span style="color:#9b59b6;">🔑 关键词:</span> <span style="color:#ccc;">${kwStr}</span></div>
				<div style="color:#aaa;line-height:1.5;white-space:pre-wrap;max-height:150px;overflow-y:auto;">${contentPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
			</div>
		</div>`;
        }).join('');

        const bodyHtml = `
		<div style="display:flex;gap:16px;flex-wrap:wrap;">
			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">📌 选择主条目名称</div>
				<div style="margin-bottom:12px;padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;max-height:200px;overflow-y:auto;">
					${nameOptionsHtml}
				</div>
				<div style="margin-bottom:8px;">
					<label style="font-size:12px;color:#ccc;display:block;margin-bottom:4px;">或输入自定义名称：</label>
					<input type="text" id="ttw-mm-custom-name" class="ttw-input" placeholder="留空则使用上面选择的名称" style="font-size:12px;">
				</div>

				<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;margin-top:16px;font-size:13px;">📂 目标分类</div>
				<select id="ttw-mm-target-category" style="width:100%;padding:8px;border:1px solid #555;border-radius:4px;background:#2d2d2d;color:#fff;font-size:13px;">
					${catOptionsHtml}
				</select>

				<div style="margin-top:16px;">
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;">
						<input type="checkbox" id="ttw-mm-dedup-keywords" checked style="accent-color:#9b59b6;">
						合并后关键词去重
					</label>
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;margin-top:6px;">
						<input type="checkbox" id="ttw-mm-add-separator" checked style="accent-color:#9b59b6;">
						内容间添加分隔线 (---)
					</label>
				</div>
			</div>

			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#3498db;margin-bottom:8px;font-size:13px;">📋 待合并条目详情</div>
				<div style="max-height:400px;overflow-y:auto;">
					${detailsHtml}
				</div>
			</div>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.3);border-radius:6px;">
			<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">🔮 合并预览</div>
			<div style="font-size:12px;color:#ccc;">
				<div style="margin-bottom:4px;"><span style="color:#9b59b6;">🔑 合并关键词 (${mergedKeywords.length}):</span> ${mergedKeywords.join(', ')}</div>
				<div style="margin-bottom:4px;"><span style="color:#f1c40f;">📊 合并后Token:</span> ~${estimateTokenCount(mergedKeywords.join(', ') + mergedContent)} tk</div>
				<div style="color:#888;font-size:11px;">💡 合并后建议使用「整理条目」功能让AI优化内容、去除重复</div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-back">← 返回选择</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-confirm">✅ 确认合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-mm-config-modal',
            title: `✋ 手动合并 - 配置 (${selectedEntries.length}个条目)`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '800px',
        });

        modal.querySelector('#ttw-mm-back').addEventListener('click', () => {
            ModalFactory.close(modal);
            showManualMergeUI(onMergeComplete);
        });

        modal.querySelector('#ttw-mm-confirm').addEventListener('click', async () => {
            const customName = modal.querySelector('#ttw-mm-custom-name').value.trim();
            const radioName = modal.querySelector('input[name="ttw-mm-main-name"]:checked')?.value;
            const mainName = customName || radioName || selectedEntries[0].name;
            const targetCategory = modal.querySelector('#ttw-mm-target-category').value;
            const dedupKeywords = modal.querySelector('#ttw-mm-dedup-keywords').checked;
            const addSeparator = modal.querySelector('#ttw-mm-add-separator').checked;

            const involvedStr = selectedEntries.map((e) => `[${e.category}] ${e.name}`).join('\n');
            if (!await confirmAction(`确定将以下 ${selectedEntries.length} 个条目合并为「${mainName}」？\n目标分类: ${targetCategory}\n\n${involvedStr}\n\n⚠️ 原条目将被删除！`, { title: '确认手动合并', danger: true })) return;

            const mergeResult = mergedService.executeManualMerge(selectedEntries, mainName, targetCategory, dedupKeywords, addSeparator);
            if (!mergeResult.success) {
                ErrorHandler.showUserError(mergeResult.error || '手动合并失败，未匹配到可合并的条目');
                return;
            }

            updateStreamContent(`\n✅ 手动合并完成: ${selectedEntries.length} 个条目 → [${targetCategory}] ${mainName}\n`);
            if (typeof deps.setManualMergeHighlight === 'function') {
                deps.setManualMergeHighlight(targetCategory, mainName);
            }
            ModalFactory.close(modal);

            if (typeof onMergeComplete === 'function') onMergeComplete();
            ErrorHandler.showUserSuccess(`合并完成！${selectedEntries.length} 个条目已合并为「${mainName}」。\n\n建议使用「整理条目」功能让AI优化合并后的内容。`);
        });
    }

    async function handleAliasMergeConfirm(modal, aiResultByCategory) {
        const checkedBoxes = modal.querySelectorAll('.ttw-merge-group-cb:checked');
        if (checkedBoxes.length === 0) {
            ErrorHandler.showUserError('没有勾选任何合并组');
            return;
        }

        const checkedSelections = [...checkedBoxes].map((box) => ({
            category: box.getAttribute('data-category'),
            groupIndex: parseInt(box.getAttribute('data-group-index'), 10),
        }));
        const mergeByCategory = mergedService.collectAliasMergeGroups(checkedSelections, aiResultByCategory);

        const totalSelected = checkedBoxes.length;
        const categoryList = Object.keys(mergeByCategory).map((c) => `${c}(${mergeByCategory[c].length}组)`).join('、');
        if (!await confirmAction(`确定合并选中的 ${totalSelected} 组条目？\n涉及分类: ${categoryList}`, { title: '批量合并重复条目', danger: true })) return;

        const totalMerged = await mergedService.executeAliasMergeByCategory(mergeByCategory, aiResultByCategory);

        updateWorldbookPreview();
        modal.remove();
        ErrorHandler.showUserSuccess(`合并完成！共合并了 ${totalMerged} 组条目。\n\n建议使用"整理条目"功能清理合并后的重复内容。`);
    }

    async function showAliasMergeUI() {
        const availableCategories = Object.keys(AppState.worldbook.generated).filter((cat) => {
            const entries = AppState.worldbook.generated[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length >= 2;
        });

        if (availableCategories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有包含2个以上条目的分类，无法进行别名合并');
            return;
        }

        const selectedCategories = await new Promise((resolve) => {
            const existingModal = document.getElementById('ttw-alias-cat-modal');
            if (existingModal) existingModal.remove();

            const catListHtml = buildAliasCategorySelectModal(availableCategories, AppState.worldbook.generated, escapeHtml);
            const bodyHtml = `
			<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
				💡 请勾选需要让AI识别别名并合并的分类。将对每个选中的分类独立扫描重复条目。
			</div>
			<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
				<label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="ttw-alias-cat-select-all"> 全选</label>
			</div>
			<div style="max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${catListHtml}
			</div>
		`;
            const footerHtml = `
			<button class="ttw-btn" id="ttw-alias-cat-cancel">取消</button>
			<button class="ttw-btn ttw-btn-primary" id="ttw-alias-cat-confirm">📍 开始扫描</button>
		`;

            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            const catModal = ModalFactory.create({
                id: 'ttw-alias-cat-modal',
                title: '🔗 别名合并 - 选择要扫描的分类',
                body: bodyHtml,
                footer: footerHtml,
                maxWidth: '500px',
                onClose: () => finish(null),
            });

            catModal.querySelector('#ttw-alias-cat-select-all').addEventListener('change', (e) => {
                catModal.querySelectorAll('.ttw-alias-cat-cb').forEach((cb) => { cb.checked = e.target.checked; });
            });

            catModal.querySelector('#ttw-alias-cat-cancel').addEventListener('click', () => {
                ModalFactory.close(catModal);
            });

            catModal.querySelector('#ttw-alias-cat-confirm').addEventListener('click', () => {
                const checked = [...catModal.querySelectorAll('.ttw-alias-cat-cb:checked')].map((cb) => cb.dataset.cat);
                finish(checked.length > 0 ? checked : null);
                ModalFactory.close(catModal);
            });
        });

        if (!selectedCategories || selectedCategories.length === 0) return;

        updateStreamContent('\n🧪 预处理：自动合并明显同名冲突...\n');
        let autoMergedTotal = 0;
        for (const cat of selectedCategories) {
            const { mergedCount } = await mergedService.autoMergeCanonicalConflicts(cat);
            if (mergedCount > 0) {
                autoMergedTotal += mergedCount;
                updateStreamContent(`  [${cat}] 自动合并 ${mergedCount} 组（明显同名/卷号后缀）\n`);
            }
        }
        if (autoMergedTotal > 0) {
            updateWorldbookPreview();
            updateStreamContent(`✅ 预处理完成：自动合并 ${autoMergedTotal} 组\n`);
        }

        updateStreamContent('\n🔍 第一阶段：扫描疑似重复条目...\n');

        const allSuspectedByCategory = {};
        let totalGroups = 0;
        let totalPairs = 0;

        for (const cat of selectedCategories) {
            const suspected = mergedService.findPotentialDuplicates(cat);
            if (suspected.length > 0) {
                allSuspectedByCategory[cat] = suspected;
                totalGroups += suspected.length;
                for (const group of suspected) {
                    totalPairs += (group.length * (group.length - 1)) / 2;
                }
                updateStreamContent(`  [${cat}] 发现 ${suspected.length} 组疑似重复\n`);
            } else {
                updateStreamContent(`  [${cat}] 未发现重复\n`);
            }
        }

        if (totalGroups === 0) {
            if (autoMergedTotal > 0) {
                ErrorHandler.showUserSuccess(`已自动合并 ${autoMergedTotal} 组明显重复条目，未发现需要AI判断的剩余重复组`);
            } else {
                ErrorHandler.showUserError('在所有选中的分类中未发现疑似重复条目');
            }
            return;
        }

        updateStreamContent(`共发现 ${totalGroups} 组疑似重复，${totalPairs} 对需要判断\n`);

        const existingModal = document.getElementById('ttw-alias-modal');
        if (existingModal) existingModal.remove();

        const groupCategoryMap = [];
        const groupsHtml = buildAliasGroupsListHtml(allSuspectedByCategory, AppState.worldbook.generated, groupCategoryMap, escapeHtml);

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 第一阶段：本地检测结果</div>
			<div style="font-size:13px;color:#ccc;">
				扫描了 <span style="color:#e67e22;font-weight:bold;">${selectedCategories.length}</span> 个分类，
				发现 <span style="color:#9b59b6;font-weight:bold;">${totalGroups}</span> 组疑似重复，
				共 <span style="color:#e67e22;font-weight:bold;">${totalPairs}</span> 对需要AI判断
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-weight:bold;">选择要发送给AI判断的组</span>
				<label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-alias" checked> 全选</label>
			</div>
			<div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${groupsHtml}
			</div>
		</div>

		<div style="margin-bottom:16px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:11px;color:#f39c12;">
			💡 <strong>两两判断模式</strong>：AI会对每一对条目分别判断是否相同，然后自动合并确认的结果。<br>
			例如：[A,B,C] 会拆成 (A,B) (A,C) (B,C) 三对分别判断，如果A=B且B=C，则A、B、C会被合并。
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:10px;">⚙️ 并发设置</div>
			<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<input type="checkbox" id="ttw-alias-parallel">
					<span>启用并发</span>
				</label>
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<span>配对数阈值:</span>
					<input type="number" id="ttw-alias-threshold" value="5" min="1" max="50" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
				</label>
			</div>
			<div style="font-size:11px;color:#888;margin-top:8px;">
				≥阈值的配对数单独发送，＜阈值的合并发送（合并到接近阈值数量）
			</div>
		</div>

		<div id="ttw-alias-result" style="display:none;margin-bottom:16px;">
			<div style="padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;margin-bottom:12px;">
				<div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;">🔍 配对判断结果</div>
				<div id="ttw-pair-results" style="max-height:150px;overflow-y:auto;"></div>
			</div>
			<div style="padding:12px;background:rgba(39,174,96,0.15);border-radius:8px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;">📦 合并方案</div>
				<div id="ttw-merge-plan"></div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn ttw-btn-secondary" id="ttw-stop-alias" style="display:none;">⏸️ 停止</button>
		<button class="ttw-btn" id="ttw-cancel-alias">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-ai-verify-alias">🤖 AI两两判断</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-alias" style="display:none;">✅ 确认合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-alias-modal',
            title: '🔗 别名识别与合并 (两两判断模式)',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '750px',
        });

        let aiResultByCategory = {};

        modal.querySelector('#ttw-select-all-alias').addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-alias-group-cb').forEach((cb) => { cb.checked = e.target.checked; });
        });

        modal.querySelector('#ttw-cancel-alias').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-ai-verify-alias').addEventListener('click', async () => {
            const checkedCbs = [...modal.querySelectorAll('.ttw-alias-group-cb:checked')];
            if (checkedCbs.length === 0) {
                ErrorHandler.showUserError('请选择要判断的组');
                return;
            }

            const selectedByCategory = {};
            for (const cb of checkedCbs) {
                const cat = cb.dataset.category;
                const globalIdx = parseInt(cb.dataset.index, 10);
                const { localIndex } = groupCategoryMap[globalIdx];
                if (!selectedByCategory[cat]) selectedByCategory[cat] = [];
                selectedByCategory[cat].push(allSuspectedByCategory[cat][localIndex]);
            }

            const btn = modal.querySelector('#ttw-ai-verify-alias');
            const stopBtn = modal.querySelector('#ttw-stop-alias');
            btn.disabled = true;
            btn.textContent = '🔄 AI判断中...';
            stopBtn.style.display = 'inline-block';

            try {
                const useParallel = modal.querySelector('#ttw-alias-parallel')?.checked ?? AppState.config.parallel.enabled;
                const threshold = parseInt(modal.querySelector('#ttw-alias-threshold')?.value, 10) || 5;

                updateStreamContent(`\n🤖 第二阶段：两两配对判断...\n并发: ${useParallel ? '开启' : '关闭'}, 阈值: ${threshold}\n`);

                aiResultByCategory = {};
                for (const cat of Object.keys(selectedByCategory)) {
                    updateStreamContent(`\n📂 处理分类「${cat}」...\n`);
                    aiResultByCategory[cat] = await mergedService.verifyDuplicatesWithAI(selectedByCategory[cat], useParallel, threshold, cat);
                }

                const resultDiv = modal.querySelector('#ttw-alias-result');
                const pairResultsDiv = modal.querySelector('#ttw-pair-results');
                const mergePlanDiv = modal.querySelector('#ttw-merge-plan');
                resultDiv.style.display = 'block';

                pairResultsDiv.innerHTML = buildAliasPairResultsHtml(aiResultByCategory, escapeHtml);

                const { html: mergePlanHtml, hasAnyMerge } = buildAliasMergePlanHtml(aiResultByCategory, escapeHtml);
                mergePlanDiv.innerHTML = mergePlanHtml;

                const selectAllMergeCb = mergePlanDiv.querySelector('#ttw-select-all-merge-groups');
                if (selectAllMergeCb) {
                    selectAllMergeCb.addEventListener('change', (e) => {
                        mergePlanDiv.querySelectorAll('.ttw-merge-group-cb').forEach((cb) => { cb.checked = e.target.checked; });
                    });
                }

                if (hasAnyMerge) {
                    modal.querySelector('#ttw-confirm-alias').style.display = 'inline-block';
                }
                btn.style.display = 'none';
                stopBtn.style.display = 'none';

                updateStreamContent('✅ AI判断完成\n');
            } catch (error) {
                ErrorHandler.handle(error, 'aliasMerge');
                updateStreamContent(`❌ AI判断失败: ${error.message}\n`);
                btn.disabled = false;
                btn.textContent = '🤖 AI两两判断';
                stopBtn.style.display = 'none';
            }
        });

        modal.querySelector('#ttw-stop-alias').addEventListener('click', () => {
            handleStopProcessing();
            modal.querySelector('#ttw-ai-verify-alias').disabled = false;
            modal.querySelector('#ttw-ai-verify-alias').textContent = '🤖 AI两两判断';
            modal.querySelector('#ttw-stop-alias').style.display = 'none';
        });

        modal.querySelector('#ttw-confirm-alias').addEventListener('click', async () => {
            await handleAliasMergeConfirm(modal, aiResultByCategory);
        });
    }

    function verifyDuplicatesWithAI(suspectedGroups, useParallel = true, threshold = 5, categoryName = '角色') {
        return mergedService.verifyDuplicatesWithAI(suspectedGroups, useParallel, threshold, categoryName);
    }

    function mergeConfirmedDuplicates(aiResult, categoryName = '角色') {
        return mergedService.mergeConfirmedDuplicates(aiResult, categoryName);
    }

    function deleteWorldbookEntry(category, entryName) {
        const normalizedCategory = String(category || '').trim();
        const normalizedEntryName = String(entryName || '').trim();

        if (!normalizedCategory || !normalizedEntryName) {
            return { success: false, error: '删除失败：分类或条目名为空' };
        }

        const resolved = mergedService.resolveDisplayedEntrySource(normalizedCategory, normalizedEntryName);
        if (!resolved) {
            return { success: false, error: `删除失败：未找到条目「${normalizedEntryName}」` };
        }

        let sourceEntries = null;
        if (resolved.sourceType === 'generated') {
            sourceEntries = AppState.worldbook.generated?.[normalizedCategory];
        } else if (resolved.sourceType === 'volume' && Number.isInteger(resolved.volumeIndex)) {
            const volume = (AppState.worldbook.volumes || []).find((item) => item.volumeIndex === resolved.volumeIndex);
            sourceEntries = volume?.worldbook?.[normalizedCategory];
        }

        if (!sourceEntries || !sourceEntries[resolved.actualName]) {
            return { success: false, error: `删除失败：源数据中不存在「${normalizedEntryName}」` };
        }

        delete sourceEntries[resolved.actualName];

        if (resolved.sourceType === 'generated') {
            const positionMap = AppState.config?.entryPosition;
            if (positionMap && typeof positionMap === 'object') {
                const configKey = `${normalizedCategory}::${resolved.actualName}`;
                if (Object.prototype.hasOwnProperty.call(positionMap, configKey)) {
                    delete positionMap[configKey];
                }
            }
        }

        Logger.info(
            'WorldbookDelete',
            `删除条目: [${normalizedCategory}] ${resolved.actualName} (source=${resolved.sourceType}${resolved.sourceType === 'volume' ? `#${resolved.volumeIndex + 1}` : ''})`
        );

        return {
            success: true,
            category: normalizedCategory,
            entryName: resolved.actualName,
            sourceType: resolved.sourceType,
            sourceVolumeIndex: resolved.sourceType === 'volume' ? resolved.volumeIndex : AppState.worldbook.currentVolumeIndex,
        };
    }

    return {
        showConsolidateCategorySelector,
        showManualMergeUI,
        showAliasMergeUI,
        deleteWorldbookEntry,
        verifyDuplicatesWithAI,
        mergeConfirmedDuplicates,
    };
}
