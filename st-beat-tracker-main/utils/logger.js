/**
 * logger.js
 * 统一的日志工具 - 自动适配前端控制台
 *
 * 使用规则：
 * - logger.info()  -> 重要系统信息，显示在前端控制台
 * - logger.warn()  -> 警告信息，显示在前端控制台
 * - logger.error() -> 错误信息，显示在前端控制台
 * - logger.debug() -> 调试信息，仅在 F12 控制台显示
 */

export const isDebugModeEnabled = () => {
    try {
        return localStorage.getItem('sbt-debug-mode') === 'true';
    } catch (error) {
        return false;
    }
};

export class Logger {
    constructor(prefix = '') {
        this.prefix = prefix;
        this.isDebugMode = () => isDebugModeEnabled();
    }

    /**
     * 格式化消息
     */
    formatMessage(message, ...args) {
        const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
        return [prefixStr + message, ...args];
    }

    /**
     * 重要信息 - 显示在前端控制台
     * 用于：启动消息、初始化完成、重要状态变化
     */
    info(message, ...args) {
        if (this.isDebugMode()) {
            console.info(...this.formatMessage(message, ...args));
        }
    }

    /**
     * 警告信息 - 显示在前端控制台
     * 用于：配置缺失、使用默认值、非致命错误
     */
    warn(message, ...args) {
        if (this.isDebugMode()) {
            console.warn(...this.formatMessage(message, ...args));
        }
    }

    /**
     * 错误信息 - 显示在前端控制台
     * 用于：API失败、异常捕获、致命错误
     */
    error(message, ...args) {
        if (this.isDebugMode()) {
            console.error(...this.formatMessage(message, ...args));
        }
    }

    /**
     * 调试信息 - 仅在调试模式下显示在 F12 控制台
     * 用于：内部状态、循环日志、详细的执行流程
     */
    debug(message, ...args) {
        if (this.isDebugMode()) {
            console.log(...this.formatMessage(message, ...args));
        }
    }

    /**
     * 创建子 Logger（带自定义前缀）
     */
    child(subPrefix) {
        const fullPrefix = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix;
        return new Logger(fullPrefix);
    }
}

// 导出默认实例
export const logger = new Logger('SBT');

// 导出便捷方法
export const createLogger = (prefix) => new Logger(prefix);
