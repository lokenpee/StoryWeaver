// ui/renderers/characterModal.js
// 角色详情模态框相关的渲染逻辑

import { mapValueToHue } from '../../utils/colorUtils.js';
import { clampAffinityValue } from '../../utils/affinityUtils.js';
import { translateField } from '../../utils/fieldTranslator.js';
import applicationFunctionManager from '../../manager.js';
import { loadDossierSchemaFromCharacter } from '../../stateManager.js';

/**
 * @description 显示角色详情面板（内嵌展开式）
 * @param {string} charId - 角色ID
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否进入编辑模式
 * @param {boolean} isNew - 是否是新建角色
 */
export function showCharacterDetailModal(charId, chapterState, editMode = false, isNew = false) {
    let char = chapterState.staticMatrices.characters[charId];

    // 如果是新建角色，创建空对象
    if (isNew) {
        char = {
            core: {
                name: '',
                identity: '',
                age: '',
                gender: '',
                isProtagonist: false
            },
            appearance: '',
            personality: '',
            background: '',
            goals: '',
            capabilities: '',
            equipment: '',
            social: {
                relationships: {}
            },
            custom: {}
        };
    }

    if (!char && !isNew) return;

    // 编辑模式状态
    const isEditMode = editMode || isNew;

    // 渲染标签（查看/编辑模式）
    const renderTag = (value, dataPath = '', index = null, editMode = false) => {
        if (editMode) {
            return `<span class="sbt-tag sbt-tag-editable" data-path="${dataPath}" data-index="${index}" contenteditable="true">${value}</span><i class="fa-solid fa-xmark sbt-tag-delete" data-path="${dataPath}" data-index="${index}"></i>`;
        }
        return `<span class="sbt-tag">${value}</span>`;
    };

    // 渲染添加按钮
    const renderAddButton = (dataPath) => {
        return `<button class="sbt-tag-add-btn" data-path="${dataPath}"><i class="fa-solid fa-plus"></i></button>`;
    };

    // 渲染字段容器
    const renderFieldContainer = (label, content, dataPath = '') => {
        return `<div class="sbt-field-container" data-path="${dataPath}"><div class="sbt-field-header"><span class="sbt-field-label">${label}</span></div><div class="sbt-field-value">${content}</div></div>`;
    };

    // 通用文本处理（查看/编辑模式）
    const safeText = (value, parentKey = '', basePath = '', depth = 0, inEditMode = false) => {
        if (!value && !inEditMode) return '<span class="sbt-empty-text">暂无信息</span>';

        const currentPath = basePath ? `${basePath}.${parentKey}` : parentKey;

        if (typeof value === 'string' || (inEditMode && !value)) {
            if (inEditMode) {
                const textValue = value || '';
                // 如果文本较长，使用textarea，否则使用contenteditable的div
                if (textValue.length > 100) {
                    return `<textarea class="sbt-editable-textarea" data-path="${currentPath}">${textValue}</textarea>`;
                } else {
                    return `<div class="sbt-editable-text" data-path="${currentPath}" contenteditable="true">${textValue}</div>`;
                }
            }
            return `<span class="sbt-text-content">${value}</span>`;
        }

        if (Array.isArray(value)) {
            if (value.length === 0 && !inEditMode) return '<span class="sbt-empty-text">暂无</span>';

            // 渲染为标签列表
            let html = '<div class="sbt-tag-list">';
            value.forEach((item, index) => {
                if (typeof item === 'string') {
                    html += renderTag(item, currentPath, index, inEditMode);
                } else {
                    html += `<span class="sbt-tag">${JSON.stringify(item)}</span>`;
                }
            });
            if (inEditMode) {
                html += renderAddButton(currentPath);
            }
            html += '</div>';
            return html;
        }

        if (typeof value === 'object') {
            // 紧凑的键值对显示
            let result = '<div class="sbt-compact-fields">';
            for (const [key, val] of Object.entries(value)) {
                const displayName = translateField(key); // ✅ 翻译为中文
                const valContent = safeText(val, key, currentPath, depth + 1, inEditMode);
                result += `<div class="sbt-field-row"><span class="sbt-field-key">${displayName}:</span> ${valContent}</div>`;
            }
            result += '</div>';
            return result;
        }

        return String(value);
    };

    // 获取角色基本信息（兼容新旧结构）
    const getName = () => char.core?.name || char.name || charId;
    const getIdentity = () => char.core?.identity || char.identity || '未知身份';
    const getAge = () => char.core?.age || '未知';
    const getGender = () => char.core?.gender || '未知';
    const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;
    const getRelationships = () => char.social?.relationships || char.relationships || {};

    // 构建关系网络
    let relationshipsHtml = '';
    let relationshipSectionTitle = '关系网络';

    if (isProtagonist) {
        // 主角：显示其他角色对主角的好感度（反向查询）
        relationshipSectionTitle = '角色关系图谱';
        relationshipsHtml = '<div class="sbt-protagonist-relationship-notice">以下是其他角色对主角的看法和好感度</div>';
        relationshipsHtml += '<div class="sbt-character-relationship-grid sbt-protagonist-grid">';

        const allCharacters = chapterState.staticMatrices.characters;
        let hasRelationships = false;

        for (const otherCharId in allCharacters) {
            if (otherCharId === charId) continue; // 跳过主角自己

            const otherChar = allCharacters[otherCharId];

            // 查找该角色对主角的关系（兼容新旧结构）
            const staticRel = otherChar.social?.relationships?.[charId] || otherChar.relationships?.[charId];
            const dynamicRel = chapterState.dynamicState.characters?.[otherCharId]?.relationships?.[charId];

            if (staticRel || dynamicRel) {
                hasRelationships = true;
                const rawAffinity = dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50;
                const affinity = clampAffinityValue(rawAffinity, 50);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);
                const otherCharName = otherChar?.core?.name || otherChar?.name || otherCharId;

                // V3.1: 获取最新推理（不再显示历史数值记录）
                const latestReasoning = dynamicRel?.latest_reasoning;
                let historyHtml = '';

                // 只显示最新的完整推理（如果存在）
                if (latestReasoning) {
                    const timestamp = latestReasoning.timestamp ? new Date(latestReasoning.timestamp).toLocaleString('zh-CN') : '未知时间';
                    let change = latestReasoning.change;
                    if (change === null || change === undefined) {
                        change = '0';
                    } else if (typeof change === 'number') {
                        change = change > 0 ? `+${change}` : String(change);
                    } else {
                        change = String(change);
                        if (!change.startsWith('+') && !change.startsWith('-')) {
                            const numValue = parseFloat(change);
                            if (!isNaN(numValue) && numValue > 0) {
                                change = `+${change}`;
                            }
                        }
                    }
                    const reasoning = latestReasoning.reasoning || '无记录';
                    historyHtml += '<div class="sbt-relationship-history"><div class="sbt-relationship-history-title"><i class="fa-solid fa-lightbulb"></i> 最新变化推理</div>';
                    historyHtml += `<div class="sbt-history-entry"><div class="sbt-history-entry-header"><span class="sbt-history-timestamp">${timestamp}</span><span class="sbt-history-change ${change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}">${change}</span></div><div class="sbt-history-reasoning">${reasoning}</div></div>`;
                    historyHtml += '</div>';
                }

                relationshipsHtml += `<div class="sbt-character-relationship-card" data-other-char-id="${otherCharId}"><div class="sbt-character-relationship-name">${otherCharName}</div><div class="sbt-character-relationship-type">${safeText(relationType, '', '', 0, false)}</div><div class="sbt-character-relationship-affinity">对主角好感: ${isEditMode ? `<input type="number" class="sbt-affinity-input" data-from-char="${otherCharId}" data-to-char="${charId}" value="${affinity}" min="0" max="100" />` : affinity}</div><div class="sbt-character-relationship-affinity-bar"><div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div></div>${historyHtml}</div>`;
            }
        }

        relationshipsHtml += '</div>';

        if (!hasRelationships) {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无其他角色对主角的关系记录</p>';
        }

    } else {
        // 非主角：显示该角色对其他人的好感度
        const charRelationships = getRelationships();
        if (charRelationships && Object.keys(charRelationships).length > 0) {
            relationshipsHtml = '<div class="sbt-character-relationship-grid">';

            for (const targetCharId in charRelationships) {
                const targetChar = chapterState.staticMatrices.characters[targetCharId];
                const staticRel = charRelationships[targetCharId];
                const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[targetCharId];

                const rawAffinity = dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50;
                const affinity = clampAffinityValue(rawAffinity, 50);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);
                const targetCharName = targetChar?.core?.name || targetChar?.name || targetCharId;

                // V3.1: 获取最新推理（不再显示历史数值记录）
                const latestReasoning = dynamicRel?.latest_reasoning;
                let historyHtml = '';

                // 只显示最新的完整推理（如果存在）
                if (latestReasoning) {
                    const timestamp = latestReasoning.timestamp ? new Date(latestReasoning.timestamp).toLocaleString('zh-CN') : '未知时间';
                    let change = latestReasoning.change;
                    if (change === null || change === undefined) {
                        change = '0';
                    } else if (typeof change === 'number') {
                        change = change > 0 ? `+${change}` : String(change);
                    } else {
                        change = String(change);
                        if (!change.startsWith('+') && !change.startsWith('-')) {
                            const numValue = parseFloat(change);
                            if (!isNaN(numValue) && numValue > 0) {
                                change = `+${change}`;
                            }
                        }
                    }
                    const reasoning = latestReasoning.reasoning || '无记录';
                    historyHtml += '<div class="sbt-relationship-history"><div class="sbt-relationship-history-title"><i class="fa-solid fa-lightbulb"></i> 最新变化推理</div>';
                    historyHtml += `<div class="sbt-history-entry"><div class="sbt-history-entry-header"><span class="sbt-history-timestamp">${timestamp}</span><span class="sbt-history-change ${change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}">${change}</span></div><div class="sbt-history-reasoning">${reasoning}</div></div>`;
                    historyHtml += '</div>';
                }

                relationshipsHtml += `<div class="sbt-character-relationship-card" data-target-char-id="${targetCharId}"><div class="sbt-character-relationship-name">${targetCharName}</div><div class="sbt-character-relationship-type">${safeText(relationType, '', '', 0, false)}</div><div class="sbt-character-relationship-affinity">好感度: ${isEditMode ? `<input type="number" class="sbt-affinity-input" data-from-char="${charId}" data-to-char="${targetCharId}" value="${affinity}" min="0" max="100" />` : affinity}</div><div class="sbt-character-relationship-affinity-bar"><div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div></div>${historyHtml}</div>`;
            }
            relationshipsHtml += '</div>';
        } else {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无关系记录</p>';
        }
    }

    const relationshipSectionHtml = `
        <div class="sbt-character-detail-section ${isProtagonist ? 'sbt-protagonist-relationship-section' : ''}">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-users"></i>${relationshipSectionTitle}</div>
            ${relationshipsHtml}
        </div>
    `;

    const dossierSchema = loadDossierSchemaFromCharacter();
    const dossierFields = Array.isArray(dossierSchema?.fields) ? dossierSchema.fields : [];

    const hasContent = (value) => {
        if (value === null || value === undefined) return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return true;
        if (typeof value === 'string') return value.trim() !== '';
        return true;
    };

    const coerceTagsValue = (value) => {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        if (typeof value === 'string') return [value];
        return [];
    };

    const renderSocialSection = (field) => {
        const socialData = char.social || {};
        const hasSocialData = Boolean(
            socialData.所属组织 ||
            socialData.声望 ||
            socialData.社会地位 ||
            socialData.affiliations ||
            socialData.reputation ||
            socialData.social_status
        );

        if (!isEditMode && !hasSocialData) return '';

        const title = field?.label || '归属与声望';
        const icon = field?.icon || 'fa-flag';
        const content = `
            <div class="sbt-compact-fields">
                ${(socialData.所属组织 || socialData.affiliations) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">所属组织:</span> ${safeText(socialData.所属组织 || socialData.affiliations, 'social.所属组织', '', 0, isEditMode)}</div>` : ''}
                ${(socialData.声望 || socialData.reputation) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">声望:</span> ${safeText(socialData.声望 || socialData.reputation, 'social.声望', '', 0, isEditMode)}</div>` : ''}
                ${(socialData.社会地位 || socialData.social_status) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">社会地位:</span> ${safeText(socialData.社会地位 || socialData.social_status, 'social.社会地位', '', 0, isEditMode)}</div>` : ''}
            </div>
        `;

        return `
            <div class="sbt-character-detail-section">
                <div class="sbt-character-detail-section-title"><i class="fa-solid ${icon}"></i>${title}</div>
                <div class="sbt-character-detail-section-content">
                    <div class="sbt-content-wrapper">${content}</div>
                </div>
            </div>
        `;
    };

    const renderFieldSection = (field) => {
        if (!field || !field.key || field.key === 'social') return '';

        const title = field.label || field.key;
        const icon = field.icon || 'fa-clipboard-list';
        const isBuiltin = field.builtin === true;
        const value = isBuiltin ? char[field.key] : char.custom?.[field.key];
        const dataPathBase = isBuiltin ? '' : 'custom';

        if (field.type === 'tags') {
            const tagsValue = coerceTagsValue(value);
            if (!isEditMode && tagsValue.length === 0) return '';
            const content = safeText(tagsValue, field.key, dataPathBase, 0, isEditMode);
            return `
                <div class="sbt-character-detail-section">
                    <div class="sbt-character-detail-section-title"><i class="fa-solid ${icon}"></i>${title}</div>
                    <div class="sbt-character-detail-section-content">
                        <div class="sbt-content-wrapper">${content}</div>
                    </div>
                </div>
            `;
        }

        if (!isEditMode && !hasContent(value)) return '';
        const content = safeText(value, field.key, dataPathBase, 0, isEditMode);
        return `
            <div class="sbt-character-detail-section">
                <div class="sbt-character-detail-section-title"><i class="fa-solid ${icon}"></i>${title}</div>
                <div class="sbt-character-detail-section-content">
                    <div class="sbt-content-wrapper">${content}</div>
                </div>
            </div>
        `;
    };

    const buildDossierSections = () => {
        let html = '';
        let relationshipInserted = false;

        dossierFields.forEach((field) => {
            if (field.key === 'social') {
                if (!relationshipInserted) {
                    html += relationshipSectionHtml;
                    relationshipInserted = true;
                }
                html += renderSocialSection(field);
                return;
            }
            html += renderFieldSection(field);
        });

        if (!relationshipInserted) {
            html += relationshipSectionHtml;
        }
        return html;
    };

    // 构建详细档案HTML（支持新旧结构）
    const detailHtml = `
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-user"></i>
                ${isEditMode ? `<input type="text" class="sbt-name-input" data-path="core.name" value="${getName()}" placeholder="角色名称" />` : getName()}
                ${isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
            </div>
            <div class="sbt-character-detail-identity">
                ${isEditMode ? `
                    <input type="text" class="sbt-basic-input" data-path="core.identity" value="${getIdentity()}" placeholder="身份" />
                    ·
                    <input type="text" class="sbt-basic-input sbt-small-input" data-path="core.age" value="${getAge()}" placeholder="年龄" />
                    ·
                    <input type="text" class="sbt-basic-input sbt-small-input" data-path="core.gender" value="${getGender()}" placeholder="性别" />
                ` : `${getIdentity()} · ${getAge()} · ${getGender()}`}
                ${isNew ? ' <span style="color: var(--sbt-warning-color);">· 新建中</span>' : ''}
            </div>
            <div class="sbt-character-detail-actions">${isEditMode ? `<button class="sbt-save-character-btn" data-char-id="${charId}" data-is-new="${isNew}"><i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建角色' : '保存修改'}</button><button class="sbt-cancel-edit-btn" data-char-id="${charId}"><i class="fa-solid fa-times fa-fw"></i> 取消</button>${!isNew ? `<button class="sbt-delete-character-btn" data-char-id="${charId}"><i class="fa-solid fa-trash fa-fw"></i> 删除</button>` : ''}` : `<button class="sbt-edit-mode-toggle" data-char-id="${charId}"><i class="fa-solid fa-pen-to-square"></i> 编辑档案</button><button class="sbt-delete-character-btn" data-char-id="${charId}"><i class="fa-solid fa-trash"></i> 删除角色</button>`}</div>
        </div>

        ${buildDossierSections()}
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-character-detail-panel');
    const $content = $('#sbt-character-detail-content');

    $content.attr('data-char-id', charId); // 保存角色ID供编辑功能使用
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * [新增] 渲染并显示角色详情的弹窗。
 * @param {string} charId - 要显示详情的角色ID。
 * @param {Chapter} chapterState - 完整的Chapter对象。
 */
export function showCharacterDetailPopup(charId, chapterState) {
    const characterData = chapterState.staticMatrices.characters[charId];
    if (!characterData) return;

    // --- 准备数据 ---
    const staticRelationships = characterData.relationships || {};

    // --- 构建HTML ---
    let relationshipsHtml = '<div class="sbt-popup-subtitle">关系网络</div>';
    const allChars = chapterState.staticMatrices.characters;

    for (const targetCharId in allChars) {
        if (targetCharId === charId) continue; // 不显示对自己

        // 优先显示动态更新后的关系，如果不存在，则显示静态初始关系
        const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[targetCharId];
        const staticRel = staticRelationships[targetCharId];

        // 优先使用动态数据
        const currentAffinity = dynamicRel?.current_affinity ?? staticRel?.affinity;
        const normalizedAffinity = clampAffinityValue(currentAffinity, null);
        const affinity = normalizedAffinity === null || normalizedAffinity === undefined ? '??' : normalizedAffinity;
        const reputation = staticRel?.relation_type || staticRel?.description || '关系未建立';

        relationshipsHtml += `
            <div class="sbt-popup-relation-item">
                <span>对 <strong>${allChars[targetCharId]?.name || targetCharId}</strong> 的看法:</span>
                <span class="sbt-popup-relation-value">${reputation} (好感: ${affinity})</span>
            </div>
        `;
    }
    if (Object.keys(allChars).length <= 1) {
        relationshipsHtml += '<p>暂无其他角色可建立关系。</p>';
    }

    const modalHtml = `
        <div id="sbt-character-detail-popup">
            <div class="sbt-popup-header">
                <h4>角色档案: ${characterData.name || charId}</h4>
                <p>${characterData.identity || '未知身份'}</p>
            </div>
            <div class="sbt-popup-content">
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">核心性格</div>
                    <p>${characterData.personality || '暂无性格描述'}</p>
                </div>
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">背景故事</div>
                    <p>${characterData.background || '暂无背景故事'}</p>
                </div>
                <div class="sbt-popup-section">${relationshipsHtml}</div>
            </div>
        </div>
    `;

    // 使用 SillyTavern 的 callGenericPopup 显示
    applicationFunctionManager.callGenericPopup(modalHtml, 'html', null, { wide: true, fullscreen: false });
}
