/**
 * 清理处理器
 * 负责数据清理、错误恢复、停止检查等逻辑
 * 
 * @module CleanupHandler
 */

import { DebugLogger } from '../utils/DebugLogger.js';

/**
 * 清理处理器类
 */
export class CleanupHandler {
    /**
     * 构造函数
     * @param {StoryBeatEngine} engine - 主引擎实例引用
     * @param {Object} dependencies - 依赖注入对象
     */
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('CleanupHandler');
        
        // 引用常用的依赖
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
    }

    // ========== 辅助属性访问器 ==========
    
    /** 获取 USER 实例 */
    get USER() { return this.engine.USER; }
    
    /** 获取 LEADER 实例 */
    get LEADER() { return this.engine.LEADER; }
    
    /** 获取转换停止请求标志 */
    get _transitionStopRequested() { return this.engine._transitionStopRequested; }
    set _transitionStopRequested(value) { this.engine._transitionStopRequested = value; }
    
    /** 获取当前任务中止控制器 */
    get currentTaskAbortController() { return this.engine.currentTaskAbortController; }
    
    // ========== 核心方法 ==========


    // ========== abortCurrentTask ==========
    /**
     * 中止当前任务
     * 触发AbortController中止所有正在进行的AI请求
     */
        abortCurrentTask() {
            this.warn('收到外部强制中止指令！');
            this._transitionStopRequested = true;
            if (this.currentTaskAbortController) {
                this.currentTaskAbortController.abort();
                this.info('AbortController 已触发中止。');
            }
        }

    // ========== _throwIfStopRequested ==========
    /**
     * 检查是否请求停止，如果是则抛出错误
     * @param {string} stageLabel - 阶段标签
     * @throws {Error} 如果已请求停止
     */
        _throwIfStopRequested(stageLabel = '') {
            if (this._transitionStopRequested) {
                const error = new Error(`用户在${stageLabel || '未知'}阶段终止了章节转换`);
                error.code = 'SBT_TRANSITION_STOP';
                throw error;
            }
        }

    // ========== _cleanupAfterTransitionStop ==========
    /**
     * 转换停止后的清理工作
     * 清除临时状态和待定转换数据
     */
        _cleanupAfterTransitionStop() {
            this.LEADER.pendingTransition = null;
            this.LEADER.earlyPlayerInput = null;
            this.USER.saveChat?.();
        }

    // ========== _cleanPollutedLeadersInChat ==========
    /**
     * 清理chat消息中的污染leader数据
     * @returns {Object} 清理报告 { cleanedCount, pollutedMessages }
     */
        _cleanPollutedLeadersInChat() {
            const chat = this.USER.getContext()?.chat;
            if (!chat || !Array.isArray(chat)) {
                this.diagnose('[清理器] Chat未加载或为空');
                return { cleanedCount: 0, pollutedMessages: [] };
            }
    
            let cleanedCount = 0;
            const pollutedMessages = [];
    
            this.diagnose(`[清理器] 开始扫描 ${chat.length} 条消息中的leader数据`);
    
            for (let i = 0; i < chat.length; i++) {
                const message = chat[i];
                if (!message || !message.leader) continue;
    
                const leader = message.leader;
                const uid = leader.uid || 'unknown';
                const removedFields = [];
    
                // 判断这是真实章节还是静态缓存
                const isRealChapter = uid.startsWith('chapter_') || uid.match(/^[a-zA-Z0-9_-]+$/);
                const isStaticCache = uid.startsWith('static_cache_');
    
                this.diagnose(`[清理器] 检查消息 #${i}: uid=${uid}, isRealChapter=${isRealChapter}, isStaticCache=${isStaticCache}`);
    
                // 🔧 情况1: 真实章节被污染了静态缓存标记
                if (isRealChapter && !isStaticCache) {
                    // 真实章节不应该有 __source: "static_cache"
                    // 但 cachedChapterStaticContext 和 lastUpdated 是合法字段，不应删除
                    if (leader.__source === 'static_cache') {
                        delete leader.__source;
                        removedFields.push('__source');
                        this.diagnose(`[清理器] 移除真实章节的 __source 污染标记`);
                    }
                }
    
                // 🔧 情况2: 静态缓存leader包含不应有的字段
                if (isStaticCache) {
                    // 静态缓存不应该有这些运行时字段（它们属于真实章节）
                    const STATIC_CACHE_FORBIDDEN_FIELDS = [
                        'chapter_blueprint',
                        'activeChapterDesignNotes',
                        'cachedChapterStaticContext',
                        'lastUpdated'
                    ];
    
                    for (const field of STATIC_CACHE_FORBIDDEN_FIELDS) {
                        if (leader.hasOwnProperty(field)) {
                            delete leader[field];
                            removedFields.push(field);
                            this.diagnose(`[清理器] 移除静态缓存的运行时字段: ${field}`);
                        }
                    }
                }
    
                if (removedFields.length > 0) {
                    cleanedCount++;
                    pollutedMessages.push({
                        messageIndex: i,
                        uid: uid,
                        removedFields: removedFields
                    });
    
                    this.info(`[清理器] 清理消息 #${i} (uid: ${uid})，移除字段: ${removedFields.join(', ')}`);
                }
            }
    
            // 如果有清理，保存chat
            if (cleanedCount > 0) {
                this.info(`[清理器] 共清理了 ${cleanedCount} 条消息，正在保存...`);
                this.USER.saveChat?.();
            } else {
                this.diagnose('[清理器] 未发现需要清理的数据');
            }
    
            return {
                cleanedCount,
                pollutedMessages
            };
        }
}
