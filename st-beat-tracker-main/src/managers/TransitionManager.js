/**
 * 章节转换管理器
 * 负责所有章节转换相关的流程：创世纪、标准转换、规划等
 * 
 * @module TransitionManager
 */

import { ENGINE_STATUS } from '../constants.js';
import { Chapter } from '../../Chapter.js';
import * as staticDataManager from '../StaticDataManager.js';
import { deepmerge } from '../../utils/deepmerge.js';
import { ChapterAnalyzer } from '../utils/ChapterAnalyzer.js';
import { DebugLogger } from '../utils/DebugLogger.js';
import { sbtConsole } from '../../utils/sbtConsole.js';
import * as stateManager from '../../stateManager.js';
import { simpleHash } from '../../utils/textUtils.js';
import { DatabaseAdapter } from '../../DatabaseAdapter.js';

/**
 * 章节转换管理器类
 * 封装所有章节转换相关的核心逻辑
 */
export class TransitionManager {
    /**
     * 构造函数
     * @param {StoryBeatEngine} engine - 主引擎实例引用
     * @param {Object} dependencies - 依赖注入对象
     */
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('TransitionManager');
        
        // 引用常用的依赖
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
        this.toastr = dependencies.toastr;
    }

    // ========== 辅助属性访问器 ==========
    
    /** 获取 USER 实例 */
    get USER() { return this.engine.USER; }
    
    /** 获取 LEADER 实例 */
    get LEADER() { return this.engine.LEADER; }
    
    /** 获取当前章节 */
    get currentChapter() { return this.engine.currentChapter; }
    set currentChapter(value) { this.engine.currentChapter = value; }
    
    /** 获取创世纪待提交标志 */
    get isGenesisStatePendingCommit() { return this.engine.isGenesisStatePendingCommit; }
    set isGenesisStatePendingCommit(value) { this.engine.isGenesisStatePendingCommit = value; }
    
    /** 获取新章节待提交标志 */
    get isNewChapterPendingCommit() { return this.engine.isNewChapterPendingCommit; }
    set isNewChapterPendingCommit(value) { this.engine.isNewChapterPendingCommit = value; }
    
    /** 获取事件总线 */
    get eventBus() { return this.engine.eventBus; }
    
    /** 获取id等交互 */
    get status() { return this.engine.status; }
    
    /** 获取各种Agent */
    get intelligenceAgent() { return this.engine.intelligenceAgent; }
    get historianAgent() { return this.engine.historianAgent; }
    get architectAgent() { return this.engine.architectAgent; }
    
    /** 获取LLM服务 */
    get mainLlmService() { return this.engine.mainLlmService; }
    
    /** 获取当前任务中止控制器 */
    get currentTaskAbortController() { return this.engine.currentTaskAbortController; }
    set currentTaskAbortController(value) { this.engine.currentTaskAbortController = value; }
    
    /** 获取转换停止请求标志 */
    get _transitionStopRequested() { return this.engine._transitionStopRequested; }
    set _transitionStopRequested(value) { this.engine._transitionStopRequested = value; }
    
    /** 获取活动转换Toast */
    get _activeTransitionToast() { return this.engine._activeTransitionToast; }
    set _activeTransitionToast(value) { this.engine._activeTransitionToast = value; }
    
    // ========== 委托方法（调用engine的方法） ==========
    
    _setStatus(status) {
        return this.engine._setStatus(status);
    }
    
    _captureEarlyFocusInput(workingChapter, $button) {
        return this.engine._captureEarlyFocusInput(workingChapter, $button);
    }
    
    _bindStopButton(stageLabel) {
        return this.engine._bindStopButton(stageLabel);
    }
    
    _throwIfStopRequested(stageLabel) {
        return this.engine._throwIfStopRequested(stageLabel);
    }
    
    _cleanupAfterTransitionStop() {
        return this.engine._cleanupAfterTransitionStop();
    }
    
    onCommitState(messageIndex) {
        return this.engine.onCommitState(messageIndex);
    }
    
    // ========== 核心方法 ==========


    // ========== triggerChapterTransition ==========
    /**
     * 触发章节转换
     * @param {string} eventUid - 事件唯一标识
     * @param {number} endIndex - 消息结束索引
     * @param {string} transitionType - 转换类型
     */
    async triggerChapterTransition(eventUid, endIndex, transitionType = 'Standard') {
        // 【总开关保护】检查引擎是否已启用
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        if (!isEngineEnabled) {
            this.toastr.warning('叙事流引擎已关闭，章节转换已中止', '功能已禁用');
            this.info('[Guard-MasterSwitch] 章节转换流程中止：引擎总开关已关闭。');
            return;
        }
    
        this._transitionStopRequested = false;
        this._activeTransitionToast = null;
        this.currentTaskAbortController = new AbortController(); // V9.2: 创建中止控制器
    
        this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
        const loadingToast = this.toastr.info(
            "正在启动章节转换流程...", "章节转换中...",
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
        );
        this._activeTransitionToast = loadingToast;
        this.info(`--- 章节转换流程启动 (ECI事务模型 V3.1 - 断点恢复增强版) ---`);
        this.logger.group(`BRIDGE-PROBE [CHAPTER-TRANSITION-RESILIENT]: ${eventUid}`);
    
        try {
            const activeCharId = this.USER.getContext()?.characterId;
            if (!activeCharId) throw new Error("无法获取 activeCharId。");
    
            // 1. 加载当前状态
            const { piece: lastStatePiece, deep: lastAnchorIndex } = this.USER.findLastMessageWithLeader({ 
                deep: (this.USER.getContext().chat.length - 1 - endIndex) 
            });
    
            const hasLeaderSnapshot = !!(lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader));
            let workingChapter;
            if (hasLeaderSnapshot) {
                workingChapter = Chapter.fromJSON(lastStatePiece.leader);
            } else {
                workingChapter = new Chapter({ characterId: activeCharId });
            }
            this.engine.narrativeControlTowerManager.syncStorylineProgressWithStorylines(workingChapter);

            // ✅ 静态数据库只允许在“预编辑/手动管理”时写入
            // 默认禁止将动态对话中的静态矩阵回写到静态数据库，防止污染新对话
            const allowStaticSync = localStorage.getItem('sbt-static-sync-enabled') === 'true';
            if (allowStaticSync && hasLeaderSnapshot && workingChapter?.staticMatrices) {
                try {
                    staticDataManager.saveStaticData(activeCharId, workingChapter.staticMatrices);
                    this.info('已启用静态同步：动态静态矩阵已回写静态数据库。');
                } catch (syncError) {
                    this.warn('静态数据库同步失败，继续使用现有缓存。', syncError);
                }
            }
            const staticData = staticDataManager.loadStaticData(activeCharId);
            if (staticData) {
                // 以静态数据库为底座，动态章节为覆盖层，避免旧静态覆盖现有剧情
                workingChapter.staticMatrices = deepmerge(staticData, workingChapter.staticMatrices);
            }
    
            // V7.2: 提前获取目标消息引用（用于分两次写入）
            const targetPiece = this.USER.getContext().chat[endIndex];
            if (!targetPiece) {
                throw new Error(`无法找到索引 ${endIndex} 处的目标消息！`);
            }
    
            const isDbAdapterEnabled = DatabaseAdapter.isEnabled();

            // 2. V7.2 增强：检查是否有未完成的过渡（支持分阶段断点恢复）
            let reviewDelta = null;
            let finalNarrativeFocus = "由AI自主创新。";
            let skipHistorian = isDbAdapterEnabled;

            if (this.LEADER.pendingTransition) {
                // 验证pendingTransition是否属于当前转换
                const isSameTransition = this.LEADER.pendingTransition.endIndex === endIndex;

                if (isSameTransition) {
                    this.info("检测到未完成的章节转换进度，正在恢复...");
                    loadingToast.find('.toast-message').text("恢复之前的进度...");

                    const status = this.LEADER.pendingTransition.status;
                    reviewDelta = this.LEADER.pendingTransition.historianReviewDelta;
                    finalNarrativeFocus = this.LEADER.pendingTransition.playerNarrativeFocus || "由AI自主创新。";

                    // V7.2: 如果史官已完成且已写入 leader，直接跳过史官
                    if (status === 'awaiting_architect' || status === 'historian_saved') {
                        skipHistorian = true;
                        // 从 leader 读取史官已保存的结果
                        if (targetPiece.leader && Chapter.isValidStructure(targetPiece.leader)) {
                            workingChapter = Chapter.fromJSON(targetPiece.leader);
                            this.engine.narrativeControlTowerManager.syncStorylineProgressWithStorylines(workingChapter);
                            this.info("✓ 史官结果已从 leader 恢复，正在合并最新的前端数据...");

                            //【关键修复】在恢复中间状态后，必须重新合并最新的静态数据，以包含用户在重试期间可能做出的修改
                            const freshStaticData = staticDataManager.loadStaticData(activeCharId);
                            if (freshStaticData) {
                                // 以静态数据库为底座，动态章节为覆盖层
                                workingChapter.staticMatrices = deepmerge(freshStaticData, workingChapter.staticMatrices);
                                this.info("✓ 最新的前端数据已合并，进入建筑师阶段。");
                            }
                        }
                    } else {
                        workingChapter.playerNarrativeFocus = finalNarrativeFocus;
                    }

                    this.info(`断点恢复状态: ${status}, 跳过史官: ${skipHistorian}`);
                } else {
                    // pendingTransition是上次转换的残留，清理并重新开始
                    this.warn(`检测到过期的pendingTransition（属于索引${this.LEADER.pendingTransition.endIndex}，当前索引${endIndex}），已清理。`);
                    this.LEADER.pendingTransition = null;
                    this.USER.saveChat();
                    skipHistorian = isDbAdapterEnabled;
                }
            } else {
                skipHistorian = isDbAdapterEnabled;
            }

            if (isDbAdapterEnabled) {
                if (!this.LEADER.pendingTransition) {
                    this.LEADER.pendingTransition = {
                        endIndex: endIndex,
                        historianReviewDelta: null,
                        playerNarrativeFocus: workingChapter?.playerNarrativeFocus || "由AI自主创新。",
                        freeRoamMode: false,
                        status: 'db_skip_historian'
                    };
                    this.USER.saveChat();
                }
                reviewDelta = this.LEADER.pendingTransition.historianReviewDelta || null;
                finalNarrativeFocus = this.LEADER.pendingTransition.playerNarrativeFocus
                    || workingChapter?.playerNarrativeFocus
                    || "由AI自主创新。";
                skipHistorian = true;
                this.info("[DB适配] 已启用数据库适配模式，跳过史官复盘。");
                if (!reviewDelta || typeof reviewDelta !== 'object') {
                    reviewDelta = {};
                }
            }
    
            if (!skipHistorian) {
                // 3. 【V10.1 并行流程】启动史官复盘 + 挂载提前规划按钮
                loadingToast.find('.toast-message').html(`
                    史官正在复盘本章历史...<br>
                    <div class="sbt-compact-toast-actions">
                        <button id="sbt-early-focus-btn" class="sbt-compact-focus-btn" title="提前规划下一章">
                            <i class="fa-solid fa-pen-ruler"></i> 规划
                        </button>
                        <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止章节转换">
                            <i class="fa-solid fa-octagon-exclamation"></i> 停止
                        </button>
                    </div>
                `);
                this._bindStopButton('史官阶段');
    
                // 【核心修复】将史官执行和玩家输入变成两个独立的并行Promise
                let playerInputPromise = null;
                let isCapturingInput = false; // 使用布尔标志而不是检查Promise对象

                // 添加提前规划按钮的事件监听（不阻塞史官）
                $('#sbt-early-focus-btn').off('click').on('click', async () => {
                    if (isCapturingInput) {
                        this.info("已有一个提前规划弹窗在等待输入，忽略重复点击");
                        return;
                    }

                    const $btn = $('#sbt-early-focus-btn');
                    this.info("玩家点击了提前规划按钮，开始并行捕获输入...");

                    isCapturingInput = true; // 设置标志，防止重复点击
                    // 创建独立的Promise，不阻塞史官（包装为总是resolve的Promise）
                    playerInputPromise = (async () => {
                        try {
                            const result = await this._captureEarlyFocusInput(workingChapter, $btn);
                            return result;
                        } catch (error) {
                            this.warn("提前规划输入失败，将回退到常规弹窗", error);
                            return null; // 返回null表示失败，后续会触发常规弹窗
                        } finally {
                            isCapturingInput = false; // 无论成功或失败，都重置标志
                        }
                    })();
                });
    
                // 史官执行（并行）
                reviewDelta = await this._runStrategicReview(workingChapter, lastAnchorIndex, endIndex, this.currentTaskAbortController.signal);
    
                if (!reviewDelta || (!reviewDelta.creations && !reviewDelta.updates)) {
                    // 如果不是因为中止而失败，才显示错误
                    if (!this.currentTaskAbortController.signal.aborted) {
                        this.toastr.error(
                            "史官在复盘本章历史时遇到严重错误（很可能是网络连接问题），章节转换已中止。<br><small>请检查您的网络和API设置后，前往叙事罗盘面板手动点击按钮重试。</small>",
                            "章节转换失败",
                            { timeOut: 15000, escapeHtml: false }
                        );
                    }
                    // 清除可能存在的错误临时状态
                    this.LEADER.pendingTransition = null;
                    this.LEADER.earlyPlayerInput = null;
                    this.USER.saveChat();
                    // 无论如何，中止流程
                    throw new Error("史官复盘失败或被中止。");
                }
    
                // 【阶段1完成】保存史官分析结果到临时存储
                this.LEADER.pendingTransition = {
                    endIndex: endIndex,  // 记录转换的目标索引，用于验证
                    historianReviewDelta: reviewDelta,
                    playerNarrativeFocus: null,
                    status: 'awaiting_focus'
                };
                this.USER.saveChat();
                this.info("史官复盘完成，中间结果已暂存（阶段1/3）。");
    
                // 4. 【V10.1 同步点】等待玩家输入完成（如果玩家已点击提前规划）或启动常规弹窗
                let isFreeRoamMode = false;
    
                if (playerInputPromise !== null) {
                    // 玩家已点击提前规划按钮，等待其完成（Promise可能已resolve或仍在pending）
                    this.info("史官已完成，等待玩家完成提前规划输入...");
                    loadingToast.find('.toast-message').text("等待您完成规划输入...");
    
                    // 等待玩家输入Promise完成（无论成功或失败都会resolve）
                    await playerInputPromise;
                    playerInputPromise = null; // 重置变量，允许下次点击

                    if (this.LEADER.earlyPlayerInput) {
                        // 玩家成功完成了提前规划
                        this.info("使用玩家提前输入的焦点");
                        finalNarrativeFocus = this.LEADER.earlyPlayerInput.focus;
                        isFreeRoamMode = this.LEADER.earlyPlayerInput.freeRoam;
                        this.LEADER.earlyPlayerInput = null; // 清除临时数据
                        loadingToast.find('.toast-message').text("正在应用您的规划...");
                    } else {
                        // 玩家取消或失败，回退到常规弹窗
                        this.info("提前规划被取消或失败，启动常规焦点弹窗");
                        loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
                        this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                        const popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
                        if (popupResult.freeRoam) {
                            isFreeRoamMode = true;
                            finalNarrativeFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
                            this.info("🎲 [自由章模式] 已激活：本章将跳过建筑师规划和回合执导，世界观档案将全部发送到前台");
                        } else if (popupResult.abc) {
                            const userInput = popupResult.value || "";
                            finalNarrativeFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
                        } else if (popupResult.confirmed && popupResult.value) {
                            finalNarrativeFocus = popupResult.value;
                        }
                    }
                } else {
                    // 玩家没有点击提前规划按钮，史官完成后启动常规弹窗
                    this.info("玩家未使用提前规划，启动常规焦点弹窗");
                    loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
                    this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                    const popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
                    if (popupResult.freeRoam) {
                        isFreeRoamMode = true;
                        finalNarrativeFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
                        this.info("🎲 [自由章模式] 已激活：本章将跳过建筑师规划和回合执导，世界观档案将全部发送到前台");
                    } else if (popupResult.abc) {
                        const userInput = popupResult.value || "";
                        finalNarrativeFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
                    } else if (popupResult.confirmed && popupResult.value) {
                        finalNarrativeFocus = popupResult.value;
                    }
                }
    
                // 【阶段2完成】更新玩家焦点到临时存储
                this.LEADER.pendingTransition.playerNarrativeFocus = finalNarrativeFocus;
                this.LEADER.pendingTransition.freeRoamMode = isFreeRoamMode;
                this.LEADER.pendingTransition.status = 'awaiting_architect';
                this.USER.saveChat();
                this.info("玩家焦点已捕获，中间结果已更新（阶段2/3）。");
            }
    
            // 5. 【核心】创建新章节实例并应用史官的事务增量
            const oldChapterUid = workingChapter.uid;
            const newChapterData = JSON.parse(JSON.stringify(workingChapter.toJSON()));
            delete newChapterData.uid;
            delete newChapterData.checksum;
            const newChapter = new Chapter(newChapterData);

            if (!reviewDelta || typeof reviewDelta !== 'object') {
                reviewDelta = {};
            }

            let updatedNewChapter = this.engine.stateUpdateManager.applyStateUpdates(newChapter, reviewDelta);

            if (!updatedNewChapter.meta) {
                updatedNewChapter.meta = {};
            }
            const baseChapterNumberRaw = workingChapter?.meta?.chapterNumber;
            const baseChapterNumberParsed = parseInt(baseChapterNumberRaw, 10);
            const baseChapterNumber = Number.isFinite(baseChapterNumberParsed) && baseChapterNumberParsed > 0
                ? baseChapterNumberParsed
                : 1;
            const pendingStatus = this.LEADER?.pendingTransition?.status;
            const isPendingResume = pendingStatus === 'awaiting_architect' || pendingStatus === 'historian_saved';
            updatedNewChapter.meta.chapterNumber = isPendingResume
                ? baseChapterNumber
                : baseChapterNumber + 1;

            updatedNewChapter.playerNarrativeFocus = finalNarrativeFocus;
            updatedNewChapter.meta.freeRoamMode = this.LEADER.pendingTransition.freeRoamMode || false;
    
            this.info(`✓ 已创建新章节实例（旧UID: ${oldChapterUid} → 新UID: ${updatedNewChapter.uid}）`);
    
            targetPiece.leader = updatedNewChapter.toJSON();
            this.USER.saveChat();
            this.info(`✓ [V7.2-阶段1/2] 史官分析结果已写入消息 #${endIndex} 的 leader（新章节UID: ${updatedNewChapter.uid}）`);
    
            // 6. 规划下一章节（使用新章节实例）
            if (updatedNewChapter.meta.freeRoamMode) {
                this.info("🎲 跳过建筑师规划，进入自由章模式");
                updatedNewChapter.chapter_blueprint = { title: "自由探索", emotional_arc: "自由发挥", plot_beats: [] };
                updatedNewChapter.activeChapterDesignNotes = null;
            } else {
                this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
                loadingToast.find('.toast-message').html(`
                    建筑师正在规划新章节...<br>
                    <div class="sbt-compact-toast-actions">
                        <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止章节转换">
                            <i class="fa-solid fa-octagon-exclamation"></i> 停止
                        </button>
                    </div>
                `);
                this._bindStopButton('建筑师阶段');
                const architectResult = await this._planNextChapter(false, updatedNewChapter, null, this.currentTaskAbortController.signal);    
                if (!architectResult || !architectResult.new_chapter_script) {
                    throw new Error("建筑师未能生成新剧本。中间进度已保存，请点击按钮重试。");
                }
    
                loadingToast.find('.toast-message').text("正在固化记忆并刷新状态...");
                ChapterAnalyzer.processStarMarkedBeats(architectResult.new_chapter_script, this.info);
                updatedNewChapter.chapter_blueprint = architectResult.new_chapter_script;
                updatedNewChapter.activeChapterDesignNotes = architectResult.design_notes;
    
                const chapterContextIds = architectResult.new_chapter_script.chapter_context_ids || [];
                this.logger.group('[ENGINE-V3-DEBUG] 章节转换 - 章节上下文缓存');
                this.logger.log('建筑师返回的 chapter_context_ids:', chapterContextIds);
                updatedNewChapter.cachedChapterStaticContext = this.engine.entityContextManager.generateChapterStaticContext(chapterContextIds, updatedNewChapter);        
                this.logger.log('缓存后 cachedChapterStaticContext 长度:', updatedNewChapter.cachedChapterStaticContext?.length || 0);
                this.logger.groupEnd();
                this.info(`章节转换: 章节级静态上下文已缓存（${chapterContextIds.length}个实体）。`);
            }
    
            updatedNewChapter.lastProcessedEventUid = eventUid;
            updatedNewChapter.checksum = simpleHash(JSON.stringify(updatedNewChapter) + Date.now());
    
            targetPiece.leader = updatedNewChapter.toJSON();
            this.USER.saveChat();
            this.info(`✓ [V7.2-阶段2/2] 建筑师规划已追加到消息 #${endIndex} 的 leader（完整状态：史官+建筑师）`);
    
            this.currentChapter = updatedNewChapter;
            this.isNewChapterPendingCommit = false;
    
            this.LEADER.pendingTransition = null;
            this.LEADER.earlyPlayerInput = null;
    
            this.info(`[V7.2] 新章节状态已完整保存（UID: ${updatedNewChapter.uid}），史官+建筑师结果已锚定到消息 #${endIndex}（阶段3/3完成）。`)
    
            try {
                this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
                this.toastr.success("章节已更新，仪表盘已刷新！", "无缝衔接");
            } catch (uiError) {
                this.diagnose("UI更新操作失败，但这不会影响核心状态的保存。", uiError);
                this.toastr.warning("后台状态已更新，但UI刷新失败，请手动刷新页面。", "UI警告");
            }
    
        } catch (error) {
            if (error.name === 'AbortError' || error.code === 'SBT_TRANSITION_STOP') {
                this.warn('章节转换流程被强制中止。');
                this._cleanupAfterTransitionStop();
                this.toastr.info("章节转换已由用户成功中止。", "操作已取消");
            } else {
                this.diagnose("章节转换流程中发生严重错误:", error);
                this.toastr.error(`${error.message}`, "章节规划失败", { timeOut: 10000 });
            }
            this.LEADER.earlyPlayerInput = null;
        } finally {
            this._setStatus(ENGINE_STATUS.IDLE);
            this.currentTaskAbortController = null;
            if (loadingToast) {
                this.toastr.clear(loadingToast);
            }
            this.logger.groupEnd();
        }
    }

    // ========== _runStrategicReview ==========
    /**
     * 执行策略性复盘（史官）
     * @param {Chapter} chapterContext - 章节上下文
     * @param {number} startIndex - 起始索引
     * @param {number} endIndex - 结束索引
     * @param {AbortSignal} abortSignal - 中止信号
     * @returns {Promise<Object|null>} 史官返回的Delta
     */
    async _runStrategicReview(chapterContext, startIndex, endIndex, abortSignal = null) {
        this.logger.group("BRIDGE-PROBE [STRATEGIC-REVIEW]");
        this.info("史官正在复盘本章历史...");
    
        let reviewDelta = null;
        try {
            this._throwIfStopRequested('史官复盘准备阶段');
            const chat = this.USER.getContext().chat;
            const chapterMessages = [];
            const safeStartIndex = Math.max(0, startIndex + 1);
            for (let i = safeStartIndex; i <= endIndex; i++) {
                if(chat[i]) chapterMessages.push(chat[i]);
            }
    
            const chapterTranscript = chapterMessages.length > 0
                ? chapterMessages.map(msg => `[${msg.is_user ? "{{user}}" : "{{char}}"}]:\n${msg.mes}`).join('\n\n---\n\n')
                : "【本章无实质性对话】";

            const dossierSchema = stateManager.loadDossierSchemaFromCharacter();
            const contextForHistorian = {
                chapterTranscript,
                chapter: chapterContext,
                dossierSchema,
            };
    
            reviewDelta = await this.historianAgent.execute(contextForHistorian, abortSignal);
            this._throwIfStopRequested('史官复盘阶段');
    
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error; // 向上抛出中止错误
            }
            this.diagnose("在 _runStrategicReview 过程中发生错误:", error);
            // 其他错误不抛出，让上层根据 reviewDelta === null 来处理
        } finally {
            this.logger.groupEnd();
            return reviewDelta;
        }
    }

    // ========== startGenesisProcess ==========
    /**
     * 启动创世纪流程
     * 初始化整个叙事系统的起点
     */
    async startGenesisProcess() {
        this.info("--- 用户通过UI启动创世纪流程 ---");
    
        // 【总开关保护】检查引擎是否已启用
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        if (!isEngineEnabled) {
            this.toastr.warning('叙事流引擎已关闭，请先在设置中启用总开关', '功能已禁用');
            this.info('[Guard-MasterSwitch] 创世纪流程中止：引擎总开关已关闭。');
            return;
        }
    
        if (typeof TavernHelper?.setChatMessages !== 'function') {
            this.toastr.error("核心辅助插件 (TavernHelper) 未找到或版本不兼容。", "依赖缺失");
            this.diagnose("TavernHelper.setChatMessages 不是一个有效的函数。");
            return;
        }
        if (this.status !== ENGINE_STATUS.IDLE) {
            this.toastr.warning("引擎当前正忙，请稍后再试。", "操作繁忙");
            return;
        }
    
    
        // --- 核心逻辑分支 ---
        // 【V4.2】检查手动输入的开场白（优先级最高）
        const manualOpeningScene = $('#sbt-manual-opening-scene').val()?.trim();
        const chat = this.USER.getContext().chat;
        const hasExistingFirstMessage = chat.length > 0 && chat[0] && !chat[0].is_user;
        let firstMessageContent = null;
    
        if (manualOpeningScene) {
            // 使用手动输入的开场白（最高优先级）
            firstMessageContent = manualOpeningScene;
            this.info("检测到手动输入的开场白，将使用此内容作为故事起点。");
        } else if (hasExistingFirstMessage) {
            // 否则尝试从聊天记录中读取
            firstMessageContent = chat[0].mes;
            this.info("使用角色自带的开场白作为故事起点。");
        } else {
            // 完全没有开场白，AI将自由创作
            this.info("未检测到开场白，AI将自由创作开篇场景。");
        }
    
        await this._runGenesisFlow(firstMessageContent);
        if (!this.currentChapter || !this.currentChapter.chapter_blueprint) {
            this.toastr.error("创世纪流程未能成功生成剧本，请检查后台AI设置或查看控制台。", "创世纪失败");
            return;
        }
        
        const loadingToast = this.toastr.info("正在为您渲染故事的开端...", "序幕拉开", { timeOut: 0, extendedTimeOut: 0 });
        this._setStatus(ENGINE_STATUS.BUSY_ANALYZING);
    
        try {
            if (hasExistingFirstMessage) {
                // --- 方案A: 采用并增强已有的开场白 ---
                this.info("检测到角色自带开场白。将在此基础上静默初始化引擎...");
                
                const firstMessage = chat[0];
                firstMessage.leader = this.currentChapter.toJSON();
                await TavernHelper.setChatMessages(
                    [{ message_id: 0, ...firstMessage }], 
                    { refresh: 'all' }
                );
    
                this.info(`引擎状态已成功锚定到已存在的开场白 (消息ID: 0)。`);
                this.toastr.success("已在角色开场白上成功初始化叙事流引擎！", "无缝启动");
    
            } else {
                this.info("未检测到开场白。将为故事主动生成新的开场白...");
    
       const openingPrompt = `
    # 指令：史诗的开端 (The Epic's Overture)
    
    
    
    1.  **禁止对话:** 你的回复中【绝对不能】包含任何角色的对话、心理独白或动作。
    2.  **纯粹的环境描写:** 你的回复【必须】是一段纯粹的、第三人称的、富有文学性的**环境与氛围描写**。
    3.  **忠于剧本:** 你的描写必须严格遵循下方“规则手册”中定义的场景、氛围和核心世界法则。你需要将那些抽象的规则，转化为玩家可以直观感受到的景象和感觉。
    
    ---
    # **【第一卷 框架式互动规则】**
    ---
    \`\`\`json
    ${JSON.stringify(this.currentChapter.chapter_blueprint, null, 2)}
    \`\`\`
    `;
    
                const openingNarration = await this.mainLlmService.callLLM([{ role: 'user', content: openingPrompt }]);
                if (!openingNarration || openingNarration.trim() === '') {
                    throw new Error("AI未能生成有效的开场白。");
                }
                
                const openingMessage = {
                    is_user: false,
                    mes: openingNarration.trim(),
                    leader: this.currentChapter.toJSON()
                };
                
                // 将新消息添加到聊天数组的末尾
                chat.push(openingMessage);
                const newMessageId = chat.length - 1;
    
                // 渲染这条新消息
                await TavernHelper.setChatMessages(
                    [{ message_id: newMessageId, ...openingMessage }], 
                    { refresh: 'all' }
                );
    
                this.info(`创世纪开场白已成功创建并锚定在消息ID: ${newMessageId}`);
                this.toastr.success("故事的序幕已拉开！现在，请您做出第一个行动。", "篇章开启");
            }
    
        } catch (error) {
            this.diagnose("在生成或提交开场白时发生错误:", error);
            this.toastr.error(`开场失败: ${error.message}`, "引擎错误");
        } finally {
            this.toastr.clear(loadingToast);
            this._setStatus(ENGINE_STATUS.IDLE);
            // 重置内存中的chapter，因为状态已经安全地写入了聊天记录
            this.currentChapter = null;
        }
    }

    // ========== _runGenesisFlow ==========
    /**
     * 执行创世纪流程
     * @param {string} firstMessageContent - 首条消息内容
     */
    async _runGenesisFlow(firstMessageContent = null) {
            this._setStatus(ENGINE_STATUS.BUSY_GENESIS);
            this.info(`--- 创世纪流程启动 (ECI模型 V3.1) ---`);
            this.logger.group(`BRIDGE-PROBE [GENESIS-FLOW-ECI]`);
    
            // 初始化中止控制器
            this._transitionStopRequested = false;
            this._activeTransitionToast = null;
            this.currentTaskAbortController = new AbortController();
    
            const loadingToast = this.toastr.info(
                "正在初始化...", "创世纪...",
                { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
            );
            this._activeTransitionToast = loadingToast;
    
            try {
                const context = this.deps.applicationFunctionManager.getContext();
                const activeCharId = context?.characterId;
                if (!activeCharId) throw new Error("无法获取 activeCharId，创世纪中止。");
                const isDbAdapterEnabled = DatabaseAdapter.isEnabled();
    
                // ========================= [修复逻辑：三级数据源探查] =========================
                // 【修复】优先级调整：静态数据库优先，确保用户在预编辑模式的修改能被使用
                // 优先级 1: 本地静态数据库缓存 (StaticDataManager) - 用户预编辑的最新数据
                // 优先级 2: 内存中的当前状态 (fallback)
                // 优先级 3: 实时AI分析 (IntelligenceAgent)
    
                let finalStaticMatrices = null;
                let sourceLabel = "未知";
    
                // 创建新的章节实例（或复用现有实例）
                if (!this.currentChapter || this.currentChapter.characterId !== activeCharId) {
                    this.currentChapter = new Chapter({ characterId: activeCharId });
                }

                if (!this.currentChapter.meta) {
                    this.currentChapter.meta = {};
                }
                this.currentChapter.meta.chapterNumber = 1;
    
                // --- 阶段一：优先检查静态数据库 (用户预编辑的最新数据) ---
                loadingToast.find('.toast-message').text("读取世界观设定...");
                const baselineDb = staticDataManager.loadStaticBaseline(activeCharId);
                const cachedDb = staticDataManager.loadStaticData(activeCharId);

                const resolveProtagonistName = (cached) => {
                    const chars = cached?.characters || {};
                    for (const [id, data] of Object.entries(chars)) {
                        if (data?.core?.isProtagonist || data?.isProtagonist) {
                            return data?.core?.name || data?.name || id;
                        }
                    }
                    return null;
                };

                const shouldEnforceNameMatch = (expectedNameValue, activeId) => {
                    const normalized = String(expectedNameValue || '').trim();
                    if (!normalized) return false;
                    if (/^\d+$/.test(normalized)) return false;
                    if (String(activeId) === normalized) return false;
                    return true;
                };

                const isValidStaticCacheForCharacter = (cached, expectedName, activeId) => {
                    if (!cached || typeof cached !== 'object') return false;
                    const charactersCount = Object.keys(cached.characters || {}).length;
                    if (charactersCount === 0) return false;
                    if (!shouldEnforceNameMatch(expectedName, activeId)) return true;
                    const protagonistName = resolveProtagonistName(cached);
                    if (!protagonistName) return false;
                    return protagonistName === expectedName;
                };

                const expectedName = context?.name2 || this.USER.getContext()?.name2 || window?.name2 || '';
                const baselineCount = Object.keys(baselineDb?.characters || {}).length;
                const cachedCount = Object.keys(cachedDb?.characters || {}).length;
                const baselineValid = isValidStaticCacheForCharacter(baselineDb, expectedName, activeCharId);
                const cachedValid = isValidStaticCacheForCharacter(cachedDb, expectedName, activeCharId);
                const memoryMatrices = this.currentChapter?.staticMatrices || null;
                const memoryCount = Object.keys(memoryMatrices?.characters || {}).length;
                const memoryProtagonist = resolveProtagonistName(memoryMatrices);
                const memoryValid = isValidStaticCacheForCharacter(memoryMatrices, expectedName, activeCharId);
                const memorySource = this.currentChapter?.__source || this.currentChapter?.uid || 'unknown';
                const isStaticPreview = this.currentChapter?.__source === 'static_cache'
                    || (typeof this.currentChapter?.uid === 'string' && (
                        this.currentChapter.uid.startsWith('static_cache_')
                        || this.currentChapter.uid === 'temp_cached_view'
                        || this.currentChapter.uid === 'sbt-empty-state'
                    ));
                let aiAttempted = false;
                let aiSucceeded = false;
                let worldInfoCount = null;
                this.info(`GENESIS: 静态库检查 activeCharId=${activeCharId}, baseline=${baselineCount}, cached=${cachedCount}, expectedName=${expectedName || 'unknown'}`);

                if (baselineDb && baselineCount > 0 && !baselineValid) {
                    this.warn("GENESIS: 基线缓存与当前角色不匹配，已忽略。", {
                        baselineProtagonist: resolveProtagonistName(baselineDb),
                        expectedName
                    });
                }
                if (cachedDb && cachedCount > 0 && !cachedValid) {
                    this.warn("GENESIS: 静态缓存与当前角色不匹配，已忽略。", {
                        cachedProtagonist: resolveProtagonistName(cachedDb),
                        expectedName
                    });
                }
                if (memoryMatrices && memoryCount > 0 && !memoryValid) {
                    this.warn("GENESIS: 内存缓存与当前角色不匹配，已忽略。", {
                        memoryProtagonist,
                        expectedName,
                        memorySource,
                        isStaticPreview
                    });
                }

                if (baselineDb && baselineValid) {
                    this.info("GENESIS: Loaded static baseline (highest priority).");
                    finalStaticMatrices = baselineDb;
                    sourceLabel = "static baseline";
                }
                else if (cachedDb && cachedValid) {
                    this.info("GENESIS: 已从静态数据库加载最新数据（优先级最高）。");
                    finalStaticMatrices = cachedDb;
                    sourceLabel = "静态数据库";
                }
                // --- 阶段二：降级检查内存 (如果静态数据库为空) ---
                else if (memoryMatrices && memoryCount > 0 && memoryValid) {
    
                    this.info("GENESIS: 静态数据库为空，使用内存中的数据作为fallback。");
                    finalStaticMatrices = memoryMatrices;
                    sourceLabel = "内存fallback";
                }
                // --- 阶段三：降级执行AI分析 (实时生成) ---
                else if (isDbAdapterEnabled) {
                    this.info("GENESIS: 数据库适配模式已启用，跳过情报官世界书分析。");
                    finalStaticMatrices = this.currentChapter.staticMatrices;
                    sourceLabel = "DB模式-空矩阵";
                }
                else {
                    this.info("GENESIS: 未找到有效缓存，正在实时分析世界书...");
                    loadingToast.find('.toast-message').html(`
                        正在分析世界观与角色设定...<br>
                        <div class="sbt-compact-toast-actions">
                            <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止创世纪">
                                <i class="fa-solid fa-octagon-exclamation"></i> 停止
                            </button>
                        </div>
                    `);
                    this._bindStopButton('创世纪-智能分析阶段');

                    // V8.0: 获取完整的用户/主角信息
                    aiAttempted = true;
                    const userContext = this.USER.getContext();
                    const userName = window.name1 || userContext?.name1 || '未知';
                    const personaDescription = userContext?.powerUserSettings?.persona_description || '';
                    const persona = window.personas?.[window.main_persona];

                    // 整合主角信息
                    const protagonistInfo = {
                        name: userName,
                        description: personaDescription,
                        personaContent: persona?.content || '',
                    };

                    this.info(`GENESIS: 主角信息 - 名字: ${userName}`);

                    // V8.0: 使用创世纪资料源管理器获取世界书条目（支持手动精选模式）
                    const { getWorldbookEntriesForGenesis } = await import('../../genesis-worldbook/worldbookManager.js');
                    const worldInfoEntries = await getWorldbookEntriesForGenesis();
                    worldInfoCount = Array.isArray(worldInfoEntries) ? worldInfoEntries.length : 0;
                    this.info(`GENESIS: 已获取 ${worldInfoCount} 个世界书条目用于分析`);

                    const dossierSchema = stateManager.loadDossierSchemaFromCharacter();
                    const agentOutput = await this.intelligenceAgent.execute({
                        worldInfoEntries,
                        protagonistInfo,
                        dossierSchema
                    }, this.currentTaskAbortController.signal);
    
                    if (agentOutput && agentOutput.staticMatrices) {
                        this.info("GENESIS: AI分析成功，生成了新的数据。");
                        finalStaticMatrices = agentOutput.staticMatrices;
                        sourceLabel = "AI实时分析";
                        aiSucceeded = true;
    
                        // 顺手存入缓存
                        staticDataManager.saveStaticData(activeCharId, finalStaticMatrices);
                        staticDataManager.ensureStaticBaseline(activeCharId, finalStaticMatrices);
                        this.info("GENESIS: Baseline ensured from AI analysis output.");
                    } else {
                        throw new Error("IntelligenceAgent未能返回有效数据，且无可用缓存或内存状态。");
                    }
                }
    
                // --- 统一注入点 ---
                // 使用 deepmerge 确保数据完整性 (如果是新建的 Chapter，staticMatrices 是空的，合并后即为 full data；如果是复用的，合并自身无副作用)
                if (finalStaticMatrices) {
                    this.currentChapter.staticMatrices = deepmerge(this.currentChapter.staticMatrices, finalStaticMatrices);
                    this.engine.narrativeControlTowerManager.normalizeStorylineStaticData(this.currentChapter);
                    this.info(`GENESIS: 数据注入完成。数据来源: [${sourceLabel}]`);
                } else {
                    this.diagnose('GENESIS: 未能构建静态矩阵，诊断信息如下：', {
                        activeCharId,
                        expectedName,
                        baselineCount,
                        cachedCount,
                        baselineValid,
                        cachedValid,
                        memoryCount,
                        memoryValid,
                        memorySource,
                        isStaticPreview,
                        aiAttempted,
                        aiSucceeded,
                        worldInfoCount
                    });
                    throw new Error("严重错误：未能从任何来源获取到静态数据矩阵。");
                }
                // 4. 【验证日志】
                this.logger.groupCollapsed('[SBE-DIAGNOSE] Chapter state before planning:');
                sbtConsole.dir(JSON.parse(JSON.stringify(this.currentChapter)));
                this.logger.groupEnd();
    
                // 5. 获取玩家导演焦点
                this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                // ... (后续流程与之前版本一致)
                loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
                const popupResult = await this.deps.showNarrativeFocusPopup('');
                let initialChapterFocus = "由AI自主创新。";
                let isFreeRoamMode = false;
    
                if (popupResult.freeRoam) {
                    // 自由章模式：跳过建筑师和回合执导
                    isFreeRoamMode = true;
                    initialChapterFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
                    this.info("🎲 [自由章模式] 已激活：本章将跳过建筑师规划和回合执导，世界观档案将全部发送到前台");
                } else if (popupResult.abc) {
                    // ABC沉浸流模式：添加[IMMERSION_MODE]标记
                    const userInput = popupResult.value || "";
                    initialChapterFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
                } else if (popupResult.confirmed && popupResult.value) {
                    initialChapterFocus = popupResult.value;
                }
    
                this.currentChapter.playerNarrativeFocus = initialChapterFocus;
                this.currentChapter.meta.freeRoamMode = isFreeRoamMode;
                this.info(`GENESIS: 玩家设定的开篇小章焦点为: "${initialChapterFocus}"`);
    
                if (isFreeRoamMode) {
                    // 自由章模式：跳过建筑师规划
                    this.info("🎲 跳过建筑师规划，直接进入自由章模式");
                    this.currentChapter.chapter_blueprint = {
                        title: "自由探索",
                        emotional_arc: "自由发挥",
                        plot_beats: []
                    };
                } else {
                    // 6. 规划开篇剧本
                    this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
                    loadingToast.find('.toast-message').html(`
                        建筑师正在构思开篇剧本...<br>
                        <div class="sbt-compact-toast-actions">
                            <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止创世纪">
                                <i class="fa-solid fa-octagon-exclamation"></i> 停止
                            </button>
                        </div>
                    `);
                    this._bindStopButton('创世纪-建筑师阶段');
                    const architectResult = await this._planNextChapter(true, this.currentChapter, firstMessageContent, this.currentTaskAbortController.signal);
                    if (architectResult && architectResult.new_chapter_script) {
                        // 处理 ★ 星标节拍
                        ChapterAnalyzer.processStarMarkedBeats(architectResult.new_chapter_script, this.info);
    
                        this.currentChapter.chapter_blueprint = architectResult.new_chapter_script;
                        this.currentChapter.activeChapterDesignNotes = architectResult.design_notes;
    
                        // V3.0: 生成并缓存章节级静态上下文
                        const chapterContextIds = architectResult.new_chapter_script.chapter_context_ids || [];
                        this.logger.group('[ENGINE-V3-DEBUG] GENESIS - 章节上下文缓存');
                        this.logger.log('建筑师返回的 chapter_context_ids:', chapterContextIds);
                        this.currentChapter.cachedChapterStaticContext = this.engine.entityContextManager.generateChapterStaticContext(chapterContextIds);
                        this.logger.log('缓存后 cachedChapterStaticContext 长度:', this.currentChapter.cachedChapterStaticContext?.length || 0);
                        this.logger.groupEnd();
                        this.info(`GENESIS: 建筑师成功生成开篇创作蓝图及设计笔记。章节级静态上下文已缓存（${chapterContextIds.length}个实体）。`);
                        this.isGenesisStatePendingCommit = true;
                        const chatPieces = this.USER.getContext()?.chat || [];
                        const firstAssistantIndex = chatPieces.findIndex(piece => piece && !piece.is_user);
                        if (firstAssistantIndex !== -1) {
                            this.info(`GENESIS: 已找到可锚定的AI消息 (索引: ${firstAssistantIndex})，立即写入leader。`);
                            await this.onCommitState(firstAssistantIndex);
                        } else {
                            this.info('GENESIS: 暂未找到可锚定的AI消息，将等待下一次 onCommitState 触发。');
                        }
                    } else {
                        throw new Error("建筑师未能生成有效的开篇创作蓝图。");
                    }
                }
    
            } catch (error) {
                if (error.name === 'AbortError' || error.code === 'SBT_TRANSITION_STOP') {
                    this.warn('创世纪流程被强制中止。');
                    this._cleanupAfterTransitionStop();
                    this.toastr.info("创世纪已由用户成功中止。", "操作已取消");
                } else {
                    this.diagnose("创世纪流程中发生严重错误:", error);
                    this.toastr.error(`创世纪失败: ${error.message}`, "引擎严重错误");
                }
                this.currentChapter = null;
            } finally {
                this._setStatus(ENGINE_STATUS.IDLE);
                this.currentTaskAbortController = null;
                this.logger.groupEnd();
                if (loadingToast) this.toastr.clear(loadingToast);
            }
        }

    // ========== _planNextChapter ==========
    /**
     * 规划下一章节
     * @param {boolean} isGenesis - 是否为创世纪模式
     * @param {Chapter} chapterForPlanning - 用于规划的章节
     * @param {string} firstMessageContent - 首条消息内容
     * @param {AbortSignal} abortSignal - 中止信号
     * @returns {Promise<Object|null>} 建筑师返回的结果
     */
    async _planNextChapter(isGenesis = false, chapterForPlanning = null, firstMessageContent = null, abortSignal = null) {
        this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
        const action = isGenesis ? "开篇章节" : "下一章节";
        this.info(`--- 启动“章节建筑师”规划${action}...`);

        const chapterContext = chapterForPlanning || this.currentChapter;
        const { piece: lastLeaderPiece } = this.USER.findLastMessageWithLeader();
        const leaderMessageContent = lastLeaderPiece?.mes || null;
        const isDbAdapterEnabled = DatabaseAdapter.isEnabled();
        const externalDbContexts = isDbAdapterEnabled
            ? await DatabaseAdapter.buildExternalContexts({ recentLimit: 6 })
            : null;
        const contextForArchitect = {
            system_confidence: isGenesis ? 0.1 : 0.5,
            player_profile: { description: "暂无画像。" },
            chapter: chapterContext,
            firstMessageContent: firstMessageContent,
            leaderMessageContent: leaderMessageContent,
            ...(externalDbContexts || {})
        };
    
        this.logger.group(`BRIDGE-PROBE [PLAN-CHAPTER]`);
        this.diagnose(`PLAN-1: 正在调用 ArchitectAgent (${isGenesis ? '创世纪模式' : '常规模式'})...`);
        this.logger.groupCollapsed("传递给 ArchitectAgent 的完整 'context' 对象:");
        sbtConsole.dir(JSON.parse(JSON.stringify(contextForArchitect)));
        this.logger.groupEnd();
    
        try {
            const architectResult = await this.architectAgent.execute(contextForArchitect, abortSignal);
            if (architectResult && architectResult.new_chapter_script && architectResult.design_notes) {
                this.info("PLAN-2-SUCCESS: ArchitectAgent 成功生成新剧本及其设计笔记。");
                return architectResult;
            } else {
                this.warn("PLAN-2-FAIL: ArchitectAgent 未能返回有效的剧本和设计笔记。");
                this.diagnose("ArchitectAgent 返回了无效或不完整的结构:", architectResult);
                return null;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error; // 向上抛出中止错误
            }
            this.diagnose(`章节建筑师在规划时失败:`, error);
            return null;
        } finally {
            this.logger.groupEnd();
        }
    }
}
