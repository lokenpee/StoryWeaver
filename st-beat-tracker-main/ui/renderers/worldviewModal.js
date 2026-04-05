// ui/renderers/worldviewModal.js
// 世界观词条详情模态框相关的渲染逻辑

/**
 * @description 显示世界观词条详情面板（内嵌展开式）
 * @param {string} itemId - 词条ID
 * @param {string} category - 类别（如 'locations', 'items'）
 * @param {string} categoryName - 类别中文名（如 '地点', '物品'）
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否进入编辑模式
 * @param {boolean} isNew - 是否是新建词条
 */
export function showWorldviewDetailModal(itemId, category, categoryName, chapterState, editMode = false, isNew = false) {
    let item = chapterState.staticMatrices.worldview[category]?.[itemId];

    // 如果是新建词条，创建空对象
    if (isNew) {
        item = {
            name: '',
            description: ''
        };
    }

    if (!item && !isNew) return;

    const isEditMode = editMode || isNew;

    // 获取分类图标
    const getCategoryIcon = () => {
        const iconMap = {
            'locations': 'map-location-dot',
            'items': 'box',
            'factions': 'flag',
            'concepts': 'lightbulb',
            'events': 'clock-rotate-left',
            'races': 'dragon'
        };
        return iconMap[category] || 'file-lines';
    };

    // 构建详细信息HTML
    const detailHtml = `
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-${getCategoryIcon()}"></i>
                ${isEditMode ? `<input type="text" class="sbt-worldview-name-input" data-path="name" value="${item.name || ''}" placeholder="输入${categoryName}名称" />` : (item.name || itemId)}
            </div>
            <div class="sbt-character-detail-identity">
                <i class="fa-solid fa-tag"></i> ${categoryName}${isNew ? ' · 新建中' : ''}
            </div>
            <div class="sbt-character-detail-actions">${isEditMode ? `<button class="sbt-save-worldview-item-btn" data-item-id="${itemId}" data-category="${category}" data-is-new="${isNew}"><i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建' : '保存修改'}</button><button class="sbt-cancel-worldview-edit-btn" data-item-id="${itemId}"><i class="fa-solid fa-times fa-fw"></i> 取消</button>${!isNew ? `<button class="sbt-delete-worldview-item-btn" data-item-id="${itemId}" data-category="${category}"><i class="fa-solid fa-trash fa-fw"></i> 删除</button>` : ''}` : `<button class="sbt-edit-worldview-mode-toggle" data-item-id="${itemId}" data-category="${category}" data-category-name="${categoryName}"><i class="fa-solid fa-pen-to-square"></i> 编辑</button><button class="sbt-delete-worldview-item-btn" data-item-id="${itemId}" data-category="${category}"><i class="fa-solid fa-trash"></i> 删除</button>`}</div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-align-left"></i>详细描述</div>
            <div class="sbt-character-detail-section-content">${isEditMode ? `<div class="sbt-worldview-edit-wrapper"><textarea class="sbt-worldview-textarea" data-path="description" placeholder="请输入${categoryName}的详细描述信息...&#10;&#10;提示：&#10;- 可以包含外观、特点、历史背景等&#10;- 支持多行文本&#10;- 内容将用于AI角色扮演的参考">${item.description || item.summary || ''}</textarea><div class="sbt-worldview-edit-tips"><i class="fa-solid fa-circle-info"></i><span>编辑完成后记得点击保存按钮</span></div></div>` : `<div class="sbt-worldview-content">${item.description || item.summary ? `<p class="sbt-text-content">${(item.description || item.summary).replace(/\n/g, '<br>')}</p>` : '<p class="sbt-empty-text">暂无描述信息</p>'}</div>`}</div>
        </div>
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-worldview-detail-panel');
    const $content = $('#sbt-worldview-detail-content');

    $content.attr('data-item-id', itemId);
    $content.attr('data-category', category);
    $content.attr('data-category-name', categoryName);
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
