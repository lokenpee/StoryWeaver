export function createDefaultEntriesView(deps = {}) {
    const {
        AppState,
        ListRenderer,
        PerfUtils,
        EventDelegate,
        ModalFactory,
        ErrorHandler,
        saveCurrentSettings,
    } = deps;

    function saveDefaultWorldbookEntriesUI() {
        AppState.settings.defaultWorldbookEntriesUI = AppState.persistent.defaultEntries;
        saveCurrentSettings();
    }

    function renderDefaultWorldbookEntriesUI() {
        const container = document.getElementById('ttw-default-entries-list');
        if (!container) return;

        if (AppState.persistent.defaultEntries.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无默认条目，点击"添加"按钮创建</div>';
            return;
        }

        const itemsHtml = AppState.persistent.defaultEntries.map((entry, index) => `
            <div class="ttw-default-entry-item">
                <div class="ttw-default-entry-header">
                    <span class="ttw-default-entry-title">[${ListRenderer.escapeHtml(entry.category || '未分类')}] ${ListRenderer.escapeHtml(entry.name || '未命名')}</span>
                    <div class="ttw-default-entry-actions">
                        <button class="ttw-btn-tiny ttw-edit-default-entry" data-index="${index}" title="编辑">✏️</button>
                        <button class="ttw-btn-tiny ttw-delete-default-entry" data-index="${index}" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="ttw-default-entry-info">
                    <span style="color:#9b59b6;">关键词:</span> ${ListRenderer.escapeHtml((entry.keywords || []).join(', ') || '无')}
                </div>
            </div>
        `).join('');

        PerfUtils.smartUpdate(container, itemsHtml);

        if (!container.dataset.eventsBound) {
            EventDelegate.on(container, '.ttw-edit-default-entry', 'click', (e, btn) => {
                const index = parseInt(btn.dataset.index, 10);
                showEditDefaultEntryModal(index);
            });

            EventDelegate.on(container, '.ttw-delete-default-entry', 'click', async (e, btn) => {
                const index = parseInt(btn.dataset.index, 10);
                const confirmed = await ModalFactory.confirm({
                    title: '删除默认条目',
                    message: '确定删除此默认条目吗？',
                    danger: true,
                });
                if (confirmed) {
                    AppState.persistent.defaultEntries.splice(index, 1);
                    saveDefaultWorldbookEntriesUI();
                    renderDefaultWorldbookEntriesUI();
                }
            });
            container.dataset.eventsBound = 'true';
        }
    }

    function showAddDefaultEntryModal() {
        showEditDefaultEntryModal(null);
    }

    function showEditDefaultEntryModal(editIndex) {
        const isEdit = editIndex !== null;
        const entry = isEdit ? AppState.persistent.defaultEntries[editIndex] : {
            category: '',
            name: '',
            keywords: [],
            content: '',
            position: 0,
            depth: 4,
            order: 100,
        };

        const body = `
                <div class="ttw-form-group">
                    <label>分类 *</label>
                    <input type="text" id="ttw-default-entry-category" value="${entry.category}" placeholder="如：角色、地点、系统" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>条目名称 *</label>
                    <input type="text" id="ttw-default-entry-name" value="${entry.name}" placeholder="条目名称" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>关键词（逗号分隔）</label>
                    <input type="text" id="ttw-default-entry-keywords" value="${(entry.keywords || []).join(', ')}" placeholder="关键词1, 关键词2" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>内容</label>
                    <textarea id="ttw-default-entry-content" rows="6" class="ttw-textarea-small" placeholder="条目内容...">${entry.content || ''}</textarea>
                </div>
                <div class="ttw-form-group">
                    <label>位置</label>
                    <select id="ttw-default-entry-position" class="ttw-select">
                        <option value="0" ${(entry.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
                        <option value="1" ${entry.position === 1 ? 'selected' : ''}>在角色定义之后</option>
                        <option value="2" ${entry.position === 2 ? 'selected' : ''}>在作者注释之前</option>
                        <option value="3" ${entry.position === 3 ? 'selected' : ''}>在作者注释之后</option>
                        <option value="4" ${entry.position === 4 ? 'selected' : ''}>自定义深度</option>
                    </select>
                </div>
                <div class="ttw-form-group">
                    <label>深度（仅位置为"自定义深度"时有效）</label>
                    <input type="number" id="ttw-default-entry-depth" class="ttw-input" value="${entry.depth || 4}" min="0" max="999">
                </div>
                <div class="ttw-form-group">
                    <label>顺序（数字越小越靠前）</label>
                    <input type="number" id="ttw-default-entry-order" class="ttw-input" value="${entry.order || 100}" min="0" max="9999">
                </div>
        `;

        const footer = `
                <button class="ttw-btn" id="ttw-cancel-default-entry">取消</button>
                <button class="ttw-btn ttw-btn-primary" id="ttw-save-default-entry">💾 保存</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-default-entry-modal',
            title: isEdit ? '✏️ 编辑默认条目' : '➕ 添加默认条目',
            body,
            footer,
            width: '550px',
        });

        modal.querySelector('#ttw-cancel-default-entry').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-default-entry').addEventListener('click', () => {
            const category = document.getElementById('ttw-default-entry-category').value.trim();
            const name = document.getElementById('ttw-default-entry-name').value.trim();
            const keywordsStr = document.getElementById('ttw-default-entry-keywords').value.trim();
            const content = document.getElementById('ttw-default-entry-content').value;
            const position = parseInt(document.getElementById('ttw-default-entry-position').value, 10) || 0;
            const depth = parseInt(document.getElementById('ttw-default-entry-depth').value, 10) || 4;
            const order = parseInt(document.getElementById('ttw-default-entry-order').value, 10) || 100;

            if (!category) { ErrorHandler.showUserError('请输入分类'); return; }
            if (!name) { ErrorHandler.showUserError('请输入条目名称'); return; }

            const keywords = keywordsStr ? keywordsStr.split(/[,，]/).map((k) => k.trim()).filter((k) => k) : [];
            const newEntry = { category, name, keywords, content, position, depth, order };

            if (isEdit) {
                AppState.persistent.defaultEntries[editIndex] = newEntry;
            } else {
                AppState.persistent.defaultEntries.push(newEntry);
            }

            saveDefaultWorldbookEntriesUI();
            renderDefaultWorldbookEntriesUI();
            ModalFactory.close(modal);
        });
    }

    return {
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        showEditDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
    };
}
