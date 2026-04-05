/**
 * DebugLogger - 调试日志管理器
 *
 * 提供统一的调试日志输出接口，根据 localStorage 'sbt-debug-mode' 控制输出
 *
 * @file src/utils/DebugLogger.js
 * @module DebugLogger
 * @author Claude (重构自 StoryBeatEngine.js)
 * @date 2025-12-07
 */

/**
 * 调试日志管理器类
 *
 * @class DebugLogger
 * @example
 * const logger = new DebugLogger('MyModule');
 * logger.log('This is a debug message');
 * logger.group('Group title');
 * logger.log('Nested message');
 * logger.groupEnd();
 */
import { isDebugModeEnabled } from '../../utils/logger.js';

export class DebugLogger {
    /**
     * 创建调试日志管理器实例
     *
     * @param {string} namespace - 命名空间，用于标识日志来源（可选）
     */
    constructor(namespace = 'SBT') {
        this.namespace = namespace;
    }

    /**
     * 检查调试模式是否启用
     *
     * @private
     * @returns {boolean} 如果 localStorage 'sbt-debug-mode' 为 'true' 则返回 true
     */
    isEnabled() {
        return isDebugModeEnabled();
    }

    /**
     * 输出调试日志
     *
     * @param {...any} args - 要输出的参数
     */
    log(...args) {
        if (this.isEnabled()) {
            console.log(`[${this.namespace}]`, ...args);
        }
    }

    /**
     * 创建日志分组
     *
     * @param {...any} args - 分组标题
     */
    group(...args) {
        if (this.isEnabled()) {
            console.group(...args);
        }
    }

    /**
     * 创建折叠的日志分组
     *
     * @param {...any} args - 分组标题
     */
    groupCollapsed(...args) {
        if (this.isEnabled()) {
            console.groupCollapsed(...args);
        }
    }

    /**
     * 结束当前日志分组
     */
    groupEnd() {
        if (this.isEnabled()) {
            console.groupEnd();
        }
    }

    /**
     * 输出警告日志
     *
     * @param {...any} args - 要输出的警告信息
     */
    warn(...args) {
        if (this.isEnabled()) {
            console.warn(`[${this.namespace}]`, ...args);
        }
    }
}
