export function createEntryConfigModals(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        saveCurrentSettings,
        saveCustomCategories,
        updateWorldbookPreview,
    } = deps;

    function showEntryConfigModal(category, entryName) {
        const existingModal = document.getElementById('ttw-entry-config-modal');
        if (existingModal) existingModal.remove();

        const config = getEntryConfig(category, entryName);

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">配置此条目在导出为SillyTavern格式时的位置、深度和顺序</div>
		</div>

		<div class="ttw-form-group">
			<label>位置 (Position)</label>
			<select id="ttw-entry-position" class="ttw-select">
				<option value="0" ${config.position === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>深度 (Depth) - 仅Position=4时有效</label>
			<input type="number" id="ttw-entry-depth" class="ttw-input" value="${config.depth}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>顺序 (Order) - 数字越小越靠前</label>
			<input type="number" id="ttw-entry-order" class="ttw-input" value="${config.order}" min="0" max="9999">
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-entry-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-entry-config">💾 保存</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-entry-config-modal',
            title: `⚙️ 条目配置: ${entryName}`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-entry-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-entry-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-entry-position').value, 10);
            const depth = parseInt(modal.querySelector('#ttw-entry-depth').value, 10) || 4;
            const order = parseInt(modal.querySelector('#ttw-entry-order').value, 10) || 100;

            setEntryConfig(category, entryName, { position, depth, order });
            ModalFactory.close(modal);
            ErrorHandler.showUserSuccess('配置已保存');
        });
    }

    function showPlotOutlineConfigModal() {
        const existingModal = document.getElementById('ttw-plot-config-modal');
        if (existingModal) existingModal.remove();

        const config = AppState.config.plotOutline;

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">设置"剧情大纲"分类在导出为SillyTavern格式时的默认位置/深度/顺序。此配置会随"导出配置"一起保存。</div>
		</div>

		<div class="ttw-form-group">
			<label>默认位置 (Position)</label>
			<select id="ttw-plot-config-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>默认深度 (Depth) - 仅Position=4时有效</label>
			<input type="number" id="ttw-plot-config-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>默认起始顺序 (Order)</label>
			<input type="number" id="ttw-plot-config-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-plot-config-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
					<div class="ttw-setting-hint">勾选后剧情大纲下的条目顺序会从起始值开始递增（100,101,102...）</div>
				</div>
			</label>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-plot-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-plot-config">💾 保存</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-plot-config-modal',
            title: '⚙️ 剧情大纲 - 导出时的默认配置',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-plot-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-plot-config').addEventListener('click', () => {
            AppState.config.plotOutline = {
                position: parseInt(modal.querySelector('#ttw-plot-config-position').value, 10) || 0,
                depth: parseInt(modal.querySelector('#ttw-plot-config-depth').value, 10) || 4,
                order: parseInt(modal.querySelector('#ttw-plot-config-order').value, 10) || 100,
                autoIncrementOrder: modal.querySelector('#ttw-plot-config-auto-increment').checked,
            };

            setCategoryDefaultConfig('剧情大纲', AppState.config.plotOutline);
            saveCurrentSettings();
            ModalFactory.close(modal);
            ErrorHandler.showUserSuccess('剧情大纲导出配置已保存！');
        });
    }

    function showCategoryConfigModal(category) {
        const existingModal = document.getElementById('ttw-category-config-modal');
        if (existingModal) existingModal.remove();

        let config = AppState.config.categoryDefault[category];
        if (!config) {
            const catConfig = AppState.persistent.customCategories.find((c) => c.name === category);
            if (catConfig) {
                config = {
                    position: catConfig.defaultPosition || 0,
                    depth: catConfig.defaultDepth || 4,
                    order: catConfig.defaultOrder || 100,
                    autoIncrementOrder: catConfig.autoIncrementOrder || false,
                };
            } else {
                config = { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
            }
        }

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">设置此分类下所有条目的默认位置/深度/顺序。单个条目的配置会覆盖分类默认配置。</div>
		</div>

		<div class="ttw-form-group">
			<label>默认位置 (Position)</label>
			<select id="ttw-cat-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>默认深度 (Depth)</label>
			<input type="number" id="ttw-cat-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>默认起始顺序 (Order)</label>
			<input type="number" id="ttw-cat-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-cat-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
					<div class="ttw-setting-hint">勾选后同分类下的条目顺序会从起始值开始递增（100,101,102...）</div>
				</div>
			</label>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-apply-to-existing">
				<span>同时应用到该分类下已有的所有条目</span>
			</label>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-cat-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-cat-config">💾 保存</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-category-config-modal',
            title: `⚙️ 分类默认配置: ${category}`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-cat-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-cat-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-cat-position').value, 10);
            const depth = parseInt(modal.querySelector('#ttw-cat-depth').value, 10) || 4;
            const order = parseInt(modal.querySelector('#ttw-cat-order').value, 10) || 100;
            const autoIncrementOrder = modal.querySelector('#ttw-cat-auto-increment').checked;
            const applyToExisting = modal.querySelector('#ttw-apply-to-existing').checked;

            setCategoryDefaultConfig(category, { position, depth, order, autoIncrementOrder });

            if (applyToExisting && AppState.worldbook.generated[category]) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    setEntryConfig(category, entryName, { position, depth, order });
                }
            }

            const catIndex = AppState.persistent.customCategories.findIndex((c) => c.name === category);
            if (catIndex !== -1) {
                AppState.persistent.customCategories[catIndex].defaultPosition = position;
                AppState.persistent.customCategories[catIndex].defaultDepth = depth;
                AppState.persistent.customCategories[catIndex].defaultOrder = order;
                AppState.persistent.customCategories[catIndex].autoIncrementOrder = autoIncrementOrder;
                saveCustomCategories();
            }

            ModalFactory.close(modal);
            if (typeof updateWorldbookPreview === 'function') updateWorldbookPreview();
            ErrorHandler.showUserSuccess('配置已保存');
        });
    }

    return {
        showEntryConfigModal,
        showPlotOutlineConfigModal,
        showCategoryConfigModal,
    };
}
