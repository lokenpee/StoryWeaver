// ui/renderers/storylineModal.js
// 故事线详情模态框相关的渲染逻辑

/**
 * @description 显示故事线详情面板（内嵌展开式）
 * @param {string} lineId - 故事线ID
 * @param {string} category - 类别（如 'main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'）
 * @param {string} categoryName - 类别中文名（如 '主线任务', '支线任务', '关系线', '个人线'）
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否进入编辑模式
 * @param {boolean} isNew - 是否是新建故事线
 */
export function showStorylineDetailModal(lineId, category, categoryName, chapterState, editMode = false, isNew = false) {
    // 从静态和动态数据中提取故事线信息
    let staticData = chapterState.staticMatrices.storylines?.[category]?.[lineId];
    let dynamicData = chapterState.dynamicState.storylines?.[category]?.[lineId];

    // 如果是新建故事线，创建空对象
    if (isNew) {
        staticData = {
            title: '',
            summary: '',
            type: category,
            trigger: '玩家主动触发',
            involved_chars: []
        };
        dynamicData = {
            current_status: 'active',
            current_summary: '',
            history: [],
            player_supplement: ''
        };
    }

    if (!staticData && !isNew) return;

    const isEditMode = editMode || isNew;
    const isStaticArchiveMode = chapterState?.__source === 'static_cache' || chapterState?.uid === 'temp_cached_view';

    // 合并静态和动态数据
    const mergedData = {
        title: staticData?.title || '',
        summary: staticData?.summary || '',
        type: staticData?.type || category,
        trigger: staticData?.trigger || '玩家主动触发',
        involved_chars: staticData?.involved_chars || [],
        current_status: dynamicData?.current_status || 'active',
        current_summary: dynamicData?.current_summary || staticData?.summary || '',
        history: dynamicData?.history || [],
        player_supplement: dynamicData?.player_supplement || ''
    };

    // 获取分类图标
    const getCategoryIcon = () => {
        const iconMap = {
            'main_quests': 'flag-checkered',
            'side_quests': 'compass',
            'relationship_arcs': 'heart',
            'personal_arcs': 'user-circle'
        };
        return iconMap[category] || 'book';
    };

    // 获取状态徽章
    const getStatusBadge = (status) => {
        const statusMap = {
            'active': { text: '进行中', class: 'status-active', icon: 'circle-play' },
            'completed': { text: '已完成', class: 'status-completed', icon: 'circle-check' },
            'paused': { text: '已暂停', class: 'status-paused', icon: 'circle-pause' },
            'failed': { text: '已失败', class: 'status-failed', icon: 'circle-xmark' }
        };
        const info = statusMap[status] || statusMap['active'];
        return `<span class="sbt-status-badge ${info.class}"><i class="fa-solid fa-${info.icon}"></i> ${info.text}</span>`;
    };

    // 渲染历史记录
    let historyHtml = '';
    if (isEditMode || (mergedData.history && mergedData.history.length > 0)) {
        historyHtml = '<div class="sbt-storyline-history"><div class="sbt-storyline-history-title"><i class="fa-solid fa-clock-rotate-left"></i> 进展历史';
        if (isEditMode) {
            historyHtml += '<button class="sbt-add-history-entry-btn"><i class="fa-solid fa-plus"></i> 新增条目</button>';
        }
        historyHtml += '</div>';

        if (mergedData.history && mergedData.history.length > 0) {
            mergedData.history.forEach((entry, idx) => {
                const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN') : '未知时间';
                const timestampISO = entry.timestamp || new Date().toISOString();
                const chapterNum = entry.chapter !== undefined ? entry.chapter : '';
                const status = entry.status || 'active';
                const summary = entry.summary || '';

                if (isEditMode) {
                    historyHtml += `
                        <div class="sbt-history-entry sbt-history-entry-editable" data-index="${idx}">
                            <div class="sbt-history-entry-header">
                                <input type="datetime-local" class="sbt-history-timestamp-input" data-index="${idx}" value="${timestampISO.substring(0, 16)}" />
                                <input type="number" class="sbt-history-chapter-input" data-index="${idx}" placeholder="章节号" value="${chapterNum}" min="0" />
                                <select class="sbt-history-status-select" data-index="${idx}">
                                    <option value="active" ${status === 'active' ? 'selected' : ''}>进行中</option>
                                    <option value="completed" ${status === 'completed' ? 'selected' : ''}>已完成</option>
                                    <option value="paused" ${status === 'paused' ? 'selected' : ''}>已暂停</option>
                                    <option value="failed" ${status === 'failed' ? 'selected' : ''}>已失败</option>
                                </select>
                                <button class="sbt-delete-history-entry-btn" data-index="${idx}" title="删除此条目"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <textarea class="sbt-history-summary-input" data-index="${idx}" placeholder="请输入进展摘要...">${summary}</textarea>
                        </div>
                    `;
                } else {
                    historyHtml += `
                        <div class="sbt-history-entry">
                            <div class="sbt-history-entry-header">
                                <span class="sbt-history-timestamp">${timestamp} ${chapterNum ? `第${chapterNum}章` : ''}</span>
                                <span class="sbt-history-status">${getStatusBadge(status)}</span>
                            </div>
                            <div class="sbt-history-summary">${summary || '无摘要'}</div>
                        </div>
                    `;
                }
            });
        } else if (isEditMode) {
            historyHtml += '<div class="sbt-empty-text">暂无历史记录，点击上方按钮新增</div>';
        }
        historyHtml += '</div>';
    }

    // 渲染涉及角色列表
    let involvedCharsHtml = '';
    if (mergedData.involved_chars && mergedData.involved_chars.length > 0) {
        involvedCharsHtml = '<div class="sbt-involved-chars">';
        mergedData.involved_chars.forEach(charId => {
            const charData = chapterState.staticMatrices.characters?.[charId];
            const charName = charData?.core?.name || charData?.name || charId;
            if (isEditMode) {
                involvedCharsHtml += `<span class="sbt-tag sbt-tag-editable" data-char-id="${charId}">${charName}<i class="fa-solid fa-xmark sbt-char-tag-delete" data-char-id="${charId}"></i></span>`;
            } else {
                involvedCharsHtml += `<span class="sbt-tag">${charName}</span>`;
            }
        });
        if (isEditMode) {
            involvedCharsHtml += `<button class="sbt-char-tag-add-btn"><i class="fa-solid fa-plus"></i></button>`;
        }
        involvedCharsHtml += '</div>';
    } else {
        involvedCharsHtml = isEditMode
            ? '<div class="sbt-involved-chars"><span class="sbt-empty-text">暂无涉及角色</span><button class="sbt-char-tag-add-btn"><i class="fa-solid fa-plus"></i></button></div>'
            : '<span class="sbt-empty-text">暂无涉及角色</span>';
    }

    // 构建详细信息HTML
    const staticModeBanner = isStaticArchiveMode
        ? `<div class="sbt-static-edit-banner"><i class="fa-solid fa-database"></i> 当前正处于「静态档案编辑模式」，保存后会直接写入世界档案，供未来的新故事使用。</div>`
        : '';

    const detailHtml = `
        ${staticModeBanner}
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-${getCategoryIcon()}"></i>
                ${isEditMode ? `<input type="text" class="sbt-storyline-name-input" data-path="title" value="${mergedData.title}" placeholder="输入故事线标题" />` : mergedData.title}
            </div>
            <div class="sbt-character-detail-identity">
                <i class="fa-solid fa-tag"></i> ${categoryName}
                ${!isEditMode ? ` · ${getStatusBadge(mergedData.current_status)}` : ''}
                ${isNew ? ' · <span style="color: var(--sbt-warning-color);">新建中</span>' : ''}
            </div>
            <div class="sbt-character-detail-actions">
                ${isEditMode ? `
                    <button class="sbt-save-storyline-btn" data-line-id="${lineId}" data-category="${category}" data-is-new="${isNew}">
                        <i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建故事线' : '保存修改'}
                    </button>
                    <button class="sbt-cancel-storyline-edit-btn" data-line-id="${lineId}">
                        <i class="fa-solid fa-times fa-fw"></i> 取消
                    </button>
                    ${!isNew ? `
                        <button class="sbt-delete-storyline-btn" data-line-id="${lineId}" data-category="${category}">
                            <i class="fa-solid fa-trash fa-fw"></i> 删除
                        </button>
                    ` : ''}
                ` : `
                    <button class="sbt-edit-storyline-mode-toggle" data-line-id="${lineId}" data-category="${category}" data-category-name="${categoryName}">
                        <i class="fa-solid fa-pen-to-square"></i> 编辑故事线
                    </button>
                    <button class="sbt-delete-storyline-btn" data-line-id="${lineId}" data-category="${category}">
                        <i class="fa-solid fa-trash"></i> 删除
                    </button>
                `}
            </div>
        </div>

        ${isEditMode ? `
            <div class="sbt-character-detail-section">
                <div class="sbt-character-detail-section-title"><i class="fa-solid fa-toggle-on"></i>状态</div>
                <div class="sbt-character-detail-section-content">
                    <select class="sbt-storyline-status-select" data-path="current_status">
                        <option value="active" ${mergedData.current_status === 'active' ? 'selected' : ''}>进行中</option>
                        <option value="completed" ${mergedData.current_status === 'completed' ? 'selected' : ''}>已完成</option>
                        <option value="paused" ${mergedData.current_status === 'paused' ? 'selected' : ''}>已暂停</option>
                        <option value="failed" ${mergedData.current_status === 'failed' ? 'selected' : ''}>已失败</option>
                    </select>
                </div>
            </div>
        ` : ''}

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-align-left"></i>初始摘要</div>
            <div class="sbt-character-detail-section-content">
                ${isEditMode ? `
                    <div class="sbt-storyline-edit-wrapper">
                        <textarea class="sbt-storyline-textarea" data-path="summary" placeholder="请输入故事线的初始摘要...&#10;&#10;提示：&#10;- 描述故事线的起点和目标&#10;- 说明这条故事线的核心冲突或主题&#10;- 内容将用于AI设计章节的参考">${mergedData.summary}</textarea>
                        <div class="sbt-storyline-edit-tips">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>初始摘要用于AI参考,描述故事线的起点</span>
                        </div>
                    </div>
                ` : `
                    <div class="sbt-storyline-content">
                        ${mergedData.summary ? `<p class="sbt-text-content">${mergedData.summary.replace(/\n/g, '<br>')}</p>` : '<p class="sbt-empty-text">暂无初始摘要</p>'}
                    </div>
                `}
            </div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-newspaper"></i>当前进展</div>
            <div class="sbt-character-detail-section-content">
                ${isEditMode ? `
                    <div class="sbt-storyline-edit-wrapper">
                        <textarea class="sbt-storyline-textarea" data-path="current_summary" placeholder="请输入故事线的当前进展...&#10;&#10;提示：&#10;- 描述故事线的最新状态&#10;- 说明已完成的里程碑&#10;- AI会参考这个内容来设计下一章">${mergedData.current_summary}</textarea>
                        <div class="sbt-storyline-edit-tips">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>当前进展会随着章节推进自动更新</span>
                        </div>
                    </div>
                ` : `
                    <div class="sbt-storyline-content">
                        ${mergedData.current_summary ? `<p class="sbt-text-content">${mergedData.current_summary.replace(/\n/g, '<br>')}</p>` : '<p class="sbt-empty-text">暂无当前进展</p>'}
                    </div>
                `}
            </div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-user-pen"></i>玩家意见补充（最高优先级）</div>
            <div class="sbt-character-detail-section-content">
                ${isEditMode ? `
                    <div class="sbt-storyline-edit-wrapper sbt-player-supplement-wrapper">
                        <textarea class="sbt-storyline-textarea sbt-player-supplement-textarea" data-path="player_supplement" placeholder="请输入玩家对本故事线的补充或限制...&#10;&#10;提示：&#10;- 记录玩家的意志、底线或必须达成的目标&#10;- 这里的内容会随故事线一起发送给所有AI，优先级最高">${mergedData.player_supplement}</textarea>
                        <div class="sbt-storyline-edit-tips sbt-player-supplement-tip">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>玩家补充被当做强制指令，所有AI必须无条件执行。</span>
                        </div>
                    </div>
                ` : `
                    <div class="sbt-storyline-player-supplement-view">
                        ${mergedData.player_supplement
                            ? `<p class="sbt-text-content">${mergedData.player_supplement.replace(/\n/g, '<br>')}</p>`
                            : '<p class="sbt-empty-text">暂无玩家补充</p>'}
                    </div>
                `}
            </div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-bolt"></i>触发条件</div>
            <div class="sbt-character-detail-section-content">
                ${isEditMode ? `
                    <input type="text" class="sbt-storyline-trigger-input" data-path="trigger" value="${mergedData.trigger}" placeholder="例如: 玩家主动触发、完成前置任务后、到达特定地点时" />
                ` : `
                    <p class="sbt-text-content">${mergedData.trigger}</p>
                `}
            </div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-users"></i>涉及角色</div>
            <div class="sbt-character-detail-section-content">
                ${involvedCharsHtml}
            </div>
        </div>

        ${historyHtml ? `
            <div class="sbt-character-detail-section">
                ${historyHtml}
            </div>
        ` : ''}
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-storyline-detail-panel');
    const $content = $('#sbt-storyline-detail-content');

    $content.attr('data-line-id', lineId);
    $content.attr('data-category', category);
    $content.attr('data-category-name', categoryName);
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
