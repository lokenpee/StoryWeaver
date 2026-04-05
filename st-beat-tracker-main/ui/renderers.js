// ui/renderers.js
import { mapValueToHue } from '../utils/colorUtils.js';
import { showCharacterDetailModal, showCharacterDetailPopup } from './renderers/characterModal.js';
import { showWorldviewDetailModal } from './renderers/worldviewModal.js';
import { showStorylineDetailModal } from './renderers/storylineModal.js';
import { showRelationshipDetailModal } from './renderers/relationshipModal.js';
import applicationFunctionManager from '../manager.js';
import * as staticDataManager from '../src/StaticDataManager.js';
import { sbtConsole } from '../utils/sbtConsole.js';

// 【调试模式辅助函数】
const debugLog = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        sbtConsole.log(...args);
    }
};
const debugGroup = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        sbtConsole.group(...args);
    }
};
const debugGroupEnd = () => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        sbtConsole.groupEnd();
    }
};
const debugWarn = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        sbtConsole.warn(...args);
    }
};

const hasEnglishLetters = (value) => /[A-Za-z]/.test(value || '');
const ensureChineseLabel = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    return hasEnglishLetters(text) ? fallback : text;
};

function buildFallbackChapterStateFromStaticCache() {
    try {
        if (!staticDataManager || typeof staticDataManager.getFullDatabase !== 'function') {
            return null;
        }
        const hasMeaningfulStaticCache = (cached) => {
            if (!cached || typeof cached !== 'object') return false;
            const charactersCount = Object.keys(cached.characters || {}).length;
            const worldview = cached.worldview || {};
            const worldviewCount =
                Object.keys(worldview.locations || {}).length +
                Object.keys(worldview.items || {}).length +
                Object.keys(worldview.factions || {}).length +
                Object.keys(worldview.concepts || {}).length +
                Object.keys(worldview.events || {}).length +
                Object.keys(worldview.races || {}).length;
            const storylines = cached.storylines || {};
            const storylinesCount =
                Object.keys(storylines.main_quests || {}).length +
                Object.keys(storylines.side_quests || {}).length +
                Object.keys(storylines.relationship_arcs || {}).length +
                Object.keys(storylines.personal_arcs || {}).length;
            const relCount = Array.isArray(cached.relationship_graph?.edges)
                ? cached.relationship_graph.edges.length
                : 0;
            return (charactersCount + worldviewCount + storylinesCount + relCount) > 0;
        };
        const resolveProtagonistName = (cached) => {
            const chars = cached?.characters || {};
            for (const [id, data] of Object.entries(chars)) {
                if (data?.core?.isProtagonist || data?.isProtagonist) {
                    return data?.core?.name || data?.name || id;
                }
            }
            return null;
        };

        const ctx = typeof applicationFunctionManager?.getContext === 'function'
            ? applicationFunctionManager.getContext()
            : null;
        const activeCharId = ctx?.characterId;
        const activeCharName = ctx?.name2 || '';
        const baselineData = (typeof staticDataManager.loadStaticBaseline === 'function' && activeCharId)
            ? staticDataManager.loadStaticBaseline(activeCharId)
            : null;
        const hasBaseline = hasMeaningfulStaticCache(baselineData);

        const db = staticDataManager.getFullDatabase() || {};
        if (!activeCharId) {
            debugWarn('[Renderers] 未检测到当前角色ID，跳过静态缓存兜底。');
            return null;
        }

        const cachedData = db?.[activeCharId];
        const hasCached = hasMeaningfulStaticCache(cachedData);

        if (!hasBaseline && !hasCached) {
            debugWarn('[Renderers] 当前角色无静态缓存，跳过兜底。', { activeCharId });
            return null;
        }

        const selectedData = hasBaseline ? baselineData : cachedData;
        if (!selectedData || !hasMeaningfulStaticCache(selectedData)) return null;
        const protagonistName = resolveProtagonistName(selectedData);
        if (activeCharName && protagonistName && activeCharName !== protagonistName) {
            debugWarn('[Renderers] 静态缓存角色名不匹配，已忽略。', {
                activeCharId,
                activeCharName,
                protagonistName
            });
            return null;
        }

        const safeWorldview = selectedData.worldview || {};
        const safeStorylines = selectedData.storylines || {};

        const fallbackState = {
            uid: `static_cache_${activeCharId}`,
            characterId: activeCharId,
            staticMatrices: {
                characters: selectedData.characters || {},
                worldview: {
                    locations: safeWorldview.locations || {},
                    items: safeWorldview.items || {},
                    factions: safeWorldview.factions || {},
                    concepts: safeWorldview.concepts || {},
                    events: safeWorldview.events || {},
                    races: safeWorldview.races || {}
                },
                storylines: {
                    main_quests: safeStorylines.main_quests || {},
                    side_quests: safeStorylines.side_quests || {},
                    relationship_arcs: safeStorylines.relationship_arcs || {},
                    personal_arcs: safeStorylines.personal_arcs || {}
                },
                relationship_graph: selectedData.relationship_graph || { edges: [] }
            },
            dynamicState: {
                characters: {},
                worldview: {
                    locations: {},
                    items: {},
                    factions: {},
                    concepts: {},
                    events: {},
                    races: {}
                },
                storylines: {
                    main_quests: {},
                    side_quests: {},
                    relationship_arcs: {},
                    personal_arcs: {}
                }
            },
            meta: {
                longTermStorySummary: selectedData.longTermStorySummary || '（静态数据预览）',
                narrative_control_tower: selectedData.narrative_control_tower || { storyline_progress: {} }
            },
            chapter_blueprint: selectedData.chapter_blueprint || {},
            activeChapterDesignNotes: selectedData.activeChapterDesignNotes || null
        };

        if (!fallbackState.meta.narrative_control_tower) {
            fallbackState.meta.narrative_control_tower = { storyline_progress: {} };
        }
        if (!fallbackState.meta.narrative_control_tower.storyline_progress) {
            fallbackState.meta.narrative_control_tower.storyline_progress = {};
        }

        fallbackState.__source = 'static_cache';
        return fallbackState;
    } catch (error) {
        sbtConsole.warn('[Renderers] 读取静态数据库失败，无法构建预览章节状态', error);
        return null;
    }
}

const STATIC_CACHE_SOURCE = 'static_cache';
const TEMP_CACHE_UID = 'temp_cached_view';

function isStaticSnapshot(state) {
    if (!state) return false;
    return state.__source === STATIC_CACHE_SOURCE || state.uid === TEMP_CACHE_UID;
}

function getLeaderStateFromChat() {
    try {
        const ctx = typeof applicationFunctionManager?.getContext === 'function'
            ? applicationFunctionManager.getContext()
            : null;
        const chat = ctx?.chat;
        if (!Array.isArray(chat)) return null;
        for (let i = chat.length - 1; i >= 0; i--) {
            const piece = chat[i];
            if (piece && !piece.is_user && piece.leader && piece.leader.staticMatrices) {
                const leaderState = piece.leader;
                const uid = leaderState.uid || '';

                // 🔧 修复：拒绝静态缓存leader（它们的UID以static_cache_开头）
                if (uid.startsWith('static_cache_')) {
                    debugWarn(`[Renderers] 跳过静态缓存leader: ${uid}`);
                    continue;
                }

                // 🔧 修复：如果真实章节被污染了静态缓存标记，立即清理（防御性修复）
                if (leaderState.__source === STATIC_CACHE_SOURCE && !uid.startsWith('static_cache_')) {
                    debugWarn(`[Renderers] 检测到真实章节被污染: ${uid}, 正在即时清理...`);

                    // ⚠️ 只移除错误的 __source 污染标记
                    // cachedChapterStaticContext 和 lastUpdated 是真实章节的合法字段，不应删除
                    delete leaderState.__source;

                    debugLog(`[Renderers] 已清理 __source 污染标记，继续使用该leader: ${uid}`);
                }

                // 设置正确的__source标记
                leaderState.__source = leaderState.__source || 'leader_chat';

                if (typeof window !== 'undefined') {
                    window.__sbtLiveLeaderAvailable = true;
                }
                return leaderState;
            }
        }
    } catch (error) {
        debugWarn('[Renderers] 读取聊天 leader 状态失败:', error);
    }
    return null;
}

export function resolveRenderableChapterState(chapterState) {
    let effectiveState = chapterState;
    const ctx = typeof applicationFunctionManager?.getContext === 'function'
        ? applicationFunctionManager.getContext()
        : null;
    const activeCharId = ctx?.characterId;

    if (effectiveState && isStaticSnapshot(effectiveState) && activeCharId && effectiveState.characterId && effectiveState.characterId !== activeCharId) {
        debugWarn('[Renderers] 检测到跨角色静态快照，已丢弃。', {
            snapshotCharacterId: effectiveState.characterId,
            activeCharId
        });
        effectiveState = null;
    }

    if (!effectiveState || !effectiveState.staticMatrices || isStaticSnapshot(effectiveState)) {
        const leaderState = getLeaderStateFromChat();
        if (leaderState) {
            debugLog('[Renderers] 使用聊天 leader 状态作为渲染源。');
            effectiveState = leaderState;
        }
    }

    if (!effectiveState || !effectiveState.staticMatrices) {
        const fallbackState = buildFallbackChapterStateFromStaticCache();
        if (fallbackState) {
            debugWarn('[Renderers] 未找到有效章节状态，使用静态缓存作为兜底。');
            effectiveState = fallbackState;
        } else if (effectiveState && isStaticSnapshot(effectiveState)) {
            // 静态快照无数据兜底时直接丢弃，避免误进入预编辑模式
            effectiveState = null;
        }
    }

    return effectiveState || null;
}


/**
 * @description 渲染核心记忆列表。
 * @param {object} matrix 角色矩阵对象。
 * @param {JQuery<HTMLElement>} container 渲染的目标容器。
 */
function renderCoreMemories(matrix, container) {
       if (!matrix || !container || container.length === 0) return;

    const protagonistId = Object.keys(matrix).find(id => matrix[id].isProtagonist);
    const memories = (protagonistId && matrix[protagonistId]?.core_memories) ? matrix[protagonistId].core_memories : [];
    if (memories.length === 0) {
        container.html('<p class="sbt-instructions">尚未形成任何核心记忆。</p>');
        return;
    }
    let html = memories.map(mem => `
        <div class="sbt-memory-card">
            <div class="sbt-memory-header"><strong>${mem.emotional_peak}</strong> (烈度: ${mem.intensity}/10)</div>
            <p class="sbt-memory-trigger"><em>"${mem.trigger_event}"</em></p>
            <details class="sbt-memory-details">
                <summary>回忆场景细节</summary>
                <div class="sbt-memory-fulltext">${mem.full_text_snapshot.replace(/\n/g, '<br>')}</div>
            </details>
        </div>`).join('');
    container.html(html);
}

/**
 * @description 渲染故事线网络。
 * @param {object} matrix 故事线矩阵对象。
 * @param {JQuery<HTMLElement>} container 渲染的目标容器。
 */
function renderLineMatrix(matrix, container) {
    if (!container || container.length === 0) return;
    if (!matrix || Object.keys(matrix).length === 0) {
        container.html('<p class="sbt-instructions">故事线尚未形成。</p>');
        return;
    }
    let html = '';
    for (const lineId in matrix) {
        const line = matrix[lineId];
        const statusClass = line.status === 'active' ? 'status-active' : 'status-dormant';
        html += `
            <div class="sbt-storyline-item">
                <span class="sbt-status-badge ${statusClass}">${line.status}</span>
                <div class="sbt-storyline-details">
                    <strong>${line.title || '未知故事线'} (${line.type || '未知类型'})</strong>
                    <p>${line.summary || '暂无摘要。'}</p>
                </div>
            </div>`;
    }
    container.html(html);
}
function renderCharacterRelationships(chapterState, container) {
    try {
        if (!container || container.length === 0) {
            debugWarn("[关系渲染器] 探针报告：目标容器不存在，渲染中止。");
            return;
        }
            container.empty();

    const matrix = chapterState.staticMatrices.characters;
        debugGroup("[关系渲染器] 探针1号：输入数据检查");
        debugLog("收到的完整 chapterState:", chapterState);
        debugLog("提取的角色矩阵 (matrix):", matrix);
        debugGroupEnd();
    if (!matrix || Object.keys(matrix).length <= 1) {
        container.html('<p class="sbt-instructions">暂无其他角色可显示。</p>');
        return;
    }

    // 兼容新旧结构查找主角
    const protagonistId = Object.keys(matrix).find(id => {
        const char = matrix[id];
        return char?.core?.isProtagonist || char?.isProtagonist;
    });
        debugGroup("[关系渲染器] 探针2号：主角ID查找");
        debugLog("查找到的主角ID (protagonistId):", protagonistId);
        debugGroupEnd();

        if (!protagonistId) {
            container.html('<p class="sbt-instructions">错误：在角色档案中未找到主角 (isProtagonist: true)。</p>');
            sbtConsole.error("[关系渲染器] 探针报告：关键错误！未能找到主角ID。请检查AI生成的角色档案中 'isProtagonist' 字段是否存在且为布尔值 true。");
            return;
        }
                debugLog("[关系渲染器] 探针报告：主角查找成功，准备进入渲染循环...");
    for (const charId in matrix) {
        if (charId === protagonistId) continue;
        const char = matrix[charId];
        // 兼容新旧结构
        const staticRel = char?.social?.relationships?.[protagonistId] || char?.relationships?.[protagonistId];
        const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[protagonistId];
        const newAffinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 0, 10);
        const cardSummaryText = staticRel?.description || "关系尚未建立";
        const historyLog = dynamicRel?.history || [];

        // V3.1: 使用latest_reasoning字段显示最新的史官推理，而不是遍历整个history
        const latestReasoning = dynamicRel?.latest_reasoning?.reasoning || "";
        const tooltipText = latestReasoning
            ? `【最新变化】\n(好感 ${dynamicRel.latest_reasoning.change || 'N/A'}) ${latestReasoning}\n\n【历史记录】\n` +
              historyLog.map(entry => `${entry.timestamp}: 好感${entry.change || '0'} → ${entry.final_affinity}`).join('\n')
            : historyLog.length > 0
                ? historyLog.map(entry => `${entry.timestamp}: 好感${entry.change || '0'} → ${entry.final_affinity}`).join('\n')
                : "暂无详细互动记录。";

        // 获取角色名字（兼容新旧结构）
        const charName = char?.core?.name || char?.name || charId;

        const cardHtml = `
             <div class="sbt-character-card sbt-clickable" data-char-id="${charId}" title="好感度变更历史：\n${tooltipText}">
                <h6>${charName}</h6>
                <p class="sbt-relationship-label sbt-affinity-label">好感度: ${newAffinity}</p>
                <div class="sbt-progress-bar">
                    <div class="sbt-progress-fill affinity"></div>
                    <span class="sbt-change-indicator"></span>
                </div>
                <p class="sbt-last-interaction-text">当前关系: ${cardSummaryText}</p>
            </div>`;
        container.append(cardHtml);
        const $card = container.find(`.sbt-character-card[data-char-id="${charId}"]`);
        const oldAffinity = parseFloat($card.attr('data-current-affinity')) || 0;
        const finalColor = mapValueToHue(newAffinity);

        $card.attr('data-current-affinity', newAffinity);
        $card.attr('data-old-affinity', oldAffinity);
        $card.attr('data-final-color', finalColor);
        $card.attr('data-affinity-tip-shown', 'false');

        const initialColor = mapValueToHue(oldAffinity); 
        const $affinityBar = $card.find('.sbt-progress-fill.affinity');
        $affinityBar.css({
            'backgroundColor': initialColor,
            'width': `${oldAffinity}%`
        });
    }
}catch (error) {
        sbtConsole.error("[关系渲染器] 探针3号：在渲染过程中捕获到意外错误！", error);
        container.html('<p class="sbt-instructions">渲染角色关系时发生意外错误，请查看控制台获取详情。</p>');
    }
}
/**
 * @description 渲染世界档案面板 - 角色档案馆
 * @param {object} characters - 角色矩阵对象
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 */
function renderArchiveCharacters(characters, container) {
    if (!container || container.length === 0) return;

    container.empty();

    if (!characters || Object.keys(characters).length === 0) {
        container.append('<p class="sbt-instructions">暂无角色档案。</p>');
        // 添加新建角色按钮
        const addBtnHtml = `
            <button class="sbt-add-character-btn" title="手动创建新角色档案">
                <i class="fa-solid fa-user-plus fa-fw"></i> 新建角色
            </button>
        `;
        container.append(addBtnHtml);
        return;
    }

    for (const charId in characters) {
        const char = characters[charId];

        // 兼容新旧结构
        const name = char.core?.name || char.name || charId;
        const identity = char.core?.identity || char.identity || '未知身份';
        const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;
        const age = char.core?.age || '';
        const gender = char.core?.gender || '';

        // 构建副标题
        let subtitle = identity;
        if (age || gender) {
            const details = [age, gender].filter(Boolean).join(' · ');
            subtitle = `${identity} · ${details}`;
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = char.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此角色（当前已隐藏，不会被AI使用）' : '隐藏此角色（暂时不让AI使用）';

        const cardHtml = `
            <div class="sbt-archive-card ${hiddenClass}" data-char-id="${charId}">
                <div class="sbt-archive-card-icon">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="sbt-archive-card-title">
                    ${name}
                    ${isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
                    ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                </div>
                <div class="sbt-archive-card-subtitle">
                    ${subtitle}
                </div>
                <div class="sbt-archive-card-actions">
                    <button class="sbt-character-toggle-visibility-btn" data-char-id="${charId}" title="${eyeTitle}">
                        <i class="fa-solid ${eyeIcon}"></i>
                    </button>
                </div>
            </div>
        `;
        container.append(cardHtml);
    }

    // 添加新建角色按钮（放在所有角色卡之后）
    const addBtnHtml = `
        <button class="sbt-add-character-btn" title="手动创建新角色档案">
            <i class="fa-solid fa-user-plus fa-fw"></i> 新建角色
        </button>
    `;
    container.append(addBtnHtml);
}

/**
 * @description 渲染世界档案面板 - 世界观元素
 * @param {object} worldviewData - 世界观数据对象
 * @param {string} category - 类别名称
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 * @param {string} categoryKey - 类别的key（如 'locations', 'items'）
 */
function renderArchiveWorldview(worldviewData, category, container, categoryKey) {
    if (!container || container.length === 0) return;

    container.empty();

    // 添加新建按钮
    const addBtnHtml = `
        <button class="sbt-add-worldview-btn" data-category="${categoryKey}" data-category-name="${category}">
            <i class="fa-solid fa-plus fa-fw"></i> 新建${category}
        </button>
    `;
    container.append(addBtnHtml);

    if (!worldviewData || Object.keys(worldviewData).length === 0) {
        container.append(`<p class="sbt-instructions">暂无${category}记录。</p>`);
        return;
    }

    for (const id in worldviewData) {
        const item = worldviewData[id];

        // 安全地获取描述文本
        let descText = '暂无描述';
        const desc = item.description || item.summary;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = item.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此档案（当前已隐藏，不会被AI使用）' : '隐藏此档案（暂时不让AI使用）';

        const itemHtml = `
            <div class="sbt-archive-item sbt-worldview-card ${hiddenClass}" data-item-id="${id}" data-category="${categoryKey}">
                <div class="sbt-worldview-card-content">
                    <div class="sbt-archive-item-title">
                        ${item.name || id}
                        ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                    </div>
                    <div class="sbt-archive-item-desc">${descText}</div>
                </div>
                <div class="sbt-worldview-card-actions">
                    <button class="sbt-worldview-toggle-visibility-btn" data-item-id="${id}" data-category="${categoryKey}" title="${eyeTitle}">
                        <i class="fa-solid ${eyeIcon}"></i>
                    </button>
                    <button class="sbt-worldview-edit-btn" data-item-id="${id}" data-category="${categoryKey}" data-category-name="${category}" title="编辑${category}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </div>
        `;
        container.append(itemHtml);
    }
}

/**
 * @description 渲染世界档案面板 - 故事线（V8.0 可编辑版本）
 * @param {object} storylineData - 故事线数据对象
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 * @param {string} category - 故事线分类（main_quests/side_quests/relationship_arcs/personal_arcs）
 * @param {string} categoryName - 分类显示名称
 * @param {object} storylineProgress - 叙事控制塔记录的故事线进度
 */
function renderArchiveStorylines(storylineData, container, category, categoryName, storylineProgress = {}) {
    if (!container || container.length === 0) return;

    container.empty();

    const stageLabelMap = {
        setup: '铺垫阶段',
        inciting_incident: '激励事件',
        catalyst: '触发事件',
        debate: '抉择阶段',
        first_turning_point: '第一次转折',
        fun_and_games: '探索阶段',
        midpoint: '中期节点',
        bad_guys_close_in: '逆境逼近',
        climax_approach: '高潮前奏',
        all_is_lost: '至暗时刻',
        dark_night: '黑夜反思',
        finale: '终章',
        resolution: '结局阶段',
        deepening: '关系深化',
        discovery: '发现阶段',
        confrontation: '对峙阶段',
        aftermath: '余波阶段',
        unknown: '阶段未记录'
    };

    const formatStageLabel = (stage) => {
        if (!stage) return '阶段未记录';
        return stageLabelMap[stage] || stage;
    };
    const clampProgressValue = (value) => {
        const num = Number(value);
        if (Number.isNaN(num)) return 0;
        if (num < 0) return 0;
        if (num > 100) return 100;
        return num;
    };

    const resolveProgressState = (line, fallbackId) => {
        const candidates = [
            line?.storyline_id,
            line?.id,
            line?.uid,
            fallbackId
        ].filter(Boolean);

        for (const key of candidates) {
            if (storylineProgress && Object.prototype.hasOwnProperty.call(storylineProgress, key)) {
                return storylineProgress[key];
            }
        }
        return null;
    };

    // 添加新建故事线按钮
    const addBtnHtml = `
        <button class="sbt-add-storyline-btn" data-category="${category}" data-category-name="${categoryName}">
            <i class="fa-solid fa-plus fa-fw"></i> 新建${categoryName}
        </button>
    `;
    container.append(addBtnHtml);

    if (!storylineData || Object.keys(storylineData).length === 0) {
        container.append(`<p class="sbt-instructions">暂无${categoryName}。</p>`);
        return;
    }

    for (const id in storylineData) {
        const line = storylineData[id];

        // 【过滤占位符】跳过那些只有进度数据但没有实质内容的占位符故事线
        const summary = line.summary || line.initial_summary || '';
        const currentSummary = line.current_summary || '';
        const isPlaceholder = (
            (summary === '建筑师未撰写摘要。' || summary === '') &&
            (currentSummary === '尚未记录进展' || currentSummary === '' || currentSummary === '建筑师未撰写摘要。') &&
            (!line.player_supplement || line.player_supplement === '') &&
            (!line.history || line.history.length === 0)
        );

        // 如果是未被用户编辑过的占位符，跳过不显示
        if (isPlaceholder) {
            sbtConsole.log(`[StorylineRender] 过滤占位符故事线: ${id} (仅有进度数据，无实质内容)`);
            continue;
        }

        // 【修复】优先使用动态状态，回退到静态
        const status = line.current_status || line.status || 'dormant';
        const statusText = status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '休眠';

        // 【修复】优先显示当前进展摘要，回退到基础摘要
        let descText = '暂无描述';
        const desc = line.current_summary || line.summary || line.initial_summary || line.description;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        // 【新增】显示历史记录（可编辑）
        let historyHtml = '';
        if (line.history && Array.isArray(line.history) && line.history.length > 0) {
            historyHtml = '<div class="sbt-storyline-history"><div class="sbt-storyline-history-title">📜 历史变化记录（可编辑）</div>';

            // 获取最近3条记录及其原始索引
            const recentEntries = line.history.slice(-3);
            const startIndex = Math.max(0, line.history.length - 3);

            recentEntries.reverse().forEach((entry, displayIndex) => {  // 倒序显示
                // 【修复】过滤掉模板占位符（如 {{engine_generated_timestamp}}）
                let timestamp = entry.timestamp || '未知时间';
                if (timestamp.includes('{{') || timestamp.includes('}}')) {
                    timestamp = '系统自动记录';
                }

                // 计算实际索引（考虑倒序显示）
                const actualIndex = startIndex + (recentEntries.length - 1 - displayIndex);
                const update = entry.summary_update || entry.summary || entry.status_change || '无更新';
                historyHtml += `<div class="sbt-storyline-history-entry">
                    <span class="sbt-storyline-timestamp">${timestamp}</span>:
                    <span class="sbt-history-content" contenteditable="true" data-history-index="${actualIndex}">${update}</span>
                </div>`;
            });
            historyHtml += '</div>';
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = line.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此故事线（当前已隐藏，不会被AI使用）' : '隐藏此故事线（暂时不让AI使用）';

        const progressState = resolveProgressState(line, id);
         let progressHtml = '';

        // [V10.1 Fix] 前端渲染增强：
        // 如果控制塔没有返回进度 (progressState 为空)，但故事线本身携带了 advancement (AI刚生成的增量)，
        // 我们临时构造一个进度对象来显示，避免UI留白。
        let displayState = progressState;
        
        if (!displayState && line.advancement) {
            displayState = {
                current_progress: line.advancement.progress_delta || 0, // 临时用增量当进度显示
                current_stage: line.advancement.new_stage || '阶段更新',
                last_increment: line.advancement.progress_delta
            };
        }

        if (displayState) { // 将原来的 if (progressState) 改为使用 displayState
            const progressValue = clampProgressValue(displayState.current_progress);
            const stageLabel = formatStageLabel(displayState.current_stage);
            const displayValue = Math.round(progressValue);
            const deltaValue = Number(displayState.last_increment);
            const hasDelta = Number.isFinite(deltaValue) && deltaValue !== 0;
            const deltaText = hasDelta
                ? `<div class="sbt-storyline-progress-delta">本章推进 ${deltaValue > 0 ? '+' : ''}${deltaValue}%</div>`
                : '';

            progressHtml = `
                <div class="sbt-storyline-progress">
                    <div class="sbt-storyline-progress-header">
                        <span class="sbt-storyline-stage">${stageLabel}</span>
                        <span class="sbt-storyline-progress-value">${displayValue}%</span>
                    </div>
                    <div class="sbt-progress-bar storyline">
                        <div class="sbt-progress-fill storyline" style="width: ${progressValue}%;"></div>
                    </div>
                    ${deltaText}
                </div>
            `;
        } else {
            progressHtml = '<div class="sbt-storyline-progress sbt-storyline-progress-empty">尚未记录进度</div>';
        }

        const itemHtml = `
            <div class="sbt-archive-item sbt-storyline-card ${hiddenClass}" data-storyline-id="${id}" data-category="${category}">
                <div class="sbt-archive-item-header">
                    <div class="sbt-archive-item-title">
                        ${line.title || id}
                        <span class="sbt-archive-status ${status}">${statusText}</span>
                        ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                    </div>
                    <div class="sbt-storyline-actions">
                        <button class="sbt-storyline-toggle-visibility-btn" data-storyline-id="${id}" data-category="${category}" title="${eyeTitle}">
                            <i class="fa-solid ${eyeIcon}"></i>
                        </button>
                        <button class="sbt-storyline-edit-btn" data-storyline-id="${id}" data-category="${category}" data-category-name="${categoryName}" title="编辑${categoryName}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="sbt-storyline-delete-btn" data-storyline-id="${id}" data-category="${category}" title="删除${categoryName}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="sbt-archive-item-desc">${descText}</div>
                ${progressHtml}
                ${line.type ? `<div class="sbt-archive-item-meta">类型: ${line.type}</div>` : ''}
                ${historyHtml}
            </div>
        `;
        container.append(itemHtml);
    }
}

/**
 * @description 渲染关系图谱
 * @param {object} chapterState - 完整的Chapter对象
 */
function renderRelationshipGraph(chapterState) {
    const container = $('#sbt-relationship-graph-container');
    if (!container || container.length === 0) return;

    container.empty();
    const unfamiliarStatuses = new Set(['陌生人', '点头之交', '单方面认识']);

    const relationshipGraph = chapterState?.staticMatrices?.relationship_graph;
    const edges = Array.isArray(relationshipGraph?.edges)
        ? relationshipGraph.edges
        : [];

    if (edges.length === 0) {
        container.html('<p class="sbt-instructions">暂无关系图谱数据。创世后将自动生成角色关系网络。</p>');
        // 添加新建关系按钮
        const addBtnHtml = `
            <button class="sbt-add-relationship-btn" title="手动创建新关系">
                <i class="fa-solid fa-heart-circle-plus fa-fw"></i> 新建关系
            </button>
        `;
        container.append(addBtnHtml);
        return;
    }

    // 获取角色名称映射
    const characters = chapterState.staticMatrices.characters || {};
    const getCharName = (charId) => {
        const char = characters[charId];
        return char?.core?.name || char?.name || charId.replace('char_', '');
    };

    // 渲染每条关系边
    edges.forEach((edge, index) => {
        const participant1 = getCharName(edge.participants[0]);
        const participant2 = getCharName(edge.participants[1]);

        // 关系类型翻译
        const typeTranslations = {
            'childhood_friends': '青梅旧盟',
            'enemies': '宿敌对峙',
            'lovers': '恋人羁绊',
            'stranger_with_history': '陌路旧识'
        };
        const rawTypeText = edge.type_label || typeTranslations[edge.type] || edge.type || '';
        const relationshipLabel = ensureChineseLabel(edge.relationship_label, '尚未命名的关系');
        const typeText = ensureChineseLabel(rawTypeText, relationshipLabel || '未知关系');
        const meetingStatus = (edge.timeline?.meeting_status || '未知').trim();
        const rawSeparationState = edge.timeline?.separation_state;
        const isSeparated = typeof rawSeparationState === 'boolean'
            ? rawSeparationState
            : edge.timeline?.reunion_pending === true;
        const separationText = isSeparated ? '物理分离' : '同处一地';
        const lastInteraction = edge.timeline?.last_interaction || '未知';
        const meetingPending = meetingStatus
            ? unfamiliarStatuses.has(meetingStatus)
            : edge.narrative_status?.first_scene_together === false;

        // 计算情感权重等级
        const weight = edge.emotional_weight || 0;
        let weightClass = 'weight-low';
        if (weight >= 9) weightClass = 'weight-critical';
        else if (weight >= 7) weightClass = 'weight-high';
        else if (weight >= 4) weightClass = 'weight-medium';

        // 确定卡片样式
        let cardClass = 'sbt-relationship-edge-card';
        if (isSeparated) cardClass += ' reunion-pending';
        if (meetingPending) cardClass += ' first-meeting-pending';

        // 时间线状态标签
        const timelineStatusHtml = `
            <span class="sbt-timeline-status meeting-status">
                <i class="fa-solid fa-user-group"></i> ${meetingStatus || '未知相识'}
            </span>
            <span class="sbt-timeline-status ${isSeparated ? 'separated' : 'active'}">
                <i class="fa-solid ${isSeparated ? 'fa-route' : 'fa-users'}"></i> ${separationText}
            </span>
            <span class="sbt-timeline-status last-interaction">
                <i class="fa-solid fa-clock"></i> ${lastInteraction}
            </span>
        `;

        // 未解决张力标签
        let tensionsHtml = '';
        const tensions = Array.isArray(edge.narrative_status?.unresolved_tension)
            ? edge.narrative_status.unresolved_tension
            : [];
        if (tensions.length > 0) {
            tensionsHtml = '<div class="sbt-unresolved-tensions">';
            tensions.forEach(tension => {
                tensionsHtml += `<span class="sbt-tension-tag">${tension}</span>`;
            });
            tensionsHtml += '</div>';
        }

        // 重大事件列表
        let eventsHtml = '';
        const events = Array.isArray(edge.narrative_status?.major_events)
            ? edge.narrative_status.major_events
            : [];
        if (events.length > 0) {
            eventsHtml = '<div class="sbt-major-events-list">';
            events.forEach(event => {
                const impact = event.emotional_impact || 0;
                eventsHtml += `
                    <div class="sbt-major-event-item">
                        <i class="fa-solid fa-bookmark sbt-major-event-icon"></i>
                        <div class="sbt-major-event-content">
                            ${event.event}
                            <div class="sbt-major-event-impact">情感冲击: ${impact}/10</div>
                        </div>
                    </div>
                `;
            });
            eventsHtml += '</div>';
        }

        const cardHtml = `
            <div class="${cardClass} sbt-relationship-card-clickable" data-edge-id="${edge.id}">
                <div class="sbt-relationship-card-content">
                    <div class="sbt-relationship-card-left">
                        <div class="sbt-relationship-participants">
                            <span class="sbt-participant-name">${participant1}</span>
                            <i class="fa-solid fa-heart sbt-heart-icon"></i>
                            <span class="sbt-participant-name">${participant2}</span>
                        </div>
                        <div class="sbt-relationship-label-line">${relationshipLabel}</div>
                        <div class="sbt-relationship-meta-row">
                            <span class="sbt-relationship-type-badge">${typeText}</span>
                            ${timelineStatusHtml}
                        </div>
                    </div>
                    <div class="sbt-relationship-card-right">
                        <i class="fa-solid fa-chevron-right sbt-card-arrow"></i>
                    </div>
                </div>
            </div>
        `;
        container.append(cardHtml);
    });

    // 添加新建关系按钮（放在所有关系卡之后）
    const addBtnHtml = `
        <button class="sbt-add-relationship-btn" title="手动创建新关系">
            <i class="fa-solid fa-heart-circle-plus fa-fw"></i> 新建关系
        </button>
    `;
    container.append(addBtnHtml);

    // 添加点击事件打开详情模态框
    container.off('click', '.sbt-relationship-card-clickable');
    container.on('click', '.sbt-relationship-card-clickable', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const edgeId = $(this).data('edge-id');
        debugLog('[SBT] Opening relationship details:', edgeId);
        showRelationshipDetailModal(edgeId, chapterState);
    });
}

/**
 * @description 更新世界档案面板
 * @param {Chapter} chapterState - 完整的Chapter对象
 */
function updateArchivePanel(chapterState) {
    if (!chapterState || $('#sbt-archive-panel').length === 0) return;

    // 渲染角色档案馆
    renderArchiveCharacters(
        chapterState.staticMatrices.characters,
        $('#sbt-archive-characters')
    );

    // V3.0: 渲染关系图谱
    renderRelationshipGraph(chapterState);

    // 渲染世界观元素
    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.locations,
        '地点',
        $('#sbt-archive-locations'),
        'locations'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.items,
        '物品',
        $('#sbt-archive-items'),
        'items'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.factions,
        '势力',
        $('#sbt-archive-factions'),
        'factions'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.concepts,
        '概念',
        $('#sbt-archive-concepts'),
        'concepts'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.events,
        '历史事件',
        $('#sbt-archive-events'),
        'events'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.races,
        '种族',
        $('#sbt-archive-races'),
        'races'
    );

    // 【修复】渲染故事线 - 合并静态和动态数据
    // 辅助函数：合并故事线的静态和动态数据
    const mergeStorylineData = (category) => {
        const staticData = chapterState.staticMatrices.storylines[category] || {};
        const dynamicData = chapterState.dynamicState.storylines[category] || {};
        const merged = {};

        // 遍历所有静态故事线
        for (const id in staticData) {
            merged[id] = {
                ...staticData[id],  // 静态字段：title, summary, type, trigger, involved_chars
                ...dynamicData[id]  // 动态字段：current_status, current_summary, history
            };
        }

        return merged;
    };

    const storylineProgress = chapterState.meta?.narrative_control_tower?.storyline_progress || {};

    renderArchiveStorylines(
        mergeStorylineData('main_quests'),
        $('#sbt-archive-main-quests'),
        'main_quests',
        '主线任务',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('side_quests'),
        $('#sbt-archive-side-quests'),
        'side_quests',
        '支线任务',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('relationship_arcs'),
        $('#sbt-archive-relationship-arcs'),
        'relationship_arcs',
        '关系弧光',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('personal_arcs'),
        $('#sbt-archive-personal-arcs'),
        'personal_arcs',
        '个人成长',
        storylineProgress
    );
}

/**更新整个仪表盘UI，现在传递整个 Chapter 对象 */

/**
 * @description [V3.5] 渲染章节剧本 - 分层卡片式布局
 * @param {object} blueprint - 章节剧本对象
 * @returns {string} HTML字符串
 */
function renderChapterBlueprint(blueprint) {
    if (!blueprint || typeof blueprint !== 'object') {
        return '<p class="sbt-instructions">当前没有激活的创作蓝图。</p>';
    }

    // V4.2 节拍类型映射（扩展）
    const beatTypeMap = {
        'Action': '动作',
        'Dialogue Scene': '对话',
        'Hybrid Scene': '混合场景',
        'Transition': '过渡',
        'Internal Transition': '内部转场',
        'Reflection': '反思'
    };

    // V4.2 节拍类型样式类映射（扩展）
    const beatTypeClassMap = {
        'Action': 'action',
        'Dialogue Scene': 'dialogue',
        'Hybrid Scene': 'hybrid',
        'Transition': 'transition',
        'Internal Transition': 'internal-transition',
        'Reflection': 'reflection'
    };

    let html = '';

    // === 第1层：章节概览卡片 ===
    html += '<div class="sbt-blueprint-overview-card">';
    html += '<div class="sbt-blueprint-section-title">';
    html += '<i class="fa-solid fa-book-open"></i> 章节概览';
    html += '</div>';

    // 章节标题
    if (blueprint.title) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">章节标题</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="title">${blueprint.title}</div>
        </div>`;
    }

    // 情感弧光
    if (blueprint.emotional_arc) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">情感弧光</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="emotional_arc">${blueprint.emotional_arc}</div>
        </div>`;
    }

    // 核心冲突
    if (blueprint.core_conflict) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">核心冲突</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="core_conflict">${blueprint.core_conflict}</div>
        </div>`;
    }

    // 玩家补充（绝对优先级）
    const playerSupplement = blueprint.player_supplement || '';
    html += `<div class="sbt-blueprint-field sbt-player-supplement-field">
        <div class="sbt-blueprint-field-label">
            玩家补充 <span style="font-size: 0.8em; color: var(--sbt-text-dim);">(优先级最高)</span>
        </div>
        <div class="sbt-blueprint-field-value sbt-player-supplement-input" contenteditable="true" data-field="player_supplement" placeholder="补充说明...">${playerSupplement}</div>
    </div>`;

    html += '</div>'; // 结束概览卡片

    // === 第2层：情节节拍列表 ===
    if (blueprint.plot_beats && Array.isArray(blueprint.plot_beats) && blueprint.plot_beats.length > 0) {
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title">';
        html += '<i class="fa-solid fa-list-ol"></i> 情节节拍';
        html += `<span class="sbt-beat-count">${blueprint.plot_beats.length} 个节拍</span>`;
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';

        blueprint.plot_beats.forEach((beat, index) => {
            const beatNum = index + 1;
            const beatType = beat.type || 'Action';
            const normalizedBeatType = typeof beatType === 'string' ? beatType.replace(/_/g, ' ').trim() : beatType;
            const beatTypeChinese = beatTypeMap[normalizedBeatType] || beatTypeMap[beatType] || normalizedBeatType || '未知';
            const beatTypeClass = beatTypeClassMap[normalizedBeatType] || beatTypeClassMap[beatType] || 'action';
            const isHighlight = beat.is_highlight || false;

            html += `<div class="sbt-beat-card ${isHighlight ? 'highlight' : ''}" data-beat-index="${index}">`;

            // 节拍头部
            html += '<div class="sbt-beat-header">';
            html += `<span class="sbt-beat-number">${beatNum}</span>`;
            html += `<span class="sbt-beat-type-badge ${beatTypeClass}">${beatTypeChinese}</span>`;
            if (isHighlight) {
                html += '<i class="fa-solid fa-star sbt-highlight-star" title="高光节拍"></i>';
            }
            html += '</div>';

            // 物理事件（兼容摘要）
            if (beat.core_conflict) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-bolt"></i> 核心冲突</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="core_conflict">${beat.core_conflict}</div>
                </div>`;
            }

            if (beat.narrative_texture) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-feather"></i> 叙事肌理</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="narrative_texture">${beat.narrative_texture}</div>
                </div>`;
            }

            if (beat.physical_event) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-bolt"></i> 物理事件</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="physical_event">${beat.physical_event}</div>
                </div>`;
            }

            // 环境状态（可选）
            if (beat.environment_state) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-cloud-sun"></i> 环境状态</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="environment_state">${beat.environment_state}</div>
                </div>`;
            }

            // 状态变更（可选）
            if (beat.state_change) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-exchange-alt"></i> 状态变更</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="state_change">${beat.state_change}</div>
                </div>`;
            }

            // 潜台词方向（可选）
            if (beat.subtext_design) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-comment-dots"></i> 潜台词方向</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="subtext_design">${beat.subtext_design}</div>
                </div>`;
            }

            // 退出条件（Dialogue Scene必填）
            if (beat.exit_condition) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-door-open"></i> 退出条件</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="exit_condition">${beat.exit_condition}</div>
                </div>`;
            }

            // 向后兼容：如果还有旧的description字段
            if (beat.description && !beat.physical_event) {
                html += `<div class="sbt-beat-description" contenteditable="true" data-beat-index="${index}" data-field="description">${beat.description}</div>`;
            }

            html += '</div>'; // 结束节拍卡片
        });

        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    // === 第3层：高光时刻设计 ===
    if (blueprint.highlight_moment_design) {
        const highlight = blueprint.highlight_moment_design;
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon collapsed"></i>';
        html += '<i class="fa-solid fa-star"></i> 高光时刻设计';
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content collapsed">';
        html += '<div class="sbt-highlight-card">';

        // 高光类型
        if (highlight.type) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-tag"></i> 高光类型</div>
                <div class="sbt-blueprint-field-value" contenteditable="true" data-field="highlight_moment_design.type">${highlight.type}</div>
            </div>`;
        }

        // 目标节拍
        if (highlight.target_beat !== undefined) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-bullseye"></i> 目标节拍</div>
                <div class="sbt-blueprint-field-value">节拍 ${highlight.target_beat + 1}</div>
            </div>`;
        }

        // 设计意图
        if (highlight.design_rationale) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-lightbulb"></i> 设计意图</div>
                <div class="sbt-blueprint-field-value" contenteditable="true" data-field="highlight_moment_design.design_rationale">${highlight.design_rationale}</div>
            </div>`;
        }

        html += '</div>'; // 结束highlight-card
        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    return html;
}

export function updateDashboard(chapterState) {
    if ($('#beat-tracker-component-wrapper').length === 0) return;
    const $drawer = $('#beat-tracker-content-panel');
    if ($drawer.length > 0 && !$drawer.hasClass('openDrawer')) {
        // 抽屉关闭时不做重渲染，避免后台大量DOM更新导致卡顿
        return;
    }

    let effectiveState = resolveRenderableChapterState(chapterState);

    if (!effectiveState) return;
    chapterState = effectiveState;
    if (typeof window !== 'undefined' && window.__sbtLiveLeaderAvailable === true) {
        $('#sbt-static-mode-banner').hide();
    }
// V4.2 调试：验证UI收到的章节数据
    debugGroup('[RENDERERS-V4.2-DEBUG] updateDashboard 收到数据');
    debugLog('章节UID:', chapterState.uid);
    debugGroupEnd();

    const isMonitorVisible = $('#sbt-monitor-panel').is(':visible');
    const isArchiveVisible = $('#sbt-archive-panel').is(':visible');

    // --- 1. 【V3.6 革新】渲染故事摘要 ---
    const summaryContainer = $('#sbt-story-summary-content');
    if (isMonitorVisible && summaryContainer.length > 0) {
        const longTermSummary = chapterState.meta?.longTermStorySummary || "暂无故事摘要。";

        let html = '';

        // 第一部分：编年史家视角（概要）
        html += '<div class="sbt-summary-section">';
        html += '<div class="sbt-summary-section-title">';
        html += '<i class="fa-solid fa-book"></i> 故事梗概';
        html += '<button class="sbt-edit-summary-btn" data-field="longTermStorySummary" title="编辑故事梗概"><i class="fa-solid fa-pen-to-square"></i></button>';
        html += '</div>';
        const summaryLines = String(longTermSummary)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (summaryLines.length === 0) {
            html += `<div class="sbt-summary-content" id="sbt-summary-display">暂无故事摘要。</div>`;
        } else {
            html += '<ol class="sbt-summary-list" id="sbt-summary-display">';
            summaryLines.forEach((line, idx) => {
                const displayLine = line.length > 40 ? line.slice(0, 40) : line;
                html += `
                    <li class="sbt-summary-item">
                        <span class="sbt-summary-index">${idx + 1}</span>
                        <span class="sbt-summary-text">${displayLine}</span>
                    </li>`;
            });
            html += '</ol>';
        }
        html += '</div>';

        summaryContainer.html(html);
    }

    // --- 2. 【V3.5 革新】渲染章节剧本 - 使用新的卡片式布局 ---
    const scriptContainer = $('#sbt-active-script-content');
    if (isMonitorVisible && scriptContainer.length > 0) {
        const blueprintHtml = renderChapterBlueprint(chapterState.chapter_blueprint);
        scriptContainer.html(blueprintHtml);

        // 控制重roll按钮的显示：当有有效剧本时显示按钮
        const $rerollBtn = $('#sbt-reroll-blueprint-btn');
        if (chapterState.chapter_blueprint && Object.keys(chapterState.chapter_blueprint).length > 0) {
            $rerollBtn.show();
        } else {
            $rerollBtn.hide();
        }
    }

    // --- 3. 【革新】渲染全新的"自省式"设计笔记 ---
    const notesContainer = $('#sbt-design-notes-content');
    const isDesignNotesEnabled = () => localStorage.getItem('sbt-design-notes-enabled') !== 'false';
    if (isMonitorVisible && notesContainer.length > 0) {
        if (!isDesignNotesEnabled()) {
            notesContainer.empty();
        } else {
        const notes = chapterState.activeChapterDesignNotes;
        if (notes && typeof notes === 'object') {
            // 通用渲染函数（保持原有风格）
            const renderField = (icon, label, content) => {
                if (!content || content === 'N/A') return '';
                return `<div style="margin: 3px 0;"><strong><i class="${icon} fa-fw"></i> ${label}:</strong> <span style="margin-left: 6px; color: var(--sbt-text-light);">${content}</span></div>`;
            };

            // 1. 玩家焦点执行 (黄色)
            let playerFocusHtml = '';
            if (notes.player_focus_execution) {
                const exec = notes.player_focus_execution;
                const nodeNumber = exec?.['node number'] || notes['node number'] || notes.node_number;
                if (exec.player_instruction || exec.execution_logic || exec.conflict_resolution || nodeNumber) {
                    playerFocusHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #FFD700;">
                            <h6 style="margin: 0 0 4px 0; color: #FFD700; font-size: 0.95em;"><i class="fa-solid fa-crown fa-fw"></i> 玩家意志执行</h6>
                            ${renderField('fa-solid fa-bullhorn', '指令', exec.player_instruction)}
                            ${renderField('fa-solid fa-gears', '逻辑', exec.execution_logic)}
                            ${renderField('fa-solid fa-shield-halved', '冲突', exec.conflict_resolution)}
                            ${renderField('fa-solid fa-hashtag', '节点数量', nodeNumber)}
                        </div>
                    `;
                }
            }

            // 2. 情感基调与故事线 (紫色) - V13.0升级
            let toneHtml = '';
            if (notes.emotional_tone_strategy) {
                const tone = notes.emotional_tone_strategy;
                toneHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #9b59b6;">
                        <h6 style="margin: 0 0 4px 0; color: #9b59b6; font-size: 0.95em;"><i class="fa-solid fa-palette fa-fw"></i> 基调锚定 (V13.0)</h6>
                        ${renderField('fa-solid fa-heart', '核心基调', tone.core_emotional_tone)}
                        ${renderField('fa-solid fa-diagram-project', '选定故事线', tone.chosen_storylines_and_reasoning)}
                        ${renderField('fa-solid fa-check-double', '相容性检查', tone.compatibility_check)}
                        ${tone.pollution_detection ? renderField('fa-solid fa-exclamation-triangle', '污染元素', tone.pollution_detection) : ''}
                        ${renderField('fa-solid fa-link', '编织逻辑', notes.storyline_weaving)}
                    </div>
                `;
            }

            // 3. 多巴胺工程验证 (橙色) - V13.0统一
            let dopamineHtml = '';
            if (notes.dopamine_blueprint) {
                const dp = notes.dopamine_blueprint;
                dopamineHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--sbt-warning-color);">
                        <h6 style="margin: 0 0 4px 0; color: var(--sbt-warning-color); font-size: 0.95em;"><i class="fa-solid fa-fire fa-fw"></i> 多巴胺工程</h6>
                        ${renderField('fa-solid fa-bolt', '即时反馈', dp.immediacy_check)}
                        ${renderField('fa-solid fa-star', '独占性', dp.exclusivity_justification)}
                        ${renderField('fa-solid fa-wand-magic-sparkles', '套路翻新', dp.trope_innovation)}
                        ${renderField('fa-solid fa-list-check', '结构检查', dp.structure_check)}
                        ${renderField('fa-solid fa-gift', '实质奖励', dp.tangible_rewards)}
                        ${renderField('fa-solid fa-anchor', '钩子设计', dp.hook_design)}
                    </div>
                `;
            }

            // 4. 沉浸流 (粉色)
            let immersionHtml = '';
            if (notes.elevation_design_logic?.unique_spark) {
                const elev = notes.elevation_design_logic;
                immersionHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #e91e63;">
                        <h6 style="margin: 0 0 4px 0; color: #e91e63; font-size: 0.95em;"><i class="fa-solid fa-heart-pulse fa-fw"></i> 沉浸流设计</h6>
                        ${renderField('fa-solid fa-wand-magic-sparkles', '创意', elev.unique_spark)}
                        ${renderField('fa-solid fa-fingerprint', '独特性', elev.irreplaceability_defense)}
                        ${renderField('fa-solid fa-book-open', '策略', elev.reference_strategy)}
                    </div>
                `;
            }

            // 5. 逻辑与时空 (青色) - V13.0扩容
            let logicHtml = '';
            if (notes.chronology_compliance || notes.dual_horizon_analysis || notes.affinity_logic_audit) {
                logicHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #1abc9c;">
                        <h6 style="margin: 0 0 4px 0; color: #1abc9c; font-size: 0.95em;"><i class="fa-solid fa-brain fa-fw"></i> 逻辑与时空</h6>
                        ${renderField('fa-solid fa-clock', '时空', notes.chronology_compliance)}
                        ${renderField('fa-solid fa-binoculars', '双地平线', notes.dual_horizon_analysis)}
                        ${notes.affinity_logic_audit ? `
                            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
                                <div style="font-size:0.9em; font-weight:bold; color:#1abc9c; margin-bottom:2px;"><i class="fa-solid fa-scale-balanced"></i> 双层动机论:</div>
                                ${renderField('fa-solid fa-user', '对象', notes.affinity_logic_audit.target_character)}
                                ${renderField('fa-solid fa-chart-line', '阶段', notes.affinity_logic_audit.current_affinity_stage)}
                                ${renderField('fa-solid fa-dna', '生物层', notes.affinity_logic_audit.biological_layer_check)}
                                ${renderField('fa-solid fa-masks-theater', '性格层', notes.affinity_logic_audit.personality_layer_justification)}
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            // 6. 事件优先级 (橙红) - 扩容点
            let priorityHtml = '';
            if (notes.event_priority_report) {
                const pr = notes.event_priority_report;
                priorityHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #d35400;">
                        <h6 style="margin: 0 0 4px 0; color: #d35400; font-size: 0.95em;"><i class="fa-solid fa-ranking-star fa-fw"></i> 事件优先级</h6>
                        ${renderField('fa-solid fa-star', 'S级', Array.isArray(pr.S_tier_events) ? pr.S_tier_events.join('; ') : pr.S_tier_events)}
                        ${renderField('fa-solid fa-clock-rotate-left', '延后(S)', Array.isArray(pr.deferred_events) ? pr.deferred_events.join('; ') : pr.deferred_events)}
                        ${renderField('fa-solid fa-scale-unbalanced', '取舍', pr.priority_conflict_resolution)}
                    </div>
                `;
            }

            // 7. 结构与收尾 (深蓝) - 新增
            let endingHtml = '';
            if (notes.ending_structure_choice || notes.connection_and_hook) {
                endingHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #34495e;">
                        <h6 style="margin: 0 0 4px 0; color: #34495e; font-size: 0.95em;"><i class="fa-solid fa-door-closed fa-fw"></i> 结构与收尾</h6>
                        ${renderField('fa-solid fa-scissors', '结构裁决', notes.ending_structure_choice)}
                        ${renderField('fa-solid fa-anchor', '承上启下', notes.connection_and_hook)}
                    </div>
                `;
            }

            // 8. 互动自检 (绿色)
            let interactionHtml = '';
            if (notes.interaction_self_check) {
                interactionHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #2ecc71;">
                        <h6 style="margin: 0 0 4px 0; color: #2ecc71; font-size: 0.95em;"><i class="fa-solid fa-comments fa-fw"></i> 互动自检</h6>
                        ${renderField('fa-solid fa-list-check', '自检', notes.interaction_self_check)}
                    </div>
                `;
            }

            // 8.5 节拍折叠率 (深青)
            let densityHtml = '';
            if (notes.beat_density_strategy) {
                densityHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #16a085;">
                        <h6 style="margin: 0 0 4px 0; color: #16a085; font-size: 0.95em;"><i class="fa-solid fa-layer-group fa-fw"></i> 节拍折叠率</h6>
                        ${renderField('fa-solid fa-compress', '策略', notes.beat_density_strategy)}
                    </div>
                `;
            }

            // 8.6 章节节奏审核 (深蓝绿)
            let pacingAuditHtml = '';
            if (notes.chapter_pacing_audit && typeof notes.chapter_pacing_audit === 'object') {
                const audit = notes.chapter_pacing_audit;
                pacingAuditHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #0f7c8c;">
                        <h6 style="margin: 0 0 4px 0; color: #0f7c8c; font-size: 0.95em;"><i class="fa-solid fa-gauge-high fa-fw"></i> 章节节奏审核</h6>
                        ${renderField('fa-solid fa-book', '故事概述', audit.story_summary)}
                        ${renderField('fa-solid fa-list-ol', '节拍数量', audit.beat_count)}
                        ${renderField('fa-solid fa-pen-nib', '目标字数', audit.total_word_target)}
                        ${renderField('fa-solid fa-scale-balanced', '节奏判断', audit.pacing_assessment)}
                    </div>
                `;
            }

            // 9. 非剧情对话遵守说明 (青色)
            let nonDialogueHtml = '';
            if (notes.non_dialogue_compliance_note) {
                nonDialogueHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #1abc9c;">
                        <h6 style="margin: 0 0 4px 0; color: #1abc9c; font-size: 0.95em;"><i class="fa-solid fa-list-ol fa-fw"></i> 非剧情对话遵守说明</h6>
                        ${renderField('fa-solid fa-clipboard-check', '说明', notes.non_dialogue_compliance_note)}
                    </div>
                `;
            }

            // 10. 自我审查 (灰色)
            let scrutinyHtml = '';
            const sr = notes.self_scrutiny_report;
            if (sr && (sr.anti_performance || sr.anti_thematic_greed)) {
                scrutinyHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #7f8c8d;">
                        <h6 style="margin: 0 0 4px 0; color: #7f8c8d; font-size: 0.95em;"><i class="fa-solid fa-user-secret fa-fw"></i> 自我审查</h6>
                        ${renderField('fa-solid fa-mask', '去表演化', sr.anti_performance)}
                        ${renderField('fa-solid fa-filter', '聚焦检查', sr.anti_thematic_greed)}
                    </div>
                `;
            }

            // 组装 - V13.0更新顺序
            const notesHtml = `
                ${playerFocusHtml}
                ${toneHtml}
                ${dopamineHtml}
                ${immersionHtml}
                ${priorityHtml}
                ${logicHtml}
                ${endingHtml}
                ${interactionHtml}
                ${densityHtml}
                ${pacingAuditHtml}
                ${nonDialogueHtml}
                ${scrutinyHtml}
            `;
            notesContainer.html(notesHtml);

        } else {
            notesContainer.html('<p class="sbt-instructions">当前章节没有可用的设计笔记。</p>');
        }
        }
    }

    // --- 4. 渲染角色关系图谱 ---
    const relationshipContainer = $('#sbt-character-chart');
    if (isArchiveVisible && relationshipContainer.length > 0) {
        renderCharacterRelationships(chapterState, relationshipContainer);
    }

    // --- 5. 渲染故事线网络 ---
    if (isArchiveVisible) {
        // 【修复】合并所有分类的静态和动态故事线数据
        const allStorylines = {};
        const categories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];

        for (const category of categories) {
            const staticData = chapterState.staticMatrices.storylines[category] || {};
            const dynamicData = chapterState.dynamicState.storylines[category] || {};

            for (const id in staticData) {
                allStorylines[id] = {
                    ...staticData[id],  // 静态字段
                    ...dynamicData[id]  // 动态字段
                };
            }
        }

        renderLineMatrix(allStorylines, $('#sbt-line-matrix-list'));
    }

    // --- 6. 更新世界档案面板 ---
    if (isArchiveVisible) {
        updateArchivePanel(chapterState);
    }
}

// 导出模态框函数，供外部使用
export { showCharacterDetailModal, showCharacterDetailPopup, showWorldviewDetailModal, showStorylineDetailModal, showRelationshipDetailModal };


