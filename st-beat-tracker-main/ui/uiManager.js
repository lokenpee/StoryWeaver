// ui/uiManager.js
import { SbtPopupConfirm } from './SbtPopupConfirm.js';
import { simpleConfirm } from './simpleConfirm.js';
import { updateDashboard, resolveRenderableChapterState, showCharacterDetailModal, showWorldviewDetailModal, showStorylineDetailModal, showRelationshipDetailModal } from './renderers.js';
import applicationFunctionManager from '../manager.js';
import { getApiSettings, saveApiSettings} from '../stateManager.js';
import { mapValueToHue } from '../utils/colorUtils.js';
import { clampAffinityValue } from '../utils/affinityUtils.js';
import { showNarrativeFocusPopup, showSagaFocusPopup } from './popups/proposalPopup.js';
import { populateSettingsUI, bindPasswordToggleHandlers, bindSettingsSaveHandler, bindAPITestHandlers, bindPresetSelectorHandlers, populatePromptManagerUI, bindPromptManagerHandlers, bindModelRefreshHandlers, bindDossierSchemaHandlers } from './settings/settingsUI.js';
import * as staticDataManager from '../src/StaticDataManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('UIManager');
let lastChapterStateForUi = null;

const deps = {
    onReanalyzeWorldbook: () => logger.warn("onReanalyzeWorldbook not injected"),
    onForceChapterTransition: () => logger.warn("onForceChapterTransition not injected"),
    onStartGenesis: () => logger.warn("onStartGenesis not injected"),
    onRerollChapterBlueprint: () => logger.warn("onRerollChapterBlueprint not injected"),
    onForceEndSceneClick: () => logger.warn("onForceEndSceneClick not injected"),
    onSetNarrativeFocus: () => logger.warn("onSetNarrativeFocus not injected"),
    onSaveCharacterEdit: () => logger.warn("onSaveCharacterEdit not injected"),
    getLeaderAnchorsForCurrentChat: () => [],
    applyLeaderAnchors: () => ({ applied: 0, skipped: 0, lastAppliedIndex: -1 }),
    getLeaderAnchorsByChatForCharacter: () => [],
    removeLeaderAnchor: () => ({ removed: false, reason: 'not_injected' }),
    removeAllLeaderAnchorsForCharacter: () => ({ chatsProcessed: 0, anchorsRemoved: 0, metadataCleared: 0, chatsFailed: 0 }),
    removeAllLeaderAnchorsForAllCharacters: () => ({ charactersProcessed: 0, chatsProcessed: 0, anchorsRemoved: 0, metadataCleared: 0, chatsFailed: 0 }),
    mainLlmService: null,
    conductorLlmService: null,
    eventBus: null,
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    diagnose: logger.error.bind(logger),
    toastr: {
        info: (msg, title) => logger.info(`[Toast-Info: ${title}] ${msg}`),
        success: (msg, title) => logger.debug(`[Toast-Success: ${title}] ${msg}`),
        warning: (msg, title) => logger.warn(`[Toast-Warning: ${title}] ${msg}`),
        error: (msg, title) => logger.error(`[Toast-Error: ${title}] ${msg}`)
    }
};

const STATIC_CACHE_SOURCE = 'static_cache';
const TEMP_CACHE_UID = 'temp_cached_view';

function isStaticArchiveState(state) {
    return !!(state && (state.__source === STATIC_CACHE_SOURCE || state.uid === TEMP_CACHE_UID));
}

function resolveStaticCharacterId(state) {
    if (!state) return null;
    if (state.characterId) return state.characterId;
    const characters = state.staticMatrices?.characters || {};
    const ids = Object.keys(characters);
    return ids.length > 0 ? ids[0] : null;
}

export function initializeUIManager(dependencies) {
    Object.assign(deps, dependencies);

    deps.showSagaFocusPopup = showSagaFocusPopup;
    deps.showNarrativeFocusPopup = showNarrativeFocusPopup;
    const originalSaveHandler = typeof deps.onSaveCharacterEdit === 'function' ? deps.onSaveCharacterEdit : null;
    deps.onSaveCharacterEdit = async (actionType, chapterState) => {
        if (isStaticArchiveState(chapterState)) {
            deps.info(`[UIManager] 静态档案编辑保存: action=${actionType}, source=${chapterState?.__source || 'unknown'}`);
            const characterId = resolveStaticCharacterId(chapterState);
            if (!characterId) {
                deps.warn(`[UIManager] 静态档案保存失败：缺少 characterId（action=${actionType}）`);
                return;
            }
            if (!chapterState.staticMatrices) {
                deps.warn('[UIManager] 静态档案保存失败：staticMatrices 不存在');
                return;
            }
            try {
                staticDataManager.saveStaticData(characterId, chapterState.staticMatrices);
                staticDataManager.saveStaticBaseline(characterId, chapterState.staticMatrices, { overwrite: true });
                deps.info(`[UIManager] 静态档案已写入 (${characterId}) [${actionType}]`);
            } catch (error) {
                deps.diagnose('[UIManager] 写入静态档案失败:', error);
                throw error;
            }
            return;
        }
        deps.info(`[UIManager] 非静态档案保存，写入 leader: action=${actionType}`);
        if (originalSaveHandler) {
            return originalSaveHandler(actionType, chapterState);
        }
    };
    
    if (deps.eventBus) {
        deps.eventBus.on('CHAPTER_UPDATED', (chapterState) => {
            deps.info("[UIManager] 接收到 'CHAPTER_UPDATED' 事件，正在刷新仪表盘...");
            if (chapterState) {
                lastChapterStateForUi = chapterState;
                updateDashboard(chapterState);
            }
        });
        deps.info("[UIManager] 已成功订阅 'CHAPTER_UPDATED' 事件。");
    } else {
        deps.diagnose("[UIManager] EventBus 实例未被正确注入，UI将无法自动刷新！");
    }

    deps.info("[UIManager] UI管理器初始化完成，所有交互函数已注入。");
    return deps; // 返回最终的依赖对象
}

export async function setupUI() {
    const PLUGIN_FOLDER_NAME = 'st-beat-tracker';
    const PLUGIN_PATH = `third-party/${PLUGIN_FOLDER_NAME}`;
    
    const { renderExtensionTemplateAsync } = applicationFunctionManager;
const html = await renderExtensionTemplateAsync(PLUGIN_PATH, 'drawer-component');
$('#extensions-settings-button').after(html);
    setTimeout(() => {
        deps.info("[UIManager] DOM 就绪，开始绑定UI事件...");

    const $wrapper = $('#beat-tracker-component-wrapper');
        if ($wrapper.length === 0) {
            deps.diagnose("[UIManager] 严重错误：无法找到顶层容器 #beat-tracker-component-wrapper！UI将完全失效。");
            return;
        }
    // -- 维护当前章节状态的全局引用 --
    let currentChapterState = null;
    let isLockedInStaticMode = false; // 标记是否锁定在静态数据库模式
    let lastActiveCharacterId = null;
    let lastConductorSummary = null;

    // 辅助函数：在交互时获取"最真实"的章节状态
    // 如果锁定在静态模式，则不再尝试切换到leader状态
    const getEffectiveChapterState = () => {
        // 如果已锁定在静态模式，直接返回当前状态，不再尝试切换
        if (isLockedInStaticMode) {
            return currentChapterState;
        }

        // 否则尝试获取最新的leader状态
        const resolvedState = resolveRenderableChapterState(currentChapterState);
        if (resolvedState && resolvedState !== currentChapterState) {
            currentChapterState = resolvedState;
        }
        return currentChapterState;
    };

    const refreshStaticModeBanner = () => {
        const $banner = $('#sbt-static-mode-banner');
        if ($banner.length === 0) return;

        // 只要锁定在静态模式，就显示横幅
        if (isLockedInStaticMode) {
            $banner.show();
        } else {
            $banner.hide();
        }
    };

    const applyConductorSummary = (summary) => {
        if (!summary || typeof summary !== 'object') return;
        const $panel = $('#sbt-conductor-summary-panel');
        if ($panel.length === 0) return;

        const totalBeats = Number.isFinite(Number(summary.totalBeats)) ? Number(summary.totalBeats) : 0;
        const beatNumber = Number.isFinite(Number(summary.currentBeatNumber)) ? Number(summary.currentBeatNumber) : 0;
        const progressPercentRaw = Number.isFinite(Number(summary.progressPercent))
            ? Number(summary.progressPercent)
            : (totalBeats > 0 && beatNumber > 0 ? Math.round((beatNumber / totalBeats) * 100) : 0);
        const progressPercent = Math.max(0, Math.min(100, progressPercentRaw));

        const decisionLabel = summary.decisionLabel || summary.decision || '-';
        const intentLabel = summary.intentLabel || '-';
        const summaryText = summary.summaryText || summary.summary || '暂无回合执导记录。';

        $('#sbt-conductor-progress-bar').css('width', `${progressPercent}%`);
        $('#sbt-conductor-progress-text').text(totalBeats > 0 && beatNumber > 0
            ? `节拍进度：${beatNumber} / ${totalBeats}`
            : '节拍进度：- / -');
        $('#sbt-conductor-decision-chip').text(`裁判：${decisionLabel}`);
        $('#sbt-conductor-intent-chip').text(`倾向：${intentLabel}`);
        $('#sbt-conductor-summary-text').text(summaryText);

        let updatedLabel = '--';
        if (summary.updatedAt) {
            const date = new Date(summary.updatedAt);
            if (!Number.isNaN(date.getTime())) {
                updatedLabel = date.toLocaleString();
            }
        }
        $('#sbt-conductor-summary-time').text(`最近更新：${updatedLabel}`);
    };

    const syncConductorSummaryFromChapter = (chapterState) => {
        const summary = chapterState?.meta?.conductorSummary;
        if (!summary || typeof summary !== 'object') return;
        lastConductorSummary = summary;
        if ($('#sbt-conductor-summary-panel').is(':visible')) {
            applyConductorSummary(summary);
        }
    };

    // 监听CHAPTER_UPDATED事件，保存最新的章节状态
    if (deps.eventBus) {
        deps.eventBus.on('CHAPTER_UPDATED', (chapterState) => {
            const resolvedState = resolveRenderableChapterState(chapterState);
            if (resolvedState) {
                currentChapterState = resolvedState;
                // 如果收到的是真实章节状态（非静态缓存），解除静态模式锁定
                if (!isStaticArchiveState(resolvedState)) {
                    isLockedInStaticMode = false;
                    if (typeof window !== 'undefined') {
                        window.__sbtLiveLeaderAvailable = true;
                    }
                }
                refreshStaticModeBanner();
                syncConductorSummaryFromChapter(resolvedState);
            }
        });
    }

    // 【V9.1 修复】实现带重试的轮询机制
    const getDynamicStateWithRetry = async (maxRetries = 5, interval = 300) => {
        for (let i = 0; i < maxRetries; i++) {
            const resolvedState = resolveRenderableChapterState(null); // 强制重新解析
            if (resolvedState && !isStaticArchiveState(resolvedState)) {
                deps.info(`[UIManager] 动态Leader状态获取成功 (尝试 ${i + 1}/${maxRetries})`);
                return resolvedState;
            }
            deps.info(`[UIManager] 未找到动态Leader状态，将在 ${interval}ms 后重试... (尝试 ${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        deps.warn(`[UIManager] 多次尝试后仍未找到动态Leader状态。`);
        return null;
    };

    // -- 加载缓存的静态数据并显示 (V9.1 重构为异步轮询) --
    const buildEmptyChapterState = (characterId) => ({
        uid: 'sbt-empty-state',
        characterId: characterId || '',
        staticMatrices: {
            characters: {},
            worldview: { locations: {}, items: {}, factions: {}, concepts: {}, events: {}, races: {} },
            storylines: { main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {} },
            relationship_graph: { edges: [] }
        },
        dynamicState: {
            characters: {},
            worldview: { locations: {}, items: {}, factions: {}, concepts: {}, events: {}, races: {} },
            storylines: { main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {} }
        },
        meta: { longTermStorySummary: '' },
        chapter_blueprint: {},
        activeChapterDesignNotes: null
    });

    const resetStaleStaticView = (reason, characterId) => {
        const resolvedId = characterId || resolveStaticCharacterId(currentChapterState);
        currentChapterState = buildEmptyChapterState(resolvedId);
        isLockedInStaticMode = false;
        updateDashboard(currentChapterState);
        refreshStaticModeBanner();
        if (reason) {
            deps.info(`[UIManager] ${reason}`);
        }
    };

    async function loadAndDisplayCachedStaticData() {
        try {
            const resolveProtagonistName = (cached) => {
                const chars = cached?.characters || {};
                for (const [id, data] of Object.entries(chars)) {
                    if (data?.core?.isProtagonist || data?.isProtagonist) {
                        return data?.core?.name || data?.name || id;
                    }
                }
                return null;
            };

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

            const context = applicationFunctionManager.getContext ? applicationFunctionManager.getContext() : null;
            const activeCharId = context?.characterId;
            const activeCharName = context?.name2 || '';

            if (activeCharId && activeCharId !== lastActiveCharacterId) {
                lastActiveCharacterId = activeCharId;
                currentChapterState = null;
                isLockedInStaticMode = false;
                refreshStaticModeBanner();
                deps.info(`[UIManager] 角色切换检测：已重置缓存状态 (${activeCharId})`);
            }

            const liveState = await getDynamicStateWithRetry();

            if (liveState) {
                currentChapterState = liveState;
                isLockedInStaticMode = false; // 找到了真实章节，不锁定静态模式
                if (typeof window !== 'undefined') {
                    window.__sbtLiveLeaderAvailable = true;
                }
                updateDashboard(liveState);
                syncConductorSummaryFromChapter(liveState);
                deps.info('[UIManager] 检测到动态章节状态，已成功加载。');
                refreshStaticModeBanner();
                return;
            }

            // 如果轮询失败，则降级到静态缓存
            deps.info('[UIManager] 降级到静态缓存预览模式。');
            const db = staticDataManager.getFullDatabase();
            const baselineData = (typeof staticDataManager.loadStaticBaseline === 'function')
                ? staticDataManager.loadStaticBaseline(activeCharId)
                : null;
            const hasBaseline = hasMeaningfulStaticCache(baselineData);
            const cachedData = activeCharId ? db?.[activeCharId] : null;
            const hasCached = hasMeaningfulStaticCache(cachedData);

            if (!activeCharId) {
                resetStaleStaticView('No active character id; cleared stale static view.');
                deps.info('[UIManager] 未检测到当前角色ID，静态档案预览跳过。');
                return;
            }

            if (!hasBaseline && !hasCached) {
                resetStaleStaticView('Static database is empty; cleared stale static view.', activeCharId);
                deps.info('[UIManager] 静态数据库为空，无缓存数据可加载');
                return;
            }

            const selectedData = hasBaseline ? baselineData : cachedData;
            const protagonistName = resolveProtagonistName(selectedData);
            const normalizedActiveName = String(activeCharName || '').trim();
            const shouldEnforceNameMatch = normalizedActiveName
                && !/^\d+$/.test(normalizedActiveName)
                && String(activeCharId) !== normalizedActiveName;
            if (shouldEnforceNameMatch && activeCharName && protagonistName && activeCharName !== protagonistName) {
                resetStaleStaticView(
                    `Static cache mismatch: ${protagonistName} != ${activeCharName}`,
                    activeCharId
                );
                deps.warn(`[UIManager] 静态缓存与当前角色不匹配，已忽略。`, {
                    activeCharId,
                    activeCharName,
                    protagonistName
                });
                return;
            }

            if (!selectedData || !selectedData.characters || !selectedData.worldview || !hasMeaningfulStaticCache(selectedData)) {
                resetStaleStaticView(`No cached static data for ${activeCharId}; cleared stale static view.`, activeCharId);
                deps.info(`[UIManager] 角色 ${activeCharId} 暂无静态缓存数据，跳过加载`);
                return;
            }

            deps.info(`[UIManager] 找到缓存数据，正在加载角色: ${activeCharId} (name=${activeCharName || 'unknown'}, protagonist=${protagonistName || 'unknown'})`);

            const tempChapterState = {
                uid: TEMP_CACHE_UID,
                __source: STATIC_CACHE_SOURCE,
                characterId: activeCharId,
                staticMatrices: {
                    characters: selectedData.characters || {},
                    worldview: selectedData.worldview || { locations: {}, items: {}, factions: {}, concepts: {}, events: {}, races: {} },
                    storylines: selectedData.storylines || { main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {} },
                    relationship_graph: selectedData.relationship_graph || { edges: [] }
                },
                dynamicState: { characters: {}, worldview: {}, storylines: { main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {} } },
                meta: { longTermStorySummary: '（缓存数据预览）' },
                chapter_blueprint: {},
                activeChapterDesignNotes: null
            };

            if (!currentChapterState || isStaticArchiveState(currentChapterState)) {
                currentChapterState = tempChapterState;
                isLockedInStaticMode = true; // 锁定在静态数据库模式
                updateDashboard(tempChapterState);
                syncConductorSummaryFromChapter(tempChapterState);
                deps.info('[UIManager] 已显示缓存数据预览，锁定在静态数据库模式');
            } else {
                deps.info('[UIManager] 检测到真实章节状态，跳过缓存数据加载（避免覆盖）');
            }
            refreshStaticModeBanner();

        } catch (error) {
            deps.diagnose('[UIManager] 加载缓存静态数据时出错:', error);
        }
    }

    // -- 主抽屉开关 --
    $wrapper.find('.drawer-toggle').on('click', () => {
        $('#beat-tracker-icon').toggleClass('closedIcon openIcon');
        $('#beat-tracker-content-panel').toggleClass('closedDrawer openDrawer');
            if ($('#beat-tracker-content-panel').hasClass('openDrawer')) {
                populateSettingsUI(deps); // 传递 deps 参数
                // V13.0: 已移除叙事模式选择器 - 多巴胺工程已整合到主prompt中
                // populateNarrativeModeSelector(deps);
                populatePromptManagerUI(deps); // 填充提示词管理UI

                // 【新增】加载并显示静态数据缓存（如果存在）
                loadAndDisplayCachedStaticData();
                if (lastChapterStateForUi) {
                    updateDashboard(lastChapterStateForUi);
                }
                $wrapper.find('#sbt-refresh-db-btn').trigger('click');
            }
    });

    // -- Anchor refresh button --
    $wrapper.on('click', '#sbt-anchor-refresh-btn', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $btn = $(this);
        if ($btn.prop('disabled')) return;
        $btn.prop('disabled', true).addClass('is-loading');
        try {
            const reloadChat = applicationFunctionManager.reloadCurrentChat;
            if (typeof reloadChat !== 'function') {
                throw new Error('reloadCurrentChat_not_available');
            }
            await reloadChat(); // 完全模拟重新进入聊天
            await loadAndDisplayCachedStaticData();
            deps.toastr?.success?.('已重新拉取聊天数据', '刷新完成');
        } catch (error) {
            deps.diagnose?.('[UIManager] 刷新数据失败:', error);
            deps.toastr?.error?.('刷新失败，请重试', '刷新异常');
        } finally {
            $btn.prop('disabled', false).removeClass('is-loading');
        }
    });

    
    // -- Tab 导航：支持鼠标拖拽横向滚动 --
    let isTabDragging = false;
    let tabDragStartX = 0;
    let tabDragScrollLeft = 0;
    let tabDragMoved = false;
    let tabDragLastTime = 0;

    $wrapper.on('mousedown', '#sbt-tab-nav', function(e) {
        if (e.button !== 0) return;
        isTabDragging = true;
        tabDragMoved = false;
        tabDragStartX = e.pageX;
        tabDragScrollLeft = this.scrollLeft;
        $(this).addClass('is-dragging');
    });

    $wrapper.on('mousemove', '#sbt-tab-nav', function(e) {
        if (!isTabDragging) return;
        const deltaX = e.pageX - tabDragStartX;
        if (Math.abs(deltaX) > 3) {
            tabDragMoved = true;
        }
        this.scrollLeft = tabDragScrollLeft - deltaX;
        e.preventDefault();
    });

    $(document).on('mouseup', () => {
        if (!isTabDragging) return;
        isTabDragging = false;
        tabDragLastTime = tabDragMoved ? Date.now() : 0;
        $('#sbt-tab-nav').removeClass('is-dragging');
    });

        $wrapper.on('click', '#sbt-tab-nav .sbt-tab-btn', function() {
        if (tabDragMoved && Date.now() - tabDragLastTime < 200) {
            tabDragMoved = false;
            return;
        }
        tabDragMoved = false;
        const $button = $(this);
        const targetPanelId = $button.data('panel');

        // 1. 处理按钮的 active 状态 (这部分不变，因为它工作正常)
        $wrapper.find('.sbt-tab-btn').removeClass('active');
        $button.addClass('active');

  
            // 2. 在面板包装器内部处理面板的显隐
            // 这是最关键的一步：确保我们只隐藏目标容器内的面板
            $('.sbt-panels-wrapper .sbt-tab-panel').hide();
            $(`#${targetPanelId}`).show();
            
            deps.info(`切换到面板: #${targetPanelId}`);
        });

    // -- 通用: 所有面板的分类折叠逻辑（世界档案 + 创作工坊）--
    $wrapper.on('click', '.sbt-category-header', function() {
        const $header = $(this);
        if ($header.hasClass('sbt-no-toggle') || $header.data('noToggle')) {
            return;
        }
        const $content = $header.next('.sbt-library-items');
        $header.toggleClass('collapsed');
        $content.toggleClass('collapsed');
    });

    // -- [V3.5] 章节剧本: 折叠/展开交互 --
    $wrapper.on('click', '.sbt-blueprint-section-title.sbt-collapsible', function() {
        const $title = $(this);
        const $section = $title.closest('.sbt-blueprint-section');
        const $content = $section.find('.sbt-blueprint-section-content');
        const $icon = $title.find('.sbt-collapse-icon');

        // 切换展开/折叠状态
        $content.toggleClass('collapsed');
        $icon.toggleClass('collapsed');
    });

    // -- [V3.5] 章节剧本: 编辑功能 --
    // 处理概览字段编辑（title, emotional_arc, core_conflict）
    $wrapper.on('blur', '.sbt-blueprint-field-value[contenteditable="true"]', async function() {
        const $field = $(this);
        const fieldPath = $field.data('field');
        const newValue = $field.text().trim();
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || !fieldPath) return;

        // 更新chapter_blueprint中的对应字段
        const pathParts = fieldPath.split('.');
        let target = effectiveState.chapter_blueprint;

        // 导航到目标对象
        for (let i = 0; i < pathParts.length - 1; i++) {
            if (!target[pathParts[i]]) {
                target[pathParts[i]] = {};
            }
            target = target[pathParts[i]];
        }

        // 更新最终字段
        const finalKey = pathParts[pathParts.length - 1];
        const oldValue = target[finalKey];

        if (oldValue !== newValue) {
            target[finalKey] = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('blueprint_updated', effectiveState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            deps.toastr.success(`已更新"${fieldPath}"`, '保存成功');
        }
    });

    // 处理节拍描述编辑
    $wrapper.on('blur', '.sbt-beat-description[contenteditable="true"]', async function() {
        const $field = $(this);
        const beatIndex = parseInt($field.data('beat-index'), 10);
        const newValue = $field.text().trim();
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || isNaN(beatIndex)) return;

        const beat = effectiveState.chapter_blueprint?.plot_beats?.[beatIndex];
        if (beat && beat.description !== newValue) {
            beat.description = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('blueprint_updated', effectiveState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            deps.toastr.success(`已更新节拍 ${beatIndex + 1}`, '保存成功');
        }
    });

    // 处理节拍详细字段编辑（物理事件、环境状态、状态变更、退出条件等）
    $wrapper.on('blur', '.sbt-beat-field-value[contenteditable="true"]', async function() {
        const $field = $(this);
        const beatIndex = parseInt($field.data('beat-index'), 10);
        const fieldName = $field.data('field');
        const newValue = $field.text().trim();
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || isNaN(beatIndex) || !fieldName) return;

        const beat = effectiveState.chapter_blueprint?.plot_beats?.[beatIndex];
        if (beat && beat[fieldName] !== newValue) {
            beat[fieldName] = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('blueprint_updated', effectiveState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            // 字段名映射为中文
            const fieldNameMap = {
                'core_conflict': '核心冲突',
                'narrative_texture': '叙事肌理',
                'physical_event': '物理事件',
                'environment_state': '环境状态',
                'state_change': '状态变更',
                'subtext_design': '潜台词方向',
                'exit_condition': '退出条件'
            };
            const fieldChinese = fieldNameMap[fieldName] || fieldName;

            deps.toastr.success(`已更新节拍 ${beatIndex + 1} 的${fieldChinese}`, '保存成功');
        }
    });

    // 处理节拍退出条件编辑
    $wrapper.on('blur', '.sbt-beat-exit-condition span[contenteditable="true"]', async function() {
        const $field = $(this);
        const beatIndex = parseInt($field.data('beat-index'), 10);
        const newValue = $field.text().trim();
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || isNaN(beatIndex)) return;

        const beat = effectiveState.chapter_blueprint?.plot_beats?.[beatIndex];
        if (beat && beat.exit_condition !== newValue) {
            beat.exit_condition = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('blueprint_updated', effectiveState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            deps.toastr.success(`已更新节拍 ${beatIndex + 1} 的退出条件`, '保存成功');
        }
    });

    // -- 角色档案: 隐藏/显示切换按钮 --
    $wrapper.on('click', '.sbt-character-toggle-visibility-btn', function(e) {
        e.stopPropagation();
        const $btn = $(this);
        const charId = $btn.data('char-id');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 获取角色数据
        const char = effectiveState.staticMatrices.characters[charId];
        if (!char) return;

        // 切换隐藏状态
        char.isHidden = !char.isHidden;

        // 保存状态（即使失败也继续更新UI）
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('character_visibility_toggled', effectiveState)
                .catch(err => {
                    deps.warn('[角色隐藏] 状态保存失败，但UI已更新:', err);
                });
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        // 显示提示
        const charName = char.core?.name || char.name || charId;
        const action = char.isHidden ? '隐藏' : '显示';
        deps.toastr.success(`已${action}角色：${charName}`, '角色可见性已更新');
    });

    $wrapper.on('click', '#sbt-archive-characters .sbt-archive-card', function() {
        const charId = $(this).data('char-id');
        const effectiveState = getEffectiveChapterState();
        if (charId && effectiveState) {
            showCharacterDetailModal(charId, effectiveState, false, false);
        }
    });

    // -- 世界档案面板: 新建角色 --
    $wrapper.on('click', '.sbt-add-character-btn', function() {
        const effectiveState = getEffectiveChapterState();
        if (!effectiveState) return;

        // 生成临时ID
        const tempId = `char_new_${Date.now()}`;

        // 打开详情面板（新建模式）
        showCharacterDetailModal(tempId, effectiveState, true, true);
    });

    // -- 世界档案面板: 关闭角色详情 --
    $wrapper.on('click', '#sbt-close-character-detail', function() {
        $('#sbt-character-detail-panel').hide();
    });

    // -- 角色详情: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-mode-toggle', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');
        const effectiveState = getEffectiveChapterState();

        if (charId && effectiveState) {
            // 重新渲染为编辑模式
            showCharacterDetailModal(charId, effectiveState, true);
        }
    });

    // -- 角色详情: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-edit-btn', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');
        const effectiveState = getEffectiveChapterState();

        // 检查是否是新建模式（charId以char_new_开头）
        if (charId.startsWith('char_new_')) {
            // 新建模式取消直接关闭面板
            $('#sbt-character-detail-panel').hide();
        } else {
            if (charId && effectiveState) {
                // 重新渲染为查看模式
                showCharacterDetailModal(charId, effectiveState, false, false);
            }
        }
    });

    // -- 角色详情: 删除角色 --
    $wrapper.on('click', '.sbt-delete-character-btn', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        const char = effectiveState.staticMatrices.characters[charId];
        if (!char) {
            deps.toastr.error('找不到该角色', '错误');
            return;
        }

        const charName = char.core?.name || char.name || charId;
        const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;

        // 禁止删除主角
        if (isProtagonist) {
            deps.toastr.error('不能删除主角！', '操作被拒绝');
            return;
        }

        // 确认删除
        if (!confirm(`确定要删除角色"${charName}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除角色
        delete effectiveState.staticMatrices.characters[charId];

        // 同时删除动态状态
        if (effectiveState.dynamicState.characters?.[charId]) {
            delete effectiveState.dynamicState.characters[charId];
        }

        // 关闭详情面板
        $('#sbt-character-detail-panel').hide();

        // 保存并刷新
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('character_deleted', effectiveState);
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        deps.toastr.success(`角色"${charName}"已删除`, '删除成功');
    });

    // -- 角色详情: 保存修改 --
    $wrapper.on('click', '.sbt-save-character-btn', async function() {
        const $btn = $(this);
        const oldCharId = $btn.data('char-id');
        const isNew = $btn.data('is-new') === 'true' || $btn.data('is-new') === true;
        const effectiveState = getEffectiveChapterState();

        if (!oldCharId || !effectiveState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            // 收集所有可编辑字段的数据
            const $panel = $('#sbt-character-detail-content');
            const updatedData = {};

            // 收集基本信息输入框的数据
            $panel.find('.sbt-name-input, .sbt-basic-input').each(function() {
                const $field = $(this);
                const path = $field.data('path');
                let value = $field.val().trim();

                if (path) {
                    updatedData[path] = value;
                }
            });

            // 收集 textarea 和 contenteditable 的数据
            $panel.find('.sbt-editable-textarea, .sbt-editable-text').each(function() {
                const $field = $(this);
                const path = $field.data('path');
                let value = $field.is('textarea') ? $field.val() : $field.text();
                value = value.trim();

                if (path) {
                    updatedData[path] = value;
                }
            });

            // 收集标签数据
            const tagLists = {};
            $panel.find('.sbt-tag-list').each(function(listIndex) {
                const $tagList = $(this);
                const tags = [];
                let listPath = null;

                logger.debug(`[标签收集] 第 ${listIndex} 个标签列表:`);

                $tagList.find('.sbt-tag-editable').each(function(tagIndex) {
                    const $tag = $(this);
                    const tag = $tag.text().trim();
                    const path = $tag.data('path');

                    logger.debug(`  标签 ${tagIndex}: text="${tag}", path="${path}"`);

                    // 记录路径
                    if (!listPath && path) {
                        listPath = path;
                    }

                    // 只收集非空标签
                    if (tag && tag !== '新标签') {
                        tags.push(tag);
                    }
                });

                logger.debug(`  最终路径: "${listPath}", 标签数组:`, tags);

                if (!listPath) {
                    const addPath = $tagList.find('.sbt-tag-add-btn').data('path');
                    if (addPath) {
                        listPath = addPath;
                    }
                }

                // 如果找到路径，保存这个标签列表
                if (listPath) {
                    tagLists[listPath] = tags.length > 0 ? tags : [];
                }
            });

            // 合并标签数据
            Object.assign(updatedData, tagLists);

            // 收集好感度数据
            const affinityUpdates = [];
            $panel.find('.sbt-affinity-input').each(function() {
                const $input = $(this);
                const fromCharId = $input.data('from-char');
                const toCharId = $input.data('to-char');
                const rawValue = ($input.val() ?? '').toString().trim();
                if (rawValue === '') return;

                const normalizedAffinity = clampAffinityValue(rawValue, null);
                if (normalizedAffinity === null || normalizedAffinity === undefined) {
                    logger.warn(`[UIManager] 无效的好感度输入 (${rawValue})，来源 ${fromCharId} -> ${toCharId}`);
                    return;
                }

                affinityUpdates.push({
                    fromCharId,
                    toCharId,
                    affinity: normalizedAffinity
                });
            });

            // 调试日志
            logger.debug('[编辑保存] 数据收集分析');
            logger.debug('收集到的更新数据:', JSON.parse(JSON.stringify(updatedData)));
            logger.debug('收集到的好感度更新:', affinityUpdates);
            logger.debug('是否新建:', isNew);

            // 如果是新建，需要验证必填字段并生成新ID
            let newCharId = oldCharId;
            if (isNew) {
                const charName = updatedData['core.name'];
                if (!charName) {
                    deps.toastr.error('角色名称不能为空', '保存失败');
                    $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 创建角色`);
                    logger.debug();
                    return;
                }

                // 生成新的角色ID（基于名称和时间戳）
                const timestamp = Date.now().toString(36);
                const namePart = charName.replace(/\s+/g, '_').toLowerCase();
                newCharId = `char_${namePart}_${timestamp}`;

                logger.debug(`新建角色，生成ID: ${newCharId}`);

                // 创建新角色对象
                effectiveState.staticMatrices.characters[newCharId] = {
                    isUserCreated: true, // 标记为用户手动创建
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
                    }
                };
            }

            // 更新角色数据
            const char = effectiveState.staticMatrices.characters[newCharId];
            if (!char) {
                throw new Error('角色数据未找到');
            }

            logger.debug('修改前的角色数据:', JSON.parse(JSON.stringify(char)));

            // 应用更新 - 支持嵌套路径
            for (const [path, value] of Object.entries(updatedData)) {
                // 处理嵌套路径，如 "personality.traits"
                const pathParts = path.split('.');
                let target = char;

                // 导航到最后一个属性之前
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const part = pathParts[i];
                    if (!target[part]) {
                        target[part] = {};
                    }
                    target = target[part];
                }

                // 设置最后一个属性
                const lastPart = pathParts[pathParts.length - 1];
                const oldValue = target[lastPart];
                target[lastPart] = value;

                logger.debug(`路径 "${path}": "${oldValue}" -> "${value}"`);
            }

            logger.debug('修改后的角色数据:', JSON.parse(JSON.stringify(char)));

            // 更新好感度
            for (const update of affinityUpdates) {
                const { fromCharId, toCharId, affinity } = update;
                const normalizedAffinity = clampAffinityValue(affinity, null);
                if (normalizedAffinity === null || normalizedAffinity === undefined) {
                    deps.warn(`[UIManager] 忽略无效的好感度值 (${affinity})，来源 ${fromCharId} -> ${toCharId}`);
                    continue;
                }

                // 确保 dynamicState.characters 存在
                if (!effectiveState.dynamicState) {
                    effectiveState.dynamicState = { characters: {}, worldview: {}, storylines: {} };
                }
                if (!effectiveState.dynamicState.characters) {
                    effectiveState.dynamicState.characters = {};
                }
                if (!effectiveState.dynamicState.characters[fromCharId]) {
                    effectiveState.dynamicState.characters[fromCharId] = { relationships: {} };
                }
                if (!effectiveState.dynamicState.characters[fromCharId].relationships) {
                    effectiveState.dynamicState.characters[fromCharId].relationships = {};
                }
                if (!effectiveState.dynamicState.characters[fromCharId].relationships[toCharId]) {
                    effectiveState.dynamicState.characters[fromCharId].relationships[toCharId] = { history: [] };
                }

                // 更新好感度值
                effectiveState.dynamicState.characters[fromCharId].relationships[toCharId].current_affinity = normalizedAffinity;

                logger.debug(`好感度已更新: ${fromCharId} 对 ${toCharId} = ${normalizedAffinity}`);
            }

            logger.debug();

            // 如果有保存回调函数，调用它
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit(newCharId, effectiveState);
            }

            deps.toastr.success(isNew ? '角色已成功创建！' : '角色档案已成功更新！', '保存成功');

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            // 如果是新建，关闭面板；如果是编辑，返回查看模式
            if (isNew) {
                $('#sbt-character-detail-panel').hide();
            } else {
                showCharacterDetailModal(newCharId, effectiveState, false, false);
            }

        } catch (error) {
            deps.diagnose('[UIManager] 保存角色修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建角色' : '保存修改'}`);
        }
    });

    // -- 角色详情: 添加标签 --
    $wrapper.on('click', '.sbt-tag-add-btn', function() {
        const $btn = $(this);
        const path = $btn.data('path');
        const $tagList = $btn.closest('.sbt-tag-list');

        // 创建新标签输入（空白内容）
        const newTagHtml = `
            <span class="sbt-tag sbt-tag-editable" data-path="${path}" contenteditable="true" placeholder="输入标签..."></span>
            <i class="fa-solid fa-xmark sbt-tag-delete"></i>
        `;
        $btn.before(newTagHtml);

        // 聚焦到新标签
        const $newTag = $tagList.find('.sbt-tag-editable').last();
        $newTag.focus();
    });

    // -- 角色详情: 删除标签 --
    $wrapper.on('click', '.sbt-tag-delete', function() {
        const $deleteBtn = $(this);
        $deleteBtn.prev('.sbt-tag-editable').remove();
        $deleteBtn.remove();
    });

    // -- 世界观: 点击词条卡片内容区域显示详情 --
    $wrapper.on('click', '.sbt-worldview-card-content', function() {
        const $card = $(this).closest('.sbt-worldview-card');
        const itemId = $card.data('item-id');
        const category = $card.data('category');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 获取类别中文名
        const categoryNames = {
            'locations': '地点',
            'items': '物品',
            'factions': '势力',
            'concepts': '概念',
            'events': '历史事件',
            'races': '种族'
        };
        const categoryName = categoryNames[category] || '词条';

        showWorldviewDetailModal(itemId, category, categoryName, effectiveState, false, false);
    });

    // -- 世界观: 隐藏/显示切换按钮 --
    $wrapper.on('click', '.sbt-worldview-toggle-visibility-btn', function(e) {
        e.stopPropagation();
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 获取当前档案数据
        const item = effectiveState.staticMatrices.worldview[category][itemId];
        if (!item) return;

        // 切换隐藏状态
        item.isHidden = !item.isHidden;

        // 保存状态（即使失败也继续更新UI）
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('worldview_visibility_toggled', effectiveState)
                .catch(err => {
                    deps.warn('[世界观隐藏] 状态保存失败，但UI已更新:', err);
                });
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        // 显示提示
        const action = item.isHidden ? '隐藏' : '显示';
        deps.toastr.success(`已${action}档案：${item.name || itemId}`, '档案可见性已更新');
    });

    // -- 世界观: 点击卡片上的编辑按钮直接进入编辑模式 --
    $wrapper.on('click', '.sbt-worldview-edit-btn', function(e) {
        e.stopPropagation(); // 防止触发卡片点击事件
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 直接打开编辑模式
        showWorldviewDetailModal(itemId, category, categoryName, effectiveState, true, false);
    });

    // -- 世界观: 新建词条 --
    $wrapper.on('click', '.sbt-add-worldview-btn', function() {
        const $btn = $(this);
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 生成临时ID
        const tempId = `new_${Date.now()}`;

        // 打开详情面板（新建模式）
        showWorldviewDetailModal(tempId, category, categoryName, effectiveState, true, true);
    });

    // -- 世界观: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-worldview-detail', function() {
        $('#sbt-worldview-detail-panel').hide();
    });

    // -- 故事线详情: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-storyline-detail', function() {
        $('#sbt-storyline-detail-panel').hide();
    });

    // -- 关系图谱: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-relationship-detail', function() {
        $('#sbt-relationship-detail-panel').hide();
    });

    // -- 关系图谱: 新建关系 --
    $wrapper.on('click', '.sbt-add-relationship-btn', function() {
        const effectiveState = getEffectiveChapterState();
        if (!effectiveState) return;

        // 生成临时ID
        const tempId = `edge_new_${Date.now()}`;

        // 打开详情面板（新建模式）
        showRelationshipDetailModal(tempId, effectiveState, true, true);
    });

    // -- 关系图谱: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-relationship-mode-toggle', function() {
        const edgeId = $(this).data('edge-id');
        const effectiveState = getEffectiveChapterState();
        if (!effectiveState) return;

        showRelationshipDetailModal(edgeId, effectiveState, true);
    });

    // -- 关系图谱: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-relationship-edit-btn', function() {
        const edgeId = $(this).data('edge-id');
        const effectiveState = getEffectiveChapterState();

        // 检查是否是新建模式（edgeId以edge_new_开头）
        if (edgeId.startsWith('edge_new_')) {
            // 新建模式取消直接关闭面板
            $('#sbt-relationship-detail-panel').hide();
        } else {
            if (edgeId && effectiveState) {
                // 重新渲染为查看模式
                showRelationshipDetailModal(edgeId, effectiveState, false, false);
            }
        }
    });

    // -- 关系图谱: 保存修改 --
    $wrapper.on('click', '.sbt-save-relationship-btn', async function() {
        const $btn = $(this);
        const oldEdgeId = $btn.data('edge-id');
        const isNew = $btn.data('is-new') === 'true' || $btn.data('is-new') === true;
        const effectiveState = getEffectiveChapterState();

        if (!oldEdgeId || !effectiveState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            const $panel = $('#sbt-relationship-detail-content');

            // 初始化relationship_graph（如果不存在）
            if (!effectiveState.staticMatrices.relationship_graph) {
                effectiveState.staticMatrices.relationship_graph = { edges: [] };
            }
            const relationshipGraph = effectiveState.staticMatrices.relationship_graph;

            // 如果是新建，需要验证必填字段并生成新ID
            let newEdgeId = oldEdgeId;
            let edge = relationshipGraph.edges.find(e => e.id === oldEdgeId);

            if (isNew) {
                // 获取选择的角色
                const participant1 = $panel.find('.sbt-rel-participant-select[data-participant-index="0"]').val();
                const participant2 = $panel.find('.sbt-rel-participant-select[data-participant-index="1"]').val();

                if (!participant1 || !participant2) {
                    deps.toastr.error('请选择两个角色建立关系', '保存失败');
                    $btn.prop('disabled', false).html('<i class="fa-solid fa-save fa-fw"></i> 创建关系');
                    return;
                }

                if (participant1 === participant2) {
                    deps.toastr.error('不能选择同一个角色', '保存失败');
                    $btn.prop('disabled', false).html('<i class="fa-solid fa-save fa-fw"></i> 创建关系');
                    return;
                }

                // 检查是否已存在相同的关系
                const existingEdge = relationshipGraph.edges.find(e =>
                    (e.participants[0] === participant1 && e.participants[1] === participant2) ||
                    (e.participants[0] === participant2 && e.participants[1] === participant1)
                );

                if (existingEdge) {
                    deps.toastr.error('这两个角色之间已存在关系', '保存失败');
                    $btn.prop('disabled', false).html('<i class="fa-solid fa-save fa-fw"></i> 创建关系');
                    return;
                }

                // 生成新的关系ID
                const timestamp = Date.now().toString(36);
                newEdgeId = `edge_${participant1}_${participant2}_${timestamp}`;

                logger.debug(`新建关系，生成ID: ${newEdgeId}`);

                // 创建新关系对象
                edge = {
                    id: newEdgeId,
                    isUserCreated: true, // 标记为用户手动创建
                    participants: [participant1, participant2],
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

                // 添加到关系图谱
                relationshipGraph.edges.push(edge);
            }

            if (!edge) {
                deps.toastr.error('找不到该关系边', '错误');
                $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建关系' : '保存'}`);
                return;
            }

            logger.debug('[关系编辑保存] 数据收集分析');
            logger.debug('是否新建:', isNew);
            logger.debug('修改前的关系数据:', JSON.parse(JSON.stringify(edge)));

            // 如果不是新建，更新参与者（编辑模式下可能修改了参与者）
            if (!isNew) {
                const participant1 = $panel.find('.sbt-rel-participant-select[data-participant-index="0"]').val();
                const participant2 = $panel.find('.sbt-rel-participant-select[data-participant-index="1"]').val();
                if (participant1 && participant2 && participant1 !== participant2) {
                    edge.participants = [participant1, participant2];
                }
            }

            // 更新关系标签
            const relationshipLabel = $panel.find('.sbt-rel-label-input').val();
            if (relationshipLabel !== undefined) {
                edge.relationship_label = relationshipLabel.trim();
            }

            // 更新情感权重
            const newWeight = parseInt($panel.find('.sbt-rel-weight-input').val(), 10);
            if (!isNaN(newWeight) && newWeight >= 0 && newWeight <= 10) {
                edge.emotional_weight = newWeight;
            }

            // 更新未解张力
            const newTensions = [];
            $panel.find('.sbt-rel-tension-editable').each(function() {
                const text = $(this).text().trim();
                if (text && text !== '新张力') newTensions.push(text);
            });

            if (!edge.narrative_status) edge.narrative_status = {};
            edge.narrative_status.unresolved_tension = newTensions;

            logger.debug('修改后的关系数据:', JSON.parse(JSON.stringify(edge)));
            logger.debug();

            // 保存
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('relationship_updated', effectiveState);
            }

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            deps.toastr.success(isNew ? '关系已成功创建！' : '关系已更新', '保存成功');

            // 如果是新建，关闭面板；如果是编辑，返回查看模式
            if (isNew) {
                $('#sbt-relationship-detail-panel').hide();
            } else {
                showRelationshipDetailModal(newEdgeId, effectiveState, false, false);
            }

        } catch (error) {
            deps.diagnose('[UIManager] 保存关系修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建关系' : '保存'}`);
        }
    });

    // -- 关系图谱: 删除关系 --
    $wrapper.on('click', '.sbt-delete-relationship-btn', function() {
        const $btn = $(this);
        const edgeId = $btn.data('edge-id');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        const relationshipGraph = effectiveState.staticMatrices.relationship_graph;
        const edge = relationshipGraph?.edges?.find(e => e.id === edgeId);

        if (!edge) {
            deps.toastr.error('找不到该关系', '错误');
            return;
        }

        // 获取角色名称用于确认提示
        const characters = effectiveState.staticMatrices.characters || {};
        const getCharName = (charId) => {
            const char = characters[charId];
            return char?.core?.name || char?.name || charId;
        };

        const participant1 = getCharName(edge.participants[0]);
        const participant2 = getCharName(edge.participants[1]);
        const relationshipLabel = edge.relationship_label || '未命名关系';

        // 确认删除
        if (!confirm(`确定要删除「${participant1} ❤ ${participant2}」的关系「${relationshipLabel}」吗？此操作无法撤销。`)) {
            return;
        }

        // 删除关系
        const edgeIndex = relationshipGraph.edges.findIndex(e => e.id === edgeId);
        if (edgeIndex !== -1) {
            relationshipGraph.edges.splice(edgeIndex, 1);
        }

        // 关闭详情面板
        $('#sbt-relationship-detail-panel').hide();

        // 保存并刷新
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('relationship_deleted', effectiveState);
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        deps.toastr.success(`关系「${relationshipLabel}」已删除`, '删除成功');
    });

    // -- 关系图谱: 添加张力标签 --
    $wrapper.on('click', '.sbt-add-tension-btn', function() {
        const $tensionTags = $(this).closest('.sbt-rel-tension-tags');

        const newTagHtml = `
            <span class="sbt-rel-tension-tag sbt-rel-tension-editable" contenteditable="true" data-tension-index="new">新张力</span>
            <i class="fa-solid fa-xmark sbt-tension-delete" data-tension-index="new"></i>
        `;
        $(this).before(newTagHtml);

        // 聚焦到新标签
        $tensionTags.find('.sbt-rel-tension-editable[data-tension-index="new"]').focus().select();
    });

    // -- 关系图谱: 删除张力标签 --
    $wrapper.on('click', '.sbt-tension-delete', function() {
        const $deleteBtn = $(this);
        $deleteBtn.prev('.sbt-rel-tension-editable').remove();
        $deleteBtn.remove();
    });

    // -- 世界观详情: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-worldview-mode-toggle', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (effectiveState) {
            showWorldviewDetailModal(itemId, category, categoryName, effectiveState, true, false);
        }
    });

    // -- 世界观详情: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-worldview-edit-btn', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');

        const $content = $('#sbt-worldview-detail-content');
        const category = $content.attr('data-category');
        const categoryName = $content.attr('data-category-name');

        // 检查是否是新建模式（itemId以new_开头）
        if (itemId.startsWith('new_')) {
            // 新建模式取消直接关闭面板
            $('#sbt-worldview-detail-panel').hide();
        } else {
            // 编辑模式返回查看模式
            const effectiveState = getEffectiveChapterState();
            if (effectiveState) {
                showWorldviewDetailModal(itemId, category, categoryName, effectiveState, false, false);
            }
        }
    });

    // -- 世界观详情: 删除词条 --
    $wrapper.on('click', '.sbt-delete-worldview-item-btn', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        const item = effectiveState.staticMatrices.worldview[category]?.[itemId];
        if (!item) {
            deps.toastr.error('找不到该词条', '错误');
            return;
        }

        // 确认删除
        if (!confirm(`确定要删除"${item.name || itemId}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除词条
        delete effectiveState.staticMatrices.worldview[category][itemId];

        // 关闭详情面板
        $('#sbt-worldview-detail-panel').hide();

        // 保存并刷新
        saveWorldviewChanges();
        deps.toastr.success('词条已删除', '删除成功');
    });

    // -- 世界观详情: 保存修改 --
    $wrapper.on('click', '.sbt-save-worldview-item-btn', async function() {
        const $btn = $(this);
        const oldItemId = $btn.data('item-id');
        const category = $btn.data('category');
        const isNew = $btn.data('is-new') === 'true' || $btn.data('is-new') === true;
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            // 收集数据
            const $panel = $('#sbt-worldview-detail-content');
            const name = $panel.find('.sbt-worldview-name-input[data-path="name"]').val().trim();
            const description = $panel.find('.sbt-worldview-textarea[data-path="description"]').val().trim();

            if (!name) {
                deps.toastr.error('名称不能为空', '保存失败');
                $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 保存${isNew ? '并创建' : '修改'}`);
                return;
            }

            // 生成新的ID（基于名称）
            const newItemId = name.replace(/\s+/g, '_');

            // 确保category存在
            if (!effectiveState.staticMatrices.worldview[category]) {
                effectiveState.staticMatrices.worldview[category] = {};
            }

            // 如果是编辑且ID改变了，删除旧词条
            if (!isNew && oldItemId !== newItemId) {
                delete effectiveState.staticMatrices.worldview[category][oldItemId];
            }

            // 创建或更新词条
            const worldviewItemData = {
                name: name,
                description: description || '暂无描述'
            };

            // 如果是新建，添加用户创建标记
            if (isNew) {
                worldviewItemData.isUserCreated = true;
            }

            effectiveState.staticMatrices.worldview[category][newItemId] = worldviewItemData;

            // 保存并刷新
            await saveWorldviewChanges();

            deps.toastr.success(isNew ? '词条已创建！' : '词条已更新！', '保存成功');

            // 关闭详情面板
            $('#sbt-worldview-detail-panel').hide();

        } catch (error) {
            deps.diagnose('[UIManager] 保存世界观词条时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 保存${isNew ? '并创建' : '修改'}`);
        }
    });

    // 保存世界观修改的辅助函数
    async function saveWorldviewChanges() {
        try {
            const effectiveState = getEffectiveChapterState();
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('worldview', effectiveState);
            }

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            // 重新渲染世界档案面板
            updateDashboard(effectiveState);
        } catch (error) {
            deps.diagnose('[UIManager] 保存世界观修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
        }
    }

    // -- 监控面板: 日志清空 --
    $wrapper.on('click', '#sbt-clear-log-btn', () => {
        $('#sbt-debug-log-output').empty();
        deps.info('日志已清空。');
    });

    // -- 叙事罗盘: 创世纪按钮 --
    $wrapper.on('click', '#sbt-start-genesis-btn', function() {
        const $btn = $(this);
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 正在构思世界...');
        deps.onStartGenesis().finally(() => {
            $btn.prop('disabled', false).html('<i class="fa-solid fa-book-sparkles fa-fw"></i> 开始新的叙事篇章');
        });
    });

    // -- 叙事罗盘: 高级控制按钮 --
    $wrapper.on('click', '#sbt-reanalyze-worldbook-btn', () => deps.onReanalyzeWorldbook());
    $wrapper.on('click', '#sbt-force-transition-btn', () => deps.onForceChapterTransition());

    // -- 创作工坊: 剧本重roll按钮 --
    $wrapper.on('click', '#sbt-reroll-blueprint-btn', function() {
        const $btn = $(this);
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 重roll中...');
        deps.onRerollChapterBlueprint().finally(() => {
            $btn.prop('disabled', false).html('<i class="fa-solid fa-dice fa-fw"></i> 重roll');
        });
    });
    
    // -- 叙事罗盘: 功能开关 --
      const $masterToggle = $('#sbt-master-enable-toggle');
        // 默认设置为开启 (true)。只有当localStorage明确存为'false'时才关闭。
        if (localStorage.getItem('sbt-engine-enabled') === null) {
            localStorage.setItem('sbt-engine-enabled', 'true');
        }
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        $masterToggle.prop('checked', isEngineEnabled);

        // 【双重防护】初始化时同步按钮的禁用状态
        $('#sbt-start-genesis-btn').prop('disabled', !isEngineEnabled);
        $('#sbt-force-transition-btn').prop('disabled', !isEngineEnabled);
        $('#sbt-reanalyze-worldbook-btn').prop('disabled', !isEngineEnabled);

        $wrapper.on('change', '#sbt-master-enable-toggle', function() {
            const isChecked = $(this).is(':checked');
            localStorage.setItem('sbt-engine-enabled', isChecked);

            // 【双重防护】禁用/启用所有主要功能按钮
            $('#sbt-start-genesis-btn').prop('disabled', !isChecked);
            $('#sbt-force-transition-btn').prop('disabled', !isChecked);
            $('#sbt-reanalyze-worldbook-btn').prop('disabled', !isChecked);

            deps.toastr.info(`叙事流引擎已 ${isChecked ? '开启' : '关闭'}`, "引擎状态切换");
        });
    // -- 强制开关：焦点弹窗/回合裁判开启，回合裁判分析关闭 --
    localStorage.setItem('sbt-focus-popup-enabled', 'true');
    localStorage.setItem('sbt-conductor-enabled', 'true');
    localStorage.setItem('sbt-conductor-stream-enabled', 'false');
    if (localStorage.getItem('sbt-conductor-summary-enabled') === null) {
        localStorage.setItem('sbt-conductor-summary-enabled', 'false');
    }
    if (localStorage.getItem('sbt-design-notes-enabled') === null) {
        localStorage.setItem('sbt-design-notes-enabled', 'false');
    }

    // -- V3.1: 流式显示回合裁判 --
    const updateMonitorLayout = () => {
        const $grid = $('.sbt-panel-grid-monitor');
        const hasVisibleStream = $('#sbt-conductor-stream-panel').is(':visible');
        $grid.toggleClass('sbt-monitor-has-stream', hasVisibleStream);
        $grid.toggleClass('sbt-monitor-has-side', hasVisibleStream);
    };

    const isConductorStreamEnabled = () => localStorage.getItem('sbt-conductor-stream-enabled') === 'true';
    const isConductorSummaryEnabled = () => localStorage.getItem('sbt-conductor-summary-enabled') === 'true';
    const isDesignNotesEnabled = () => localStorage.getItem('sbt-design-notes-enabled') !== 'false';
    $('#sbt-conductor-stream-panel').hide();

    const refreshConductorSummaryPanel = () => {
        const $category = $('#sbt-conductor-summary-category');
        if (isConductorSummaryEnabled()) {
            $category.show();
            if (lastConductorSummary) {
                applyConductorSummary(lastConductorSummary);
            }
        } else {
            $category.hide();
        }
        updateMonitorLayout();
    };

    const $summaryToggle = $('#sbt-conductor-summary-toggle');
    $summaryToggle.prop('checked', isConductorSummaryEnabled());
    refreshConductorSummaryPanel();
    updateMonitorLayout();

    $wrapper.on('change', '#sbt-conductor-summary-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-conductor-summary-enabled', isChecked);
        refreshConductorSummaryPanel();
        deps.toastr.info(
            `回合执导摘要已${isChecked ? '开启' : '关闭'}`,
            '设置已更新'
        );
    });

    const refreshDesignNotesPanel = () => {
        const $category = $('#sbt-design-notes-category');
        if (isDesignNotesEnabled()) {
            $category.show();
        } else {
            $category.hide();
            $('#sbt-design-notes-content').empty();
        }
    };

    const $designNotesToggle = $('#sbt-design-notes-toggle');
    $designNotesToggle.prop('checked', isDesignNotesEnabled());
    refreshDesignNotesPanel();

    $wrapper.on('change', '#sbt-design-notes-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-design-notes-enabled', isChecked);
        refreshDesignNotesPanel();
        deps.toastr.info(
            `建筑师设计笔记已${isChecked ? '开启' : '关闭'}`,
            '设置已更新'
        );
    });

    // -- 数据库适配模式开关 --
    const $dbAdapterToggle = $('#sbt-db-adapter-toggle');
    const $dbAdapterStatus = $('#sbt-db-adapter-status');

    if (localStorage.getItem('sbt-db-adapter-enabled') === null) {
        localStorage.setItem('sbt-db-adapter-enabled', 'false');
    }

    const isDbAdapterEnabled = () => localStorage.getItem('sbt-db-adapter-enabled') === 'true';

    const isDbApiAvailable = () => {
        const root = (typeof window !== 'undefined' && window.parent) ? window.parent : window;
        return !!(root?.AutoCardUpdaterAPI && typeof root.AutoCardUpdaterAPI.exportTableAsJson === 'function');
    };

    const updateDbAdapterStatus = (enabled, reason = '') => {
        if (!$dbAdapterStatus.length) return;
        const baseText = enabled ? '数据库适配模式：已启用（测试中）' : '数据库适配模式：未启用（测试中）';
        $dbAdapterStatus.text(reason ? `${baseText}（${reason}）` : baseText);
    };

    $dbAdapterToggle.prop('checked', isDbAdapterEnabled());
    updateDbAdapterStatus(isDbAdapterEnabled());

    $wrapper.on('change', '#sbt-db-adapter-toggle', function() {
        const isChecked = $(this).is(':checked');
        if (isChecked && !isDbApiAvailable()) {
            localStorage.setItem('sbt-db-adapter-enabled', 'false');
            $(this).prop('checked', false);
            updateDbAdapterStatus(false, '未检测到数据库插件');
            deps.toastr.error('未检测到数据库插件（AutoCardUpdaterAPI不可用），已取消启用。', '数据库适配');
            return;
        }
        localStorage.setItem('sbt-db-adapter-enabled', isChecked);
        updateDbAdapterStatus(isChecked);
        deps.toastr.info(
            `数据库适配模式已${isChecked ? '开启' : '关闭'}`,
            '设置已更新'
        );
    });

    // -- 实体召回开关（测试功能） --
    const $entityRecallToggle = $('#sbt-enable-entity-recall-toggle');
    const isEntityRecallEnabled = localStorage.getItem('sbt-entity-recall-enabled') === 'true'; // 默认关闭
    $entityRecallToggle.prop('checked', isEntityRecallEnabled);

    $wrapper.on('change', '#sbt-enable-entity-recall-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-entity-recall-enabled', isChecked);
        deps.toastr.info(
            `实体召回功能已 ${isChecked ? '开启（测试模式）' : '关闭（默认模式）'}`,
            isChecked ? "AI需要识别实体ID" : "所有实体完整注入"
        );
        deps.info(`[UIManager] 实体召回功能: ${isChecked ? '启用' : '禁用'}`);
    });

    // -- 调试模式开关 --
    const $debugModeToggle = $('#sbt-debug-mode-toggle');
    // 默认关闭调试模式，只有明确设为'true'时才开启
    const isDebugModeEnabled = localStorage.getItem('sbt-debug-mode') === 'true';
    $debugModeToggle.prop('checked', isDebugModeEnabled);

    $wrapper.on('change', '#sbt-debug-mode-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-debug-mode', isChecked);
        deps.toastr.info(
            `调试模式已 ${isChecked ? '开启' : '关闭'}`,
            isChecked ? "控制台将输出详细日志" : "控制台将保持简洁"
        );
        if (isChecked) {
            logger.info('[SBT-INFO] 调试模式已开启，详细日志将在控制台显示。');
        } else {
            logger.info('[SBT-INFO] 调试模式已关闭，仅显示错误诊断信息。');
        }
    });

    // -- V4.2: 章节节拍数量区间控制 --
    const $beatCountRange = $('#sbt-beat-count-range');
    const $beatCountCustomWrap = $('#sbt-beat-count-custom-wrap');
    const $beatCountCustomMin = $('#sbt-beat-count-custom-min');
    const $beatCountCustomMax = $('#sbt-beat-count-custom-max');
    const savedBeatCountRange = localStorage.getItem('sbt-beat-count-range') || '7-9';

    const parseRangeText = (rawValue) => {
        if (typeof rawValue !== 'string') return null;
        const raw = rawValue.trim();
        if (!raw) return null;
        const rangeMatch = raw.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const min = parseInt(rangeMatch[1], 10);
            const max = parseInt(rangeMatch[2], 10);
            if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
                return { min, max, range: `${min}-${max}` };
            }
            return null;
        }
        const singleMatch = raw.match(/^(\d+)$/);
        if (singleMatch) {
            const n = parseInt(singleMatch[1], 10);
            if (Number.isFinite(n) && n > 0) {
                return { min: n, max: n, range: `${n}-${n}` };
            }
        }
        return null;
    };

    const parseCustomBeatRange = (value) => {
        if (typeof value !== 'string') return null;
        if (!value.startsWith('custom:')) return null;
        const raw = value.slice('custom:'.length).trim();
        return parseRangeText(raw);
    };

    const isOptionValueAvailable = (value) => {
        return $beatCountRange.find(`option[value="${value}"]`).length > 0;
    };

    const setCustomInputs = (min, max) => {
        if (Number.isFinite(min)) $beatCountCustomMin.val(min);
        if (Number.isFinite(max)) $beatCountCustomMax.val(max);
    };

    const getCustomRangeFromInputs = () => {
        const min = parseInt($beatCountCustomMin.val(), 10);
        const max = parseInt($beatCountCustomMax.val(), 10);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (min <= 0 || max < min) return null;
        return { min, max, range: `${min}-${max}` };
    };

    const applyBeatCountUI = (value) => {
        const customRange = parseCustomBeatRange(value);
        if (customRange) {
            $beatCountRange.val('custom');
            $beatCountCustomWrap.show();
            setCustomInputs(customRange.min, customRange.max);
            return;
        }
        if (isOptionValueAvailable(value)) {
            $beatCountRange.val(value);
            $beatCountCustomWrap.hide();
            return;
        }
        const fallbackCustom = parseRangeText(value);
        if (fallbackCustom) {
            $beatCountRange.val('custom');
            $beatCountCustomWrap.show();
            setCustomInputs(fallbackCustom.min, fallbackCustom.max);
            return;
        }
        $beatCountRange.val('7-9');
        $beatCountCustomWrap.hide();
    };

    applyBeatCountUI(savedBeatCountRange);

    $wrapper.on('change', '#sbt-beat-count-range', function() {
        const selectedRange = $(this).val();
        if (selectedRange === 'custom') {
            $beatCountCustomWrap.show();
            const storedCustom = parseCustomBeatRange(localStorage.getItem('sbt-beat-count-range'));
            const inputCustom = getCustomRangeFromInputs();
            const customRange = storedCustom || inputCustom || { min: 10, max: 12, range: '10-12' };
            setCustomInputs(customRange.min, customRange.max);
            localStorage.setItem('sbt-beat-count-range', `custom:${customRange.range}`);
            deps.toastr.info(`章节节拍数量已设置为：自定义 ${customRange.range}`, "设置已更新");
            return;
        }
        $beatCountCustomWrap.hide();
        localStorage.setItem('sbt-beat-count-range', selectedRange);
        deps.toastr.info(`章节节拍数量区间已设置为：${selectedRange}`, "设置已更新");
    });

    $wrapper.on('input', '#sbt-beat-count-custom-min, #sbt-beat-count-custom-max', function() {
        if ($beatCountRange.val() !== 'custom') return;
        const custom = getCustomRangeFromInputs();
        if (!custom) return;
        localStorage.setItem('sbt-beat-count-range', `custom:${custom.range}`);
        deps.toastr.info(`章节节拍数量已设置为：自定义 ${custom.range}`, "设置已更新");
    });

    // -- V3.1: 流式面板折叠/展开 --
    $wrapper.on('click', '#sbt-stream-toggle', function(e) {
        e.stopPropagation();
        const $panel = $('#sbt-conductor-stream-panel');
        $panel.toggleClass('collapsed');
        $(this).text($panel.hasClass('collapsed') ? '展开' : '折叠');
    });

    // -- V3.1: EventBus 监听流式事件 --
    if (deps.eventBus) {
        deps.eventBus.on('CONDUCTOR_SUMMARY_UPDATED', (summary) => {
            if (!summary || typeof summary !== 'object') return;
            lastConductorSummary = summary;
            if (isConductorSummaryEnabled()) {
                applyConductorSummary(summary);
            }
        });

        // 流式开始
        deps.eventBus.on('CONDUCTOR_STREAM_START', () => {
            if (!isConductorStreamEnabled()) return;
            const $panel = $('#sbt-conductor-stream-panel');
            const $content = $('#sbt-stream-content');
            const $status = $('#sbt-stream-status');

            $panel.show().removeClass('collapsed');
            $content.empty();
            $status.text('正在分析...').addClass('streaming');
            updateMonitorLayout();

            deps.info('[StreamUI] 回合裁判流式输出已开始');
        });

        // 流式块接收 - 直接追加原始内容
        deps.eventBus.on('CONDUCTOR_STREAM_CHUNK', ({ chunk }) => {
            if (!isConductorStreamEnabled()) return;
            const $content = $('#sbt-stream-content');
            const $status = $('#sbt-stream-status');

            // 直接追加 chunk，不做任何延迟处理
            $content.append(chunk);

            // 自动滚动到底部
            $content.scrollTop($content[0].scrollHeight);

            // 更新状态显示当前长度
            const currentLength = $content.text().length;
            $status.text(`正在分析... (已接收 ${currentLength} 字符)`);
        });

        // 流式结束
        deps.eventBus.on('CONDUCTOR_STREAM_END', () => {
            if (!isConductorStreamEnabled()) return;
            const $status = $('#sbt-stream-status');
            const finalLength = $('#sbt-stream-content').text().length;
            $status.text(`分析完成 (共 ${finalLength} 字符)`).removeClass('streaming');

            deps.info('[StreamUI] 回合裁判流式输出已结束');
        });
    }

    updateMonitorLayout();

    // -- V8.0: 故事线追踪 - 查看故事线详情 --
    $wrapper.on('click', '.sbt-storyline-card', function(e) {
        // 如果点击的是编辑、删除、显示/隐藏按钮，或者可编辑元素，不触发查看详情
        if ($(e.target).closest('.sbt-storyline-edit-btn, .sbt-storyline-delete-btn, .sbt-storyline-toggle-visibility-btn').length > 0) {
            return;
        }

        // 检查是否点击了可编辑元素（如历史记录的文本框）
        if ($(e.target).is('[contenteditable="true"]') || $(e.target).closest('[contenteditable="true"]').length > 0) {
            return;
        }

        const lineId = $(this).data('storyline-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, effectiveState, false, false);
    });

    // -- V8.0: 故事线追踪 - 新建故事线 --
    $wrapper.on('click', '.sbt-add-storyline-btn', function() {
        const effectiveState = getEffectiveChapterState();
        if (!effectiveState) {
            deps.toastr.warning('请先开始一个故事', '操作失败');
            return;
        }

        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');

        // 生成临时ID
        const tempId = `temp_${Date.now()}`;

        // 确保 storylines 结构存在
        if (!effectiveState.staticMatrices.storylines) {
            effectiveState.staticMatrices.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }
        if (!effectiveState.dynamicState.storylines) {
            effectiveState.dynamicState.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }

        // 显示新建模态框
        showStorylineDetailModal(tempId, category, categoryName, effectiveState, true, true);
    });

    // -- 故事线: 隐藏/显示切换按钮 --
    $wrapper.on('click', '.sbt-storyline-toggle-visibility-btn', function(e) {
        e.stopPropagation();
        const $btn = $(this);
        const lineId = $btn.data('storyline-id');
        const category = $btn.data('category');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        // 获取动态状态中的故事线数据
        const dynamicLine = effectiveState.dynamicState.storylines?.[category]?.[lineId];
        const staticLine = effectiveState.staticMatrices.storylines?.[category]?.[lineId];

        if (!dynamicLine && !staticLine) return;

        // 优先修改动态状态，回退到静态
        const line = dynamicLine || staticLine;

        // 切换隐藏状态
        line.isHidden = !line.isHidden;

        // 如果两边都存在，同步设置
        if (dynamicLine) dynamicLine.isHidden = line.isHidden;
        if (staticLine) staticLine.isHidden = line.isHidden;

        // 保存状态（即使失败也继续更新UI）
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('storyline_visibility_toggled', effectiveState)
                .catch(err => {
                    deps.warn('[故事线隐藏] 状态保存失败，但UI已更新:', err);
                });
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        // 显示提示
        const action = line.isHidden ? '隐藏' : '显示';
        deps.toastr.success(`已${action}故事线：${line.title || lineId}`, '故事线可见性已更新');
    });

    // -- V8.0: 故事线追踪 - 编辑故事线按钮 --
    $wrapper.on('click', '.sbt-storyline-edit-btn', function(e) {
        e.stopPropagation(); // 防止触发卡片点击

        const lineId = $(this).data('storyline-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, effectiveState, true, false);
    });

    // -- V8.0: 故事线追踪 - 模态框内的编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-storyline-mode-toggle', function() {
        const lineId = $(this).data('line-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, effectiveState, true, false);
    });

    // -- V8.0: 故事线追踪 - 保存故事线 --
    $wrapper.on('click', '.sbt-save-storyline-btn', async function() {
        const $btn = $(this);
        const lineId = $btn.data('line-id');
        const category = $btn.data('category');
        const isNew = $btn.data('is-new');
        const $panel = $('#sbt-storyline-detail-panel');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            // 确保结构存在
            if (!effectiveState.staticMatrices.storylines) {
                effectiveState.staticMatrices.storylines = {
                    main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
                };
            }
            if (!effectiveState.dynamicState.storylines) {
                effectiveState.dynamicState.storylines = {
                    main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
                };
            }
            if (!effectiveState.staticMatrices.storylines[category]) {
                effectiveState.staticMatrices.storylines[category] = {};
            }
            if (!effectiveState.dynamicState.storylines[category]) {
                effectiveState.dynamicState.storylines[category] = {};
            }

            // 收集表单数据
            const title = $panel.find('.sbt-storyline-name-input').val()?.trim();
            const summary = $panel.find('textarea[data-path="summary"]').val()?.trim();
            const currentSummary = $panel.find('textarea[data-path="current_summary"]').val()?.trim();
            const trigger = $panel.find('.sbt-storyline-trigger-input').val()?.trim();
            const currentStatus = $panel.find('.sbt-storyline-status-select').val();
            const playerSupplement = $panel.find('textarea[data-path="player_supplement"]').val()?.trim();

            // 验证必填字段
            if (!title) {
                deps.toastr.error('请输入故事线标题', '验证失败');
                $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建故事线' : '保存修改'}`);
                return;
            }

            // 收集涉及角色
            const involvedChars = [];
            $panel.find('.sbt-involved-chars .sbt-tag-editable').each(function() {
                const charId = $(this).data('char-id');
                if (charId) involvedChars.push(charId);
            });

            // 生成最终ID（如果是新建）
            let finalLineId = lineId;
            if (isNew) {
                const timestamp = Date.now().toString(36);
                const titlePart = title.replace(/\s+/g, '_').toLowerCase();
                finalLineId = `line_${titlePart}_${timestamp}`;
            }

            // 保存静态数据
            const safeSummary = summary || '';
            const storylineData = {
                title: title,
                summary: safeSummary,
                initial_summary: safeSummary,
                trigger: trigger || '玩家主动触发',
                type: category,
                involved_chars: involvedChars
            };

            // 如果是新建，添加用户创建标记
            if (isNew) {
                storylineData.isUserCreated = true;
            }

            effectiveState.staticMatrices.storylines[category][finalLineId] = storylineData;

            // 收集历史记录数组
            const history = [];
            $panel.find('.sbt-history-entry-editable').each(function() {
                const $entry = $(this);
                const timestampInput = $entry.find('.sbt-history-timestamp-input').val();
                const chapterInput = $entry.find('.sbt-history-chapter-input').val();
                const status = $entry.find('.sbt-history-status-select').val();
                const summary = $entry.find('.sbt-history-summary-input').val()?.trim();

                if (summary) { // 只保存有摘要的条目
                    history.push({
                        timestamp: timestampInput ? new Date(timestampInput).toISOString() : new Date().toISOString(),
                        chapter: chapterInput ? parseInt(chapterInput, 10) : undefined,
                        status: status || 'active',
                        summary: summary
                    });
                }
            });

            // 保存动态数据
            if (!effectiveState.dynamicState.storylines[category][finalLineId]) {
                effectiveState.dynamicState.storylines[category][finalLineId] = {
                    current_status: currentStatus || 'active',
                    current_summary: currentSummary || safeSummary || '故事线刚刚创建',
                    history: history,
                    player_supplement: playerSupplement || ''
                };
            } else {
                effectiveState.dynamicState.storylines[category][finalLineId].current_status = currentStatus || 'active';
                effectiveState.dynamicState.storylines[category][finalLineId].current_summary = currentSummary || safeSummary || '';
                effectiveState.dynamicState.storylines[category][finalLineId].history = history;
                effectiveState.dynamicState.storylines[category][finalLineId].player_supplement = playerSupplement || '';
            }

            // 保存（添加await确保保存完成）
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit(isNew ? 'storyline_added' : 'storyline_updated', effectiveState);
            }

            deps.toastr.success(`故事线"${title}"已${isNew ? '创建' : '保存'}！`, isNew ? '创建成功' : '保存成功');

            // 触发更新
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            // 隐藏面板
            $panel.hide();

        } catch (error) {
            deps.diagnose('[UIManager] 保存故事线修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建故事线' : '保存修改'}`);
        }
    });

    // -- V8.0: 故事线追踪 - 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-storyline-edit-btn', function() {
        const $panel = $('#sbt-storyline-detail-panel');
        $panel.hide();
    });

    // -- V8.0: 故事线追踪 - 删除故事线 --
    $wrapper.on('click', '.sbt-storyline-delete-btn', async function(e) {
        e.stopPropagation(); // 防止触发卡片点击

        const lineId = $(this).data('storyline-id') || $(this).data('line-id');
        const category = $(this).data('category');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState || !lineId || !category) return;

        const staticLine = effectiveState.staticMatrices.storylines?.[category]?.[lineId];
        if (!staticLine) {
            deps.toastr.error('找不到该故事线', '错误');
            return;
        }

        if (!confirm(`确定要删除故事线"${staticLine.title}"吗？此操作无法撤销。`)) {
            return;
        }

        try {
            // 删除静态部分
            delete effectiveState.staticMatrices.storylines[category][lineId];

            // 删除动态部分
            if (effectiveState.dynamicState.storylines?.[category]?.[lineId]) {
                delete effectiveState.dynamicState.storylines[category][lineId];
            }

            // 【修复】删除控制塔中的故事线进度数据，防止系统重新创建
            if (effectiveState.meta?.narrative_control_tower?.storyline_progress?.[lineId]) {
                delete effectiveState.meta.narrative_control_tower.storyline_progress[lineId];
                deps.info(`✓ 已清除故事线 ${lineId} 的控制塔进度数据`);
            }

            // 保存（添加await确保保存完成）
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('storyline_deleted', effectiveState);
            }

            // 触发更新
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
            }

            // 隐藏详情面板（如果正在显示）
            $('#sbt-storyline-detail-panel').hide();

            deps.toastr.success(`故事线"${staticLine.title}"已删除`, '删除成功');
        } catch (error) {
            deps.diagnose('[UIManager] 删除故事线时发生错误:', error);
            deps.toastr.error(`删除失败: ${error.message}`, '错误');
        }
    });

    // -- V8.0: 故事线追踪 - 添加涉及角色 --
    $wrapper.on('click', '.sbt-char-tag-add-btn', function() {
        const effectiveState = getEffectiveChapterState();
        if (!effectiveState) return;

        const allChars = effectiveState.staticMatrices.characters || {};
        const charOptions = Object.keys(allChars).map(charId => {
            const charData = allChars[charId];
            const charName = charData?.core?.name || charData?.name || charId;
            return `${charName} (${charId})`;
        });

        if (charOptions.length === 0) {
            deps.toastr.warning('当前没有可用的角色', '提示');
            return;
        }

        const selection = prompt(`选择要添加的角色（输入编号）:\n${charOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`);
        if (!selection) return;

        const index = parseInt(selection, 10) - 1;
        const charIds = Object.keys(allChars);
        if (index >= 0 && index < charIds.length) {
            const charId = charIds[index];
            const charData = allChars[charId];
            const charName = charData?.core?.name || charData?.name || charId;

            // 检查是否已存在
            const $container = $(this).closest('.sbt-involved-chars');
            const existing = $container.find(`.sbt-tag-editable[data-char-id="${charId}"]`);
            if (existing.length > 0) {
                deps.toastr.warning('该角色已在列表中', '提示');
                return;
            }

            // 添加标签
            const $newTag = $(`<span class="sbt-tag sbt-tag-editable" data-char-id="${charId}">${charName}<i class="fa-solid fa-xmark sbt-char-tag-delete" data-char-id="${charId}"></i></span>`);
            $(this).before($newTag);
        }
    });

    // -- V8.0: 故事线追踪 - 删除涉及角色 --
    $wrapper.on('click', '.sbt-char-tag-delete', function(e) {
        e.stopPropagation();
        $(this).closest('.sbt-tag-editable').remove();
    });

    // -- V10.1: 故事线追踪 - 新增历史条目 --
    $wrapper.on('click', '.sbt-add-history-entry-btn', function() {
        const $historyContainer = $(this).closest('.sbt-storyline-history');
        const $emptyText = $historyContainer.find('.sbt-empty-text');

        // 移除空提示文本
        if ($emptyText.length > 0) {
            $emptyText.remove();
        }

        // 计算新的索引
        const existingEntries = $historyContainer.find('.sbt-history-entry-editable');
        const newIndex = existingEntries.length;

        // 创建新的历史条目（空白模板）
        const now = new Date();
        const timestampISO = now.toISOString().substring(0, 16);

        const newEntryHtml = `
            <div class="sbt-history-entry sbt-history-entry-editable" data-index="${newIndex}">
                <div class="sbt-history-entry-header">
                    <input type="datetime-local" class="sbt-history-timestamp-input" data-index="${newIndex}" value="${timestampISO}" />
                    <input type="number" class="sbt-history-chapter-input" data-index="${newIndex}" placeholder="章节号" value="" min="0" />
                    <select class="sbt-history-status-select" data-index="${newIndex}">
                        <option value="active" selected>进行中</option>
                        <option value="completed">已完成</option>
                        <option value="paused">已暂停</option>
                        <option value="failed">已失败</option>
                    </select>
                    <button class="sbt-delete-history-entry-btn" data-index="${newIndex}" title="删除此条目"><i class="fa-solid fa-trash"></i></button>
                </div>
                <textarea class="sbt-history-summary-input" data-index="${newIndex}" placeholder="请输入进展摘要..."></textarea>
            </div>
        `;

        // 插入到按钮所在的标题后面
        $(this).closest('.sbt-storyline-history-title').after(newEntryHtml);

        deps.toastr.success('已添加新的历史条目', '提示');
    });

    // -- V10.1: 故事线追踪 - 删除历史条目 --
    $wrapper.on('click', '.sbt-delete-history-entry-btn', function(e) {
        e.stopPropagation();

        if (!confirm('确定要删除这条历史记录吗？')) {
            return;
        }

        const $entry = $(this).closest('.sbt-history-entry-editable');
        const $historyContainer = $entry.closest('.sbt-storyline-history');

        $entry.remove();

        // 重新索引剩余的条目
        $historyContainer.find('.sbt-history-entry-editable').each(function(idx) {
            $(this).attr('data-index', idx);
            $(this).find('.sbt-history-timestamp-input').attr('data-index', idx);
            $(this).find('.sbt-history-chapter-input').attr('data-index', idx);
            $(this).find('.sbt-history-status-select').attr('data-index', idx);
            $(this).find('.sbt-history-summary-input').attr('data-index', idx);
            $(this).find('.sbt-delete-history-entry-btn').attr('data-index', idx);
        });

        // 如果没有条目了，显示空提示
        if ($historyContainer.find('.sbt-history-entry-editable').length === 0) {
            $historyContainer.find('.sbt-storyline-history-title').after('<div class="sbt-empty-text">暂无历史记录，点击上方按钮新增</div>');
        }

        deps.toastr.success('已删除历史条目', '提示');
    });

    // -- V8.0: 故事线追踪 - 编辑历史记录 --
    $wrapper.on('blur', '.sbt-history-content', function() {
        const $this = $(this);
        const newContent = $this.text().trim();
        const historyIndex = parseInt($this.data('history-index'), 10);
        const effectiveState = getEffectiveChapterState();

        if (isNaN(historyIndex) || !effectiveState) return;

        // 找到对应的故事线
        const $card = $this.closest('.sbt-storyline-card');
        const lineId = $card.data('storyline-id');
        const category = $card.data('category');

        if (!lineId || !category) return;

        // 获取动态状态中的历史记录
        const dynamicLine = effectiveState.dynamicState.storylines?.[category]?.[lineId];
        if (!dynamicLine || !dynamicLine.history || !dynamicLine.history[historyIndex]) {
            deps.toastr.warning('无法找到对应的历史记录', '保存失败');
            return;
        }

        // 更新历史记录
        const historyEntry = dynamicLine.history[historyIndex];
        historyEntry.summary_update = newContent;

        // 保存到后端
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('storyline_history_updated', effectiveState);
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
        }

        deps.toastr.success('历史记录已更新', '保存成功');
    });

    // -- V5.2: 故事梗概编辑功能 --
    $wrapper.on('click', '.sbt-edit-summary-btn', function() {
        const field = $(this).data('field');
        const effectiveState = getEffectiveChapterState();

        if (!effectiveState) {
            deps.toastr.warning('当前没有活跃章节', '操作失败');
            return;
        }

        if (field === 'longTermStorySummary') {
            // 编辑故事梗概
            const currentValue = effectiveState.meta?.longTermStorySummary || '';

            const newValue = prompt('编辑故事梗概:\n(按章条状追加，每行一条，单条不超过40字)', currentValue);

            if (newValue !== null && newValue.trim() !== currentValue) {
                effectiveState.meta.longTermStorySummary = newValue.trim();

                // 保存
                if (typeof deps.onSaveCharacterEdit === 'function') {
                    deps.onSaveCharacterEdit('summary_updated', effectiveState);
                }

                // 触发更新
                if (deps.eventBus) {
                    deps.eventBus.emit('CHAPTER_UPDATED', effectiveState);
                }

                deps.toastr.success('故事梗概已更新', '保存成功');
            }
        }
    });

    // -- 设置面板: 绑定所有设置相关处理器 --
    bindPasswordToggleHandlers($wrapper);
    bindSettingsSaveHandler($wrapper, deps);
    bindAPITestHandlers($wrapper, deps);
    bindPresetSelectorHandlers($wrapper, deps);
    bindModelRefreshHandlers($wrapper, deps); // 模型列表刷新处理器
    bindDossierSchemaHandlers($wrapper, deps, () => getEffectiveChapterState());
    // V13.0: 已移除叙事模式切换处理器 - 多巴胺工程已整合到主prompt中
    // bindNarrativeModeSwitchHandler($wrapper, deps, () => getEffectiveChapterState());
    // 提示词管理处理器
    bindPromptManagerHandlers($wrapper, deps);

    // -- 数据库管理: 绑定数据库管理相关处理器 --
    bindDatabaseManagementHandlers($wrapper, deps, loadAndDisplayCachedStaticData, getEffectiveChapterState);

    deps.info("[UIManager] 所有UI事件已成功绑定。");

    }, 0); 
    
    // -- 引擎状态变更监听 --
    $(document).on('sbt-engine-status-changed', (event, newStatus) => {
        const $icon = $('#sbt-engine-status-icon');
        const $text = $('#sbt-engine-status-text');
        if (newStatus && newStatus.text && newStatus.icon) {
            $icon.removeClass((index, className) => (className.match(/(^|\s)fa-\S+/g) || []).join(' '));
            $icon.addClass(`fa-solid ${newStatus.icon}`);
            $text.text(newStatus.text);
        }
    });
}
/**
 * 绑定数据库管理相关的事件处理器
 */
function bindDatabaseManagementHandlers($wrapper, deps, onStaticDbChanged, getEffectiveChapterStateFn = null) {
    // 刷新数据库列表
    function refreshDatabaseList() {
        const $list = $wrapper.find('#sbt-static-db-list');
        const db = staticDataManager.getFullDatabase();
        const characterIds = Object.keys(db);

        if (characterIds.length === 0) {
            $list.html('<p class="sbt-instructions">数据库为空，尚未缓存任何角色数据。</p>');
            return;
        }

        let html = '';
        characterIds.forEach(charId => {
            const data = db[charId];

            // 统计各分类的实体
            const charCount = data?.characters ? Object.keys(data.characters).length : 0;
            const worldviewData = data?.worldview || {};
            const locationCount = worldviewData.locations ? Object.keys(worldviewData.locations).length : 0;
            const itemCount = worldviewData.items ? Object.keys(worldviewData.items).length : 0;
            const factionCount = worldviewData.factions ? Object.keys(worldviewData.factions).length : 0;
            const conceptCount = worldviewData.concepts ? Object.keys(worldviewData.concepts).length : 0;
            const eventCount = worldviewData.events ? Object.keys(worldviewData.events).length : 0;
            const raceCount = worldviewData.races ? Object.keys(worldviewData.races).length : 0;

            const totalCount = charCount + locationCount + itemCount + factionCount + conceptCount + eventCount + raceCount;

            html += `
                <div class="sbt-db-item" data-char-id="${charId}">
                    <div class="sbt-db-item-header">
                        <div class="sbt-db-item-info">
                            <i class="fa-solid fa-chevron-right sbt-db-expand-icon"></i>
                            <span class="sbt-db-item-name">${charId}</span>
                            <span class="sbt-db-item-stats">共 ${totalCount} 个实体</span>
                        </div>
                        <button class="sbt-db-item-export sbt-icon-btn" title="导出该角色数据">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="sbt-db-item-delete sbt-icon-btn" title="\u5220\u9664\u6b64\u89d2\u8272\u52a8\u9759\u6001\u6570\u636e">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="sbt-db-item-details" style="display: none;">
                        ${charCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-user"></i> 角色 (${charCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(data.characters).map(id => {
                                    const char = data.characters[id];
                                    const name = char?.core?.name || char?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${locationCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-map-marker-alt"></i> 地点 (${locationCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.locations).map(id => {
                                    const name = worldviewData.locations[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${itemCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-box"></i> 物品 (${itemCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.items).map(id => {
                                    const name = worldviewData.items[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${factionCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-flag"></i> 势力 (${factionCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.factions).map(id => {
                                    const name = worldviewData.factions[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${conceptCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-lightbulb"></i> 概念 (${conceptCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.concepts).map(id => {
                                    const name = worldviewData.concepts[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${eventCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-calendar"></i> 历史事件 (${eventCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.events).map(id => {
                                    const name = worldviewData.events[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${raceCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-dragon"></i> 种族 (${raceCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.races).map(id => {
                                    const name = worldviewData.races[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${totalCount === 0 ? '<p class="sbt-instructions">此角色暂无缓存数据</p>' : ''}
                        <div class="sbt-db-category sbt-db-dynamic-category" data-char-id="${charId}">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-anchor"></i> \u52a8\u6001\u951a\u70b9
                            </div>
                            <div class="sbt-db-dynamic-body">
                                <p class="sbt-instructions">\u5c55\u5f00\u540e\u52a0\u8f7d\u52a8\u6001\u951a\u70b9...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        $list.html(html);
    }

    let dbRefreshTimer = null;
    const scheduleDbRefresh = () => {
        if (dbRefreshTimer) {
            clearTimeout(dbRefreshTimer);
        }
        dbRefreshTimer = setTimeout(() => {
            refreshDatabaseList();
            if (typeof onStaticDbChanged === 'function') {
                onStaticDbChanged();
            }
        }, 200);
    };

    if (deps.eventBus?.on) {
        deps.eventBus.on('CHAPTER_UPDATED', scheduleDbRefresh);
        deps.eventBus.on('SBT_STATIC_DB_CHANGED', scheduleDbRefresh);
    }

    const downloadJsonFile = (obj, filename) => {
        const json = JSON.stringify(obj, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const exportCharacterSnapshot = async (characterId, options = {}) => {
        const includeCurrentAnchors = options.includeCurrentAnchors === true;
        if (characterId === undefined || characterId === null || characterId === '') {
            deps.toastr.warning('请先打开角色聊天界面', '无法导出');
            return;
        }

        let staticMatrices = staticDataManager.exportStaticData(characterId);
        if (!staticMatrices && typeof staticDataManager.autoBackfillStaticDataFromBaselineIfMissing === 'function') {
            const context = applicationFunctionManager.getContext ? applicationFunctionManager.getContext() : null;
            const expectedName = context?.name2 || '';
            const backfillResult = staticDataManager.autoBackfillStaticDataFromBaselineIfMissing(characterId, { expectedName });
            if (backfillResult?.backfilled) {
                deps.toastr.info('已回填静态数据', `角色 ${characterId}`);
                staticMatrices = staticDataManager.exportStaticData(characterId);
            }
        }
        if (!staticMatrices) {
            const db = staticDataManager.getFullDatabase();
            const availableIds = Object.keys(db);
            deps.warn?.('[UIManager] Export failed: no static data for character.', {
                characterId,
                availableIds,
            });
            if (availableIds.length > 0 && !availableIds.includes(String(characterId))) {
                deps.toastr.info('当前角色不在数据库中，请在列表里点击导出按钮', '提示');
            }
            deps.toastr.warning('未找到该角色的静态数据', '无法导出');
            return;
        }

        const payload = {
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            characterId: String(characterId),
            staticMatrices,
        };

        if (includeCurrentAnchors && typeof deps.getLeaderAnchorsForCurrentChat === 'function') {
            payload.leaderAnchors = deps.getLeaderAnchorsForCurrentChat();
        }

        if (typeof deps.getLeaderAnchorsByChatForCharacter === 'function') {
            try {
                payload.leaderAnchorsByChat = await deps.getLeaderAnchorsByChatForCharacter(characterId);
            } catch (error) {
                deps.warn?.('[UIManager] Failed to export leader anchors by chat:', error);
            }
        }

        downloadJsonFile(payload, `sbt-${characterId}-snapshot.json`);
        deps.toastr.success('已导出角色数据', '导出成功');
    };

    const uploadJsonFile = () => new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('JSON解析失败'));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'UTF-8');
        };
        input.click();
    });

    const getActiveCharacterId = () => {
        const context = applicationFunctionManager.getContext ? applicationFunctionManager.getContext() : null;
        const contextId = context?.characterId;

        const resolveFromState = () => {
            if (typeof getEffectiveChapterStateFn !== 'function') return null;
            const effectiveState = getEffectiveChapterStateFn();
            const stateId = resolveStaticCharacterId(effectiveState);
            return (stateId !== undefined && stateId !== null && stateId !== '') ? stateId : null;
        };

        if (contextId !== undefined && contextId !== null && contextId !== '') {
            try {
                const db = staticDataManager.getFullDatabase();
                const contextKey = String(contextId);
                if (db && Object.prototype.hasOwnProperty.call(db, contextKey)) {
                    return contextId;
                }
            } catch (error) {
                deps.warn?.('[UIManager] Failed to read static database for active character fallback:', error);
            }

            const fallbackId = resolveFromState();
            return fallbackId || contextId;
        }

        return resolveFromState();
    };

    
        const normalizeChatFileName = (name) => String(name || '').replace(/\.jsonl$/i, '');

    const renderDynamicAnchorsForCharacter = async (charId, $item) => {
        const $dynamicBody = $item.find('.sbt-db-dynamic-body');
        if ($dynamicBody.length === 0) return;

        $dynamicBody.html('<p class="sbt-instructions">\u6b63\u5728\u8bfb\u53d6\u52a8\u6001\u6570\u636e...</p>');

        if (typeof deps.getLeaderAnchorsByChatForCharacter !== 'function') {
            $dynamicBody.html('<p class="sbt-instructions">\u672a\u6ce8\u5165\u52a8\u6001\u951a\u70b9\u8bfb\u53d6\u51fd\u6570\u3002</p>');
            return;
        }

        try {
            const payload = await deps.getLeaderAnchorsByChatForCharacter(charId);
            const chats = Array.isArray(payload?.chats) ? payload.chats : [];
            const currentChatId = normalizeChatFileName(payload?.currentChatId);

            if (chats.length === 0 || chats.every(chat => !chat.anchors || chat.anchors.length === 0)) {
                $dynamicBody.html('<p class="sbt-instructions">\u6682\u65e0\u52a8\u6001\u951a\u70b9\u3002</p>');
                return;
            }

            const html = chats.map(chat => {
                const anchors = Array.isArray(chat.anchors) ? chat.anchors : [];
                if (anchors.length === 0) return '';

                const chatFile = String(chat.fileName || '');
                const displayName = normalizeChatFileName(chatFile) || chatFile || '\u672a\u547d\u540d\u4f1a\u8bdd';
                const isCurrent = currentChatId && normalizeChatFileName(chatFile) === currentChatId;
                const header = `
                    <div class="sbt-db-dynamic-chat-header">
                        <span class="sbt-db-dynamic-chat-name">${displayName}</span>
                        ${isCurrent ? '<span class="sbt-db-dynamic-chat-badge">\u5f53\u524d\u4f1a\u8bdd</span>' : ''}
                    </div>
                `;

                const chips = anchors.map(index => `
                    <span class="sbt-db-anchor-chip" data-chat-file="${chatFile}" data-anchor-index="${index}" data-char-id="${charId}">
                        #${index}
                        <button class="sbt-db-anchor-delete" title="\u5220\u9664\u8be5\u951a\u70b9">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </span>
                `).join('');

                return `
                    <div class="sbt-db-dynamic-chat-block" data-chat-file="${chatFile}">
                        ${header}
                        <div class="sbt-db-anchor-list">${chips}</div>
                    </div>
                `;
            }).filter(Boolean).join('');

            $dynamicBody.html(html || '<p class="sbt-instructions">\u6682\u65e0\u52a8\u6001\u951a\u70b9\u3002</p>');
        } catch (error) {
            $dynamicBody.html('<p class="sbt-instructions">\u52a8\u6001\u951a\u70b9\u52a0\u8f7d\u5931\u8d25\u3002</p>');
            deps.diagnose('[UIManager] Failed to load dynamic anchors:', error);
        }
    };

    // Expand/collapse database item
    $wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-item-header', function(e) {
        if ($(e.target).closest('.sbt-db-item-delete, .sbt-db-item-export').length) return;
        const $item = $(this).closest('.sbt-db-item');
        const $details = $item.find('.sbt-db-item-details');
        const $icon = $item.find('.sbt-db-expand-icon');
        const isOpen = $details.is(':visible');

        if (isOpen) {
            $details.hide();
            $icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
            return;
        }

        $details.show();
        $icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
        const charId = $item.data('char-id');
        if (charId !== undefined && charId !== null) {
            renderDynamicAnchorsForCharacter(charId, $item);
        }
    });

    $wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-item-export', async function(e) {
        e.stopPropagation();
        const $item = $(this).closest('.sbt-db-item');
        const charId = $item.data('char-id');
        const activeCharId = getActiveCharacterId();
        const includeAnchors = activeCharId !== undefined && activeCharId !== null && String(activeCharId) === String(charId);
        await exportCharacterSnapshot(charId, { includeCurrentAnchors: includeAnchors });
    });

    // Refresh database list
    $wrapper.find('#sbt-refresh-db-btn').on('click', () => {
        refreshDatabaseList();
        deps.toastr.success('\u5217\u8868\u5df2\u5237\u65b0', '\u5237\u65b0\u6210\u529f');
    });

    // Export current character (static + dynamic anchors)
    $wrapper.find('#sbt-export-current-role-btn').on('click', () => {
        const characterId = getActiveCharacterId();
        exportCharacterSnapshot(characterId, { includeCurrentAnchors: true });
    });

    // Import current character (static + dynamic anchors)
    $wrapper.find('#sbt-import-current-role-btn').on('click', async () => {
        const characterId = getActiveCharacterId();
        if (characterId === undefined || characterId === null || characterId === '') {
            deps.toastr.warning('\u8bf7\u5148\u6253\u5f00\u89d2\u8272\u804a\u5929\u754c\u9762', '\u65e0\u6cd5\u5bfc\u5165');
            return;
        }

        let payload;
        try {
            payload = await uploadJsonFile();
        } catch (error) {
            deps.toastr.error('\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25', '\u5bfc\u5165\u5931\u8d25');
            return;
        }

        if (!payload) return;

        if (payload.schemaVersion !== 2) {
            deps.toastr.error('\u4e0d\u652f\u6301\u7684\u6587\u4ef6\u683c\u5f0f', '\u5bfc\u5165\u5931\u8d25');
            return;
        }

        const staticMatrices = payload.staticMatrices;
        if (staticMatrices && typeof staticMatrices === 'object') {
            staticDataManager.importStaticData(characterId, staticMatrices, { replace: true });
        }

        const leaderAnchors = Array.isArray(payload.leaderAnchors) ? payload.leaderAnchors : [];
        if (leaderAnchors.length > 0) {
            if (typeof deps.applyLeaderAnchors === 'function') {
                deps.applyLeaderAnchors(leaderAnchors, { mapToCharacterId: characterId, setCurrentChapter: true });
            } else {
                deps.toastr.warning('\u672a\u6ce8\u5165\u5bfc\u5165\u951a\u70b9\u5904\u7406\u51fd\u6570', '\u52a8\u6001\u5bfc\u5165\u5931\u8d25');
            }
        }

        refreshDatabaseList();
        if (typeof onStaticDbChanged === 'function') {
            onStaticDbChanged();
        }
        deps.toastr.success('\u5bfc\u5165\u5b8c\u6210', '\u5bfc\u5165\u6210\u529f');
    });

    // Initial load
    refreshDatabaseList();

        // Clear all data button
    $wrapper.find('#sbt-clear-all-db-btn').on('click', async () => {
        const confirmed = await simpleConfirm(
            '\u786e\u8ba4\u6e05\u7a7a',
            '\u786e\u5b9a\u8981\u6e05\u7a7a\u6240\u6709\u89d2\u8272\u7684\u52a8\u9759\u6001\u6570\u636e\u5417\uff1f\n\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\uff0c\u6240\u6709\u89d2\u8272\u7684\u4e16\u754c\u89c2\u4e0e\u52a8\u6001 leader \u90fd\u5c06\u88ab\u5220\u9664\u3002\n\u4e0b\u6b21\u542f\u52a8\u7ae0\u8282\u65f6\u5c06\u91cd\u65b0\u5206\u6790\u4e16\u754c\u4e66\u3002',
            '\u6e05\u7a7a\u5168\u90e8',
            '\u53d6\u6d88'
        );

        logger.debug('[SBT-DB] Clear all confirm:', confirmed);

        if (confirmed) {
            logger.debug('[SBT-DB] Clearing all dynamic + static data...');
            if (typeof deps.removeAllLeaderAnchorsForAllCharacters === 'function') {
                try {
                    const result = await deps.removeAllLeaderAnchorsForAllCharacters();
                    logger.debug('[SBT-DB] Dynamic cleanup result:', result);
                } catch (error) {
                    logger.warn('[SBT-DB] Dynamic cleanup failed:', error);
                }
            }
            const success = staticDataManager.clearAllStaticData();
            logger.debug('[SBT-DB] Clear result:', success);

            // Verify cleanup
            const db = staticDataManager.getFullDatabase();
            logger.debug('[SBT-DB] Database after clear:', db);
            logger.debug('[SBT-DB] Database empty:', Object.keys(db).length === 0);

            refreshDatabaseList();
            if (typeof onStaticDbChanged === 'function') {
                onStaticDbChanged();
            }
            deps.toastr.success('\u6240\u6709\u52a8\u9759\u6001\u6570\u636e\u5df2\u6e05\u7a7a', '\u6e05\u7a7a\u6210\u529f');
        } else {
            logger.debug('[SBT-DB] Clear all canceled');
        }
    });



    // 单个删除按钮（事件委托）
        // Delete one character (static + dynamic)
    $wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-item-delete', async function() {
        const $item = $(this).closest('.sbt-db-item');
        const charId = $item.data('char-id');

        logger.debug('[SBT-DB] Preparing delete:', charId);

        const confirmed = await simpleConfirm(
            '\u786e\u8ba4\u5220\u9664',
            `\u786e\u5b9a\u8981\u5220\u9664\u89d2\u8272 "${charId}" \u7684\u52a8\u9759\u6001\u6570\u636e\u5417\uff1f\n\n\u8fd9\u4f1a\u6e05\u7a7a\u8be5\u89d2\u8272\u6240\u6709\u4f1a\u8bdd\u4e2d\u7684\u52a8\u6001 leader\u3002\n\u4e0b\u6b21\u542f\u52a8\u8be5\u89d2\u8272\u7684\u7ae0\u8282\u65f6\u5c06\u91cd\u65b0\u5206\u6790\u5176\u4e16\u754c\u4e66\u3002`,
            '\u5220\u9664\u52a8\u9759\u6001',
            '\u53d6\u6d88'
        );

        logger.debug('[SBT-DB] Delete confirm:', confirmed);

        if (confirmed) {
            logger.debug('[SBT-DB] Deleting character data:', charId);
            if (typeof deps.removeAllLeaderAnchorsForCharacter === 'function') {
                try {
                    const result = await deps.removeAllLeaderAnchorsForCharacter(charId);
                    logger.debug('[SBT-DB] Dynamic cleanup result:', result);
                } catch (error) {
                    logger.warn('[SBT-DB] Dynamic cleanup failed:', error);
                }
            }
            const success = staticDataManager.deleteStaticData(charId);
            logger.debug('[SBT-DB] Static delete result:', success);

            // Verify delete
            const db = staticDataManager.getFullDatabase();
            logger.debug('[SBT-DB] Database after delete:', db);
            logger.debug('[SBT-DB] Character still exists:', charId in db);

            refreshDatabaseList();
            if (typeof onStaticDbChanged === 'function') {
                onStaticDbChanged();
            }
            deps.toastr.success(`\u89d2\u8272 "${charId}" \u7684\u52a8\u9759\u6001\u6570\u636e\u5df2\u5220\u9664`, '\u5220\u9664\u6210\u529f');
        } else {
            logger.debug('[SBT-DB] Delete canceled');
        }
    });

    // Delete a single dynamic anchor (delegated)
$wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-anchor-delete', async function(e) {
        e.stopPropagation();
        const $chip = $(this).closest('.sbt-db-anchor-chip');
        const charId = $chip.data('char-id');
        const chatFile = $chip.data('chat-file');
        const anchorIndex = Number($chip.data('anchor-index'));

        if (!Number.isInteger(anchorIndex) || charId === undefined || chatFile === undefined) {
            deps.toastr.warning('\u65e0\u6548\u7684\u951a\u70b9\u53c2\u6570', '\u5220\u9664\u5931\u8d25');
            return;
        }

        const confirmed = await simpleConfirm(
            '\u786e\u8ba4\u5220\u9664',
            `\u786e\u5b9a\u8981\u5220\u9664\u8be5\u951a\u70b9 #${anchorIndex} \u5417\uff1f`,
            '\u5220\u9664',
            '\u53d6\u6d88'
        );

        if (!confirmed) return;

        if (typeof deps.removeLeaderAnchor !== 'function') {
            deps.toastr.error('\u672a\u6ce8\u5165\u52a8\u6001\u5220\u9664\u51fd\u6570', '\u5220\u9664\u5931\u8d25');
            return;
        }

        try {
            const result = await deps.removeLeaderAnchor({
                characterId: charId,
                fileName: chatFile,
                messageIndex: anchorIndex
            });

            if (!result?.removed) {
                deps.toastr.warning('\u8be5\u951a\u70b9\u672a\u88ab\u5220\u9664', '\u63d0\u793a');
            } else {
                deps.toastr.success('\u951a\u70b9\u5df2\u5220\u9664', '\u5220\u9664\u6210\u529f');
            }
        } catch (error) {
            deps.toastr.error('\u5220\u9664\u951a\u70b9\u5931\u8d25', '\u9519\u8bef');
            deps.diagnose('[UIManager] Failed to delete anchor:', error);
        }

        const $item = $chip.closest('.sbt-db-item');
        const itemCharId = $item.data('char-id');
        if (itemCharId !== undefined && itemCharId !== null) {
            renderDynamicAnchorsForCharacter(itemCharId, $item);
        }
    });




    

            

}

export { populateSettingsUI };
