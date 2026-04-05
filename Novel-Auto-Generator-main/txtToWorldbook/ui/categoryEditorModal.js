export function createCategoryEditorModal(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        setCategoryDefaultConfig,
        saveCustomCategories,
        renderCategoriesList,
    } = deps;

    function showEditCategoryModal(editIndex) {
        const isEdit = editIndex !== null;
        const cat = isEdit ? AppState.persistent.customCategories[editIndex] : {
            name: '',
            enabled: true,
            isBuiltin: false,
            entryExample: '',
            keywordsExample: [],
            contentGuide: '',
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false,
        };

        const body = `
                    <div class="ttw-form-group">
                        <label>分类名称 *</label>
                        <input type="text" id="ttw-cat-name" value="${cat.name}" placeholder="如：道具、玩法" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>条目名称示例</label>
                        <input type="text" id="ttw-cat-entry-example" value="${cat.entryExample}" placeholder="如：道具名称" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>关键词示例（逗号分隔）</label>
                        <input type="text" id="ttw-cat-keywords" value="${cat.keywordsExample.join(', ')}" placeholder="如：道具名, 别名" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>内容提取指南</label>
                        <textarea id="ttw-cat-content-guide" rows="4" class="ttw-textarea-small" placeholder="描述AI应该提取哪些信息...">${cat.contentGuide}</textarea>
                    </div>

                    <div style="margin-top:16px;padding:12px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);border-radius:8px;">
                        <div style="font-weight:bold;color:#9b59b6;margin-bottom:12px;">⚙️ 导出时的默认配置</div>
                        <div class="ttw-form-group">
                            <label>默认位置 (Position)</label>
                            <select id="ttw-cat-default-position" class="ttw-select">
                                <option value="0" ${(cat.defaultPosition || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
                                <option value="1" ${cat.defaultPosition === 1 ? 'selected' : ''}>在角色定义之后</option>
                                <option value="2" ${cat.defaultPosition === 2 ? 'selected' : ''}>在作者注释之前</option>
                                <option value="3" ${cat.defaultPosition === 3 ? 'selected' : ''}>在作者注释之后</option>
                                <option value="4" ${cat.defaultPosition === 4 ? 'selected' : ''}>自定义深度</option>
                            </select>
                        </div>
                        <div class="ttw-form-group">
                            <label>默认深度 (Depth) - 仅Position=4时有效</label>
                            <input type="number" id="ttw-cat-default-depth" class="ttw-input" value="${cat.defaultDepth || 4}" min="0" max="999">
                        </div>
                        <div class="ttw-form-group">
                            <label>默认起始顺序 (Order)</label>
                            <input type="number" id="ttw-cat-default-order" class="ttw-input" value="${cat.defaultOrder || 100}" min="0" max="9999">
                        </div>
                        <div style="margin-top:10px;">
                            <label class="ttw-checkbox-label" style="padding:8px;background:rgba(39,174,96,0.15);border-radius:6px;">
                                <input type="checkbox" id="ttw-cat-auto-increment" ${cat.autoIncrementOrder ? 'checked' : ''}>
                                <div>
                                    <span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
                                    <div class="ttw-setting-hint">勾选后同分类下的条目顺序会从起始值开始递增（100,101,102...）</div>
                                </div>
                            </label>
                        </div>
                    </div>
        `;

        const footer = `
                    <button class="ttw-btn" id="ttw-cancel-cat">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-save-cat">💾 保存</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-category-modal',
            title: isEdit ? '✏️ 编辑分类' : '➕ 添加分类',
            body,
            footer,
            width: '550px',
            maxHeight: '70vh',
        });

        modal.querySelector('#ttw-cancel-cat').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-cat').addEventListener('click', async () => {
            const name = document.getElementById('ttw-cat-name').value.trim();
            if (!name) { ErrorHandler.showUserError('请输入分类名称'); return; }

            const duplicateIndex = AppState.persistent.customCategories.findIndex((c, i) => c.name === name && i !== editIndex);
            if (duplicateIndex !== -1) { ErrorHandler.showUserError('该分类名称已存在'); return; }

            const entryExample = document.getElementById('ttw-cat-entry-example').value.trim();
            const keywordsStr = document.getElementById('ttw-cat-keywords').value.trim();
            const contentGuide = document.getElementById('ttw-cat-content-guide').value.trim();
            const defaultPosition = parseInt(document.getElementById('ttw-cat-default-position').value, 10) || 0;
            const defaultDepth = parseInt(document.getElementById('ttw-cat-default-depth').value, 10) || 4;
            const defaultOrder = parseInt(document.getElementById('ttw-cat-default-order').value, 10) || 100;
            const autoIncrementOrder = document.getElementById('ttw-cat-auto-increment').checked;

            const keywordsExample = keywordsStr ? keywordsStr.split(/[,，]/).map((k) => k.trim()).filter((k) => k) : [];

            const newCat = {
                name,
                enabled: isEdit ? cat.enabled : true,
                isBuiltin: isEdit ? cat.isBuiltin : false,
                entryExample: entryExample || `${name}名称`,
                keywordsExample: keywordsExample.length > 0 ? keywordsExample : [`${name}名`],
                contentGuide: contentGuide || `基于原文的${name}描述`,
                defaultPosition,
                defaultDepth,
                defaultOrder,
                autoIncrementOrder,
            };

            if (isEdit) {
                AppState.persistent.customCategories[editIndex] = newCat;
            } else {
                AppState.persistent.customCategories.push(newCat);
            }

            setCategoryDefaultConfig(name, {
                position: defaultPosition,
                depth: defaultDepth,
                order: defaultOrder,
                autoIncrementOrder,
            });

            await saveCustomCategories();
            renderCategoriesList();
            ModalFactory.close(modal);
        });
    }

    function showAddCategoryModal() {
        showEditCategoryModal(null);
    }

    return {
        showAddCategoryModal,
        showEditCategoryModal,
    };
}
