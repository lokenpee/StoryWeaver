// ui/renderers/relationshipModal.js
// 关系图谱详情模态框

import { mapValueToHue } from '../../utils/colorUtils.js';
import { sbtConsole } from '../../utils/sbtConsole.js';

const hasEnglishLetters = (value) => /[A-Za-z]/.test(value || '');
const ensureChineseLabel = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    return hasEnglishLetters(text) ? fallback : text;
};

/**
 * 显示关系详情面板
 * @param {string} edgeId - 关系边ID
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否为编辑模式
 * @param {boolean} isNew - 是否为新建关系
 */
export function showRelationshipDetailModal(edgeId, chapterState, editMode = false, isNew = false) {
    const relationshipGraph = chapterState?.staticMatrices?.relationship_graph;
    let edge = relationshipGraph?.edges?.find(e => e.id === edgeId);

    // 如果是新建关系，创建空对象
    if (isNew) {
        edge = {
            id: edgeId,
            participants: ['', ''],
            type: '',
            type_label: '',
            relationship_label: '',
            emotional_weight: 5,
            timeline: {
                meeting_status: '未知',
                separation_state: false,
                last_interaction: '故事开始前'
            },
            narrative_status: {
                unresolved_tension: [],
                major_events: [],
                first_scene_together: false
            },
            tension_engine: {
                conflict_source: '',
                personality_chemistry: '',
                cognitive_gap: ''
            }
        };
    }

    if (!edge && !isNew) {
        sbtConsole.error('[SBT] 找不到关系边:', edgeId);
        return;
    }

    // 获取角色名称
    const characters = chapterState.staticMatrices.characters || {};
    const getCharName = (charId) => {
        const char = characters[charId];
        return char?.core?.name || char?.name || charId.replace('char_', '');
    };

    const participant1 = edge.participants[0] ? getCharName(edge.participants[0]) : '';
    const participant2 = edge.participants[1] ? getCharName(edge.participants[1]) : '';
    const relationshipLabel = ensureChineseLabel(edge.relationship_label, '尚未命名的关系');
    const meetingStatus = (edge.timeline?.meeting_status || '未知').trim();
    const rawSeparationState = edge.timeline?.separation_state;
    const isSeparated = typeof rawSeparationState === 'boolean'
        ? rawSeparationState
        : edge.timeline?.reunion_pending === true;
    const separationText = isSeparated ? '物理分离' : '同处一地';
    const lastInteraction = edge.timeline?.last_interaction || '故事开始前';
    const unfamiliarStatuses = new Set(['陌生人', '点头之交', '单方面认识']);
    const pendingMeeting = meetingStatus
        ? unfamiliarStatuses.has(meetingStatus)
        : edge.narrative_status?.first_scene_together === false;

    // 关系类型翻译
    const typeTranslations = {
        'childhood_friends': '青梅旧盟',
        'enemies': '宿敌对峙',
        'lovers': '恋人羁绊',
        'stranger_with_history': '陌路旧识'
    };
    const rawTypeText = edge.type_label || typeTranslations[edge.type] || edge.type || '';
    const typeText = ensureChineseLabel(rawTypeText, relationshipLabel || '未知关系');

    // 计算情感权重等级
    const weight = edge.emotional_weight || 0;
    let weightClass = 'weight-low';
    let weightLabel = '较低';
    if (weight >= 9) {
        weightClass = 'weight-critical';
        weightLabel = '极高';
    } else if (weight >= 7) {
        weightClass = 'weight-high';
        weightLabel = '高';
    } else if (weight >= 4) {
        weightClass = 'weight-medium';
        weightLabel = '中等';
    }

    // 状态标签
    let statusHtml = '';
    if (pendingMeeting) {
        statusHtml = '<span class="sbt-rel-status-badge first-meeting"><i class="fa-solid fa-handshake"></i> 待熟识</span>';
    } else if (isSeparated) {
        statusHtml = '<span class="sbt-rel-status-badge separated"><i class="fa-solid fa-route"></i> 物理分离</span>';
    } else {
        statusHtml = '<span class="sbt-rel-status-badge active"><i class="fa-solid fa-check"></i> 互动进行中</span>';
    }

    // 未解决张力
    let tensionsHtml = '';
    const tensions = Array.isArray(edge.narrative_status?.unresolved_tension)
        ? edge.narrative_status.unresolved_tension
        : [];
    if (tensions.length > 0 || editMode) {
        tensionsHtml = '<div class="sbt-rel-detail-field"><div class="sbt-rel-detail-label"><i class="fa-solid fa-bolt"></i> 未解张力</div><div class="sbt-rel-detail-value"><div class="sbt-rel-tension-tags">';

        if (editMode) {
            // 编辑模式：可编辑的标签
            tensions.forEach((tension, index) => {
                tensionsHtml += `
                    <span class="sbt-rel-tension-tag sbt-rel-tension-editable" contenteditable="true" data-tension-index="${index}">${tension}</span>
                    <i class="fa-solid fa-xmark sbt-tension-delete" data-tension-index="${index}"></i>
                `;
            });
            tensionsHtml += '<button class="sbt-add-tension-btn"><i class="fa-solid fa-plus fa-fw"></i> 添加张力</button>';
        } else {
            // 查看模式：只读标签
            tensions.forEach(tension => {
                tensionsHtml += `<span class="sbt-rel-tension-tag">${tension}</span>`;
            });
        }

        tensionsHtml += '</div></div></div>';
    }

    // 重大事件
    let eventsHtml = '';
    const events = Array.isArray(edge.narrative_status?.major_events)
        ? edge.narrative_status.major_events
        : [];
    if (events.length > 0) {
        eventsHtml = '<div class="sbt-rel-detail-field"><div class="sbt-rel-detail-label"><i class="fa-solid fa-bookmark"></i> 重大事件</div><div class="sbt-rel-detail-value">';
        events.forEach(event => {
            const impact = event.emotional_impact || 0;
            const impactColor = mapValueToHue(impact * 10);
            eventsHtml += `
                <div class="sbt-rel-event-card">
                    <div class="sbt-rel-event-content">${event.event}</div>
                    <div class="sbt-rel-event-meta">
                        <span class="sbt-rel-event-chapter">${event.chapter || '未知章节'}</span>
                        <span class="sbt-rel-event-impact" style="color: ${impactColor}">
                            <i class="fa-solid fa-heart"></i> ${impact}/10
                        </span>
                    </div>
                </div>
            `;
        });
        eventsHtml += '</div></div>';
    }

    // 编辑模式状态
    const isEditMode = editMode || isNew;

    // 编辑按钮HTML
    const editButtonsHtml = isEditMode ? `
        <div class="sbt-rel-modal-actions">
            <button class="sbt-save-relationship-btn" data-edge-id="${edgeId}" data-is-new="${isNew}">
                <i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建关系' : '保存'}
            </button>
            <button class="sbt-cancel-relationship-edit-btn" data-edge-id="${edgeId}">
                <i class="fa-solid fa-times fa-fw"></i> 取消
            </button>
            ${!isNew ? `
            <button class="sbt-delete-relationship-btn" data-edge-id="${edgeId}">
                <i class="fa-solid fa-trash fa-fw"></i> 删除
            </button>
            ` : ''}
        </div>
    ` : `
        <div class="sbt-rel-modal-actions">
            <button class="sbt-edit-relationship-mode-toggle" data-edge-id="${edgeId}">
                <i class="fa-solid fa-pen-to-square fa-fw"></i> 编辑
            </button>
            <button class="sbt-delete-relationship-btn" data-edge-id="${edgeId}">
                <i class="fa-solid fa-trash fa-fw"></i> 删除
            </button>
        </div>
    `;

    // 张力引擎文本
    const tensionEngine = edge.tension_engine || {};
    const conflictSource = tensionEngine.conflict_source || '暂无冲突说明。';
    const personalityChemistry = tensionEngine.personality_chemistry || '暂无相处模式描述。';
    const cognitiveGap = tensionEngine.cognitive_gap || '无';
    const tensionEngineHtml = `
        <div class="sbt-rel-detail-field">
            <div class="sbt-rel-detail-label"><i class="fa-solid fa-fire"></i> 张力引擎</div>
            <div class="sbt-rel-detail-value sbt-rel-tension-engine">
                <p><strong>冲突源：</strong>${conflictSource}</p>
                <p><strong>性格化学：</strong>${personalityChemistry}</p>
                <p><strong>认知差：</strong>${cognitiveGap}</p>
            </div>
        </div>
    `;

    // 构建角色选择器（新建模式）
    let participantSelectorHtml = '';
    if (isNew || isEditMode) {
        const characterOptions = Object.entries(characters).map(([id, char]) => {
            const name = char?.core?.name || char?.name || id;
            return `<option value="${id}">${name}</option>`;
        }).join('');

        participantSelectorHtml = `
            <div class="sbt-rel-participant-selectors">
                <select class="sbt-rel-participant-select" data-participant-index="0">
                    <option value="">选择角色1</option>
                    ${characterOptions}
                </select>
                <i class="fa-solid fa-heart" style="color: var(--sbt-primary-accent); font-size: 1.2em;"></i>
                <select class="sbt-rel-participant-select" data-participant-index="1">
                    <option value="">选择角色2</option>
                    ${characterOptions}
                </select>
            </div>
        `;

        // 如果不是新建，设置选中的值
        if (!isNew) {
            setTimeout(() => {
                $(`.sbt-rel-participant-select[data-participant-index="0"]`).val(edge.participants[0]);
                $(`.sbt-rel-participant-select[data-participant-index="1"]`).val(edge.participants[1]);
            }, 0);
        }
    }

    // 构建详情HTML
    const detailHtml = `
        <div class="sbt-relationship-detail-modal">
            <div class="sbt-rel-modal-header">
                <div class="sbt-rel-modal-title-row">
                    <div class="sbt-rel-modal-title">
                        ${(isNew || isEditMode) ? participantSelectorHtml : `
                            <span class="sbt-rel-participant">${participant1}</span>
                            <i class="fa-solid fa-heart" style="color: var(--sbt-primary-accent); font-size: 1.2em;"></i>
                            <span class="sbt-rel-participant">${participant2}</span>
                        `}
                        ${isNew ? '<span style="color: var(--sbt-warning-color); margin-left: 10px;">· 新建中</span>' : ''}
                    </div>
                    ${editButtonsHtml}
                </div>
                <div class="sbt-rel-relationship-label">
                    ${isEditMode ? `
                        <input type="text" class="sbt-rel-label-input" data-field="relationship_label" value="${relationshipLabel}" placeholder="关系标签（如：师徒、宿敌等）" />
                    ` : relationshipLabel}
                </div>
                <div class="sbt-rel-modal-meta">
                    <span class="sbt-rel-type-badge">${typeText}</span>
                    ${statusHtml}
                </div>
            </div>

            <div class="sbt-rel-modal-body">
                <!-- 情感权重 -->
                <div class="sbt-rel-detail-field sbt-rel-weight-field">
                    <div class="sbt-rel-detail-label">
                        <i class="fa-solid fa-chart-line"></i>
                        情感权重
                    </div>
                    <div class="sbt-rel-detail-value">
                        <div class="sbt-rel-weight-display">
                            ${editMode ? `
                                <input type="number"
                                       class="sbt-rel-weight-input"
                                       data-field="emotional_weight"
                                       value="${weight}"
                                       min="0"
                                       max="10"
                                       step="1" />
                                <span class="sbt-rel-weight-hint">输入 0-10 的数值</span>
                            ` : `
                                <div class="sbt-rel-weight-bar">
                                    <div class="sbt-rel-weight-fill ${weightClass}" style="width: ${weight * 10}%;"></div>
                                </div>
                                <div class="sbt-rel-weight-info">
                                    <span class="sbt-rel-weight-value">${weight}/10</span>
                                    <span class="sbt-rel-weight-label">${weightLabel}</span>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <!-- 时间线信息 -->
                <div class="sbt-rel-timeline-section">
                    <div class="sbt-rel-section-title"><i class="fa-solid fa-timeline"></i> 时间线</div>
                    <div class="sbt-rel-timeline-grid">
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-calendar-days"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">相识程度</div>
                                <div class="sbt-rel-timeline-value">${meetingStatus || '未知'}</div>
                            </div>
                        </div>
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-hourglass-half"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">空间状态</div>
                                <div class="sbt-rel-timeline-value">${separationText}</div>
                            </div>
                        </div>
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-clock"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">最后互动</div>
                                <div class="sbt-rel-timeline-value">${lastInteraction}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 张力引擎三维文本 -->
                ${tensionEngineHtml}

                <!-- 未解张力 -->
                ${tensionsHtml}

                <!-- 重大事件 -->
                ${eventsHtml}
            </div>
        </div>
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-relationship-detail-panel');
    const $content = $('#sbt-relationship-detail-content');

    $content.attr('data-edge-id', edgeId);
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
