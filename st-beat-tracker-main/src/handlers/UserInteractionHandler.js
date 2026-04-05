/**
 * 用户交互处理器
 * 负责处理用户交互逻辑，包括提前规划输入、停止按钮等
 * 
 * @module UserInteractionHandler
 */

import { ENGINE_STATUS } from '../constants.js';
import { DebugLogger } from '../utils/DebugLogger.js';

/**
 * 用户交互处理器类
 */
export class UserInteractionHandler {
    /**
     * 构造函数
     * @param {StoryBeatEngine} engine - 主引擎实例引用
     * @param {Object} dependencies - 依赖注入对象
     */
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('UserInteractionHandler');
        
        // 引用常用的依赖
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
        this.toastr = dependencies.toastr;
    }

    // ========== 辅助属性访问器 ==========
    
    /** 获取 LEADER 实例 */
    get LEADER() { return this.engine.LEADER; }
    
    /** 获取转换停止请求标志 */
    get _transitionStopRequested() { return this.engine._transitionStopRequested; }
    set _transitionStopRequested(value) { this.engine._transitionStopRequested = value; }
    
    /** 获取活动转换Toast */
    get _activeTransitionToast() { return this.engine._activeTransitionToast; }
    
    /** 获取当前任务中止控制器 */
    get currentTaskAbortController() { return this.engine.currentTaskAbortController; }
    
    // ========== 委托方法 ==========
    
    _setStatus(status) {
        return this.engine._setStatus(status);
    }
    
    // ========== 核心方法 ==========


    // ========== _captureEarlyFocusInput ==========
    /**
     * 捕获提前规划输入
     * @param {Chapter} workingChapter - 工作章节
     * @param {jQuery} $button - 按钮元素
     * @returns {Promise<Object|null>} 玩家输入结果
     */
        async _captureEarlyFocusInput(workingChapter, $button) {
            if (!$button || $button.length === 0) {
                return null;
            }

            if (this._transitionStopRequested) {
                this.info("章节转换已请求停止，忽略新的提前规划输入。");
                return null;
            }

            this.info("玩家点击了提前规划按钮");
            $button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

            this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
            let popupResult;

            try {
                popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
            } catch (error) {
                this.warn("[SBT] 提前规划弹窗异常，已回退到常规流程", error);
                $button.prop('disabled', false).html('<i class="fa-solid fa-pen-ruler"></i> 规划');
                this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
                throw error;
            }
    
            // 玩家取消：恢复按钮并设置默认焦点，避免史官结束后再次弹窗
            if (!popupResult.confirmed && !popupResult.freeRoam && !popupResult.abc) {
                $button.prop('disabled', false)
                    .html('<i class="fa-solid fa-pen-ruler"></i> 规划')
                    .css('background-color', '');
                this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
                this.info("玩家取消了提前输入，使用默认AI自主创新模式");
    
                // 即使取消，也设置默认值，避免史官结束后再次弹出焦点询问
                this.LEADER.earlyPlayerInput = {
                    focus: "由AI自主创新。",
                    freeRoam: false
                };
                return this.LEADER.earlyPlayerInput;
            }
    
            let earlyFocus = "由AI自主创新。";
            let earlyFreeRoam = false;
    
            if (popupResult.freeRoam) {
                earlyFreeRoam = true;
                earlyFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
            } else if (popupResult.abc) {
                const userInput = popupResult.value || "";
                earlyFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
            } else if (popupResult.confirmed && popupResult.value) {
                earlyFocus = popupResult.value;
            }
    
            this.LEADER.earlyPlayerInput = {
                focus: earlyFocus,
                freeRoam: earlyFreeRoam
            };
    
            this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
            $button.html('<i class="fa-solid fa-check"></i> 已记录')
                .css('background-color', '#4caf50');
            this.info(`玩家提前输入已记录: ${earlyFocus}`);
            return this.LEADER.earlyPlayerInput;
        }

    // ========== _bindStopButton ==========
    /**
     * 绑定停止按钮事件
     * @param {string} stageLabel - 阶段标签
     */
        _bindStopButton(stageLabel) {
            const $stopBtn = $('#sbt-stop-transition-btn');
            if ($stopBtn.length === 0) {
                return;
            }
            $stopBtn.off('click').on('click', () => {
                this._handleStopTransitionRequest(stageLabel, $stopBtn);
            });
        }

    // ========== _handleStopTransitionRequest ==========
    /**
     * 处理停止转换请求
     * @param {string} stageLabel - 阶段标签
     * @param {jQuery} $button - 按钮元素
     */
        _handleStopTransitionRequest(stageLabel = '未知阶段', $button = null) {
            if (this._transitionStopRequested) {
                this.info("章节转换停止指令已存在，忽略重复请求。");
                return;
            }
    
            this._transitionStopRequested = true;
            if ($button && $button.length > 0) {
                $button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 停止中');
            }
            $('.sbt-compact-focus-btn').prop('disabled', true);
    
            // V9.2: 升级为硬停止
            this.warn(`[SBT-Stop] 在${stageLabel}阶段收到停止指令，立即中止所有AI请求。`);
            this.engine.abortCurrentTask();
    
            if (this._activeTransitionToast) {
                const $message = this._activeTransitionToast.find('.toast-message');
                if ($message.length > 0 && $message.find('.sbt-stop-hint').length === 0) {
                    $message.append('<div class="sbt-stop-hint" style="color: #ffc107;">[!] 已发送强制中止指令...</div>');
                }
            }
        }
}
