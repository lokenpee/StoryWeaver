/**
 * ConsoleManager.js
 * 前端控制台管理器 - 拦截并显示控制台日志
 */

import { isDebugModeEnabled } from '../utils/logger.js';

export class ConsoleManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 500; // 最多保存500条日志
        this.maxMessageLength = 500; // 单条日志最大长度
        this.isInitialized = false;
        this.uiInitialized = false; // UI事件是否已绑定
        this.filterEnabled = true; // 是否启用过滤
        this.consoleEnabled = false; // 🔧 控制台总开关，默认关闭
        this.fatalOnly = true; // 🔧 前端控制台仅显示致命错误
        this.fatalPatterns = [
            /\bfatal\b/i,
            /\bcritical\b/i,
            /\bpanic\b/i,
            /致命/,
            /关键错误/,
            /严重错误/,
            /不可恢复/,
            /无法继续/,
            /崩溃/
        ];
        this.originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        // 日志过滤黑名单 - 这些日志不会显示在前端控制台
        this.blacklist = [
            // Prompt Template 内部日志
            /var __line = /,
            /var __output = /,
            /__filename = /,
            /function __append/,
            /\[Prompt Template\]/,

            // 世界书相关
            /\[WI\]/,
            /\[DEBUG\].*\[WI\]/,  // DEBUG 级别的世界书日志

            // 系统内部
            /skipWIAN/,
            /APP_READY/,
            /\[DEBUG\]/,  // 所有 DEBUG 级别日志

            // QR2 (Quick Reply)
            /\[QR2\]/,

            // 其他调试信息
            /initializeMenuSections/,
            /displayVersion/,
            /Generate entered/,
            /Core\/all messages/,
            /Google model changed/,
            /Window resize/,
        ];

        // 去重缓存 - 记录最近的日志，避免重复
        this.recentLogs = new Map(); // key: message hash, value: timestamp
        this.dedupeWindow = 1000; // 1秒内的重复日志会被过滤
    }

    /**
     * 初始化控制台拦截
     */
    init() {
        if (this.isInitialized) return;

        this.setupConsoleIntercept();
        this.setupUI();
        this.isInitialized = true;

        // 延迟添加启动日志，确保UI已经准备好
        setTimeout(() => {
            this.addLog('info', '前端控制台已启动');
        }, 100);
    }

    /**
     * 拦截原生console方法
     * 注意：仅拦截 error
     * 前端控制台只显示致命错误，避免被非致命信息淹没
     */
    setupConsoleIntercept() {
        const self = this;

        // 仅拦截 error，其他类型不进入前端控制台
        console.error = function(...args) {
            self.originalConsole.error.apply(console, args);
            self.addLog('error', ...args);
        };
    }

    /**
     * 添加日志
     */
    addLog(type, ...args) {
        // 仅允许 error 进入前端控制台
        if (type !== 'error') {
            return;
        }

        const timestamp = new Date();
        let message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                // 特殊处理 Error 对象
                if (arg instanceof Error) {
                    // 只显示错误消息，不显示冗长的堆栈追踪
                    // 完整堆栈信息仍然会在浏览器控制台（F12）中显示
                    return `❌ ${arg.message}`;
                }
                try {
                    const jsonStr = JSON.stringify(arg, null, 2);
                    // 如果JSON序列化结果是空对象或空数组，尝试提取更多信息
                    if (jsonStr === '{}' || jsonStr === '[]') {
                        // 尝试提取对象的所有属性（包括不可枚举的）
                        const keys = Object.getOwnPropertyNames(arg);
                        if (keys.length > 0) {
                            const obj = {};
                            keys.forEach(key => {
                                try {
                                    obj[key] = arg[key];
                                } catch (e) {
                                    obj[key] = '[无法访问]';
                                }
                            });
                            return JSON.stringify(obj, null, 2);
                        }
                    }
                    return jsonStr;
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        // 致命错误过滤：仅保留致命级别
        if (this.fatalOnly && !this.isFatalMessage(message, args)) {
            return;
        }

        // 过滤黑名单 - error 不过滤，且只在启用过滤时才应用
        if (this.filterEnabled && type !== 'error' && this.isBlacklisted(message)) {
            return;
        }

        // 去重检查
        const messageHash = this.hashMessage(message);
        const now = Date.now();
        if (this.recentLogs.has(messageHash)) {
            const lastTime = this.recentLogs.get(messageHash);
            if (now - lastTime < this.dedupeWindow) {
                return; // 重复日志，忽略
            }
        }
        this.recentLogs.set(messageHash, now);

        // 清理过期的去重缓存
        for (const [hash, time] of this.recentLogs.entries()) {
            if (now - time > this.dedupeWindow * 2) {
                this.recentLogs.delete(hash);
            }
        }

        // 截断过长的消息 - error类型使用稍大的长度限制（2倍）
        const maxLength = type === 'error' ? this.maxMessageLength * 2 : this.maxMessageLength;
        const originalLength = message.length;
        if (message.length > maxLength) {
            message = message.substring(0, maxLength) + `... (${originalLength - maxLength} 字符已省略)`;
        }

        const logEntry = {
            type,
            message,
            timestamp,
            time: this.formatTime(timestamp),
            truncated: originalLength > this.maxMessageLength
        };

        this.logs.push(logEntry);

        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // 更新UI
        this.appendLogToUI(logEntry);
    }

    /**
     * 判断是否为致命错误
     */
    isFatalMessage(message, args) {
        if (typeof message === 'string' && this.fatalPatterns.some(pattern => pattern.test(message))) {
            return true;
        }

        if (Array.isArray(args)) {
            for (const arg of args) {
                if (arg && typeof arg === 'object') {
                    if (arg.fatal === true || arg.isFatal === true) return true;
                    if (typeof arg.code === 'string' && /fatal|critical/i.test(arg.code)) return true;
                    if (typeof arg.name === 'string' && /fatal|critical/i.test(arg.name)) return true;
                }
            }
        }
        return false;
    }

    /**
     * 检查消息是否在黑名单中
     */
    isBlacklisted(message) {
        return this.blacklist.some(pattern => pattern.test(message));
    }

    /**
     * 生成消息哈希用于去重
     */
    hashMessage(message) {
        // 简单的字符串哈希
        let hash = 0;
        for (let i = 0; i < Math.min(message.length, 100); i++) {
            const char = message.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    /**
     * 格式化时间
     */
    formatTime(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }

    /**
     * 设置UI事件监听 - 使用事件委托
     */
    setupUI() {
        if (this.uiInitialized) return; // 防止重复绑定

        // 默认开启自动滚动
        this.autoScroll = true;

        // 使用事件委托，绑定到 document，这样即使元素还没加载也能工作
        document.addEventListener('click', (e) => {
            const target = e.target.closest('#sbt-console-clear-btn');
            if (target) {
                e.preventDefault();
                this.clearLogs();
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target.closest('#sbt-console-export-btn');
            if (target) {
                e.preventDefault();
                this.exportLogs();
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target.closest('.sbt-console-filter-btn');
            if (target) {
                e.preventDefault();
                const filter = target.dataset.filter;
                this.setFilter(filter);
            }
        });

        // 🔧 控制台总开关事件监听
        document.addEventListener('change', (e) => {
            if (e.target.id === 'sbt-console-enable-toggle') {
                this.consoleEnabled = e.target.checked;
                if (this.consoleEnabled) {
                    // 开启时，原始console方法中会调用 addLog，此时才会显示
                    if (isDebugModeEnabled()) {
                        this.originalConsole.info.call(console, 'Console enabled');
                    }
                } else {
                    this.clearLogs();
                }
            }
        });

        this.uiInitialized = true;
    }

    /**
     * 添加日志到UI
     */
    appendLogToUI(logEntry) {
        const container = document.getElementById('sbt-console-content');
        if (!container) return;

        const logEl = document.createElement('div');
        logEl.className = `sbt-console-log sbt-console-${logEntry.type}`;
        logEl.dataset.type = logEntry.type;

        const typeIcon = this.getTypeIcon(logEntry.type);
        const truncatedBadge = logEntry.truncated ? '<span class="sbt-console-truncated-badge" title="消息已截断">📝</span>' : '';

        logEl.innerHTML = `
            <span class="sbt-console-time">${logEntry.time}</span>
            <span class="sbt-console-type-icon">${typeIcon}</span>
            <span class="sbt-console-message">${this.escapeHtml(logEntry.message)}</span>
            ${truncatedBadge}
        `;

        container.appendChild(logEl);

        // 自动滚动到底部
        if (this.autoScroll) {
            container.scrollTop = container.scrollHeight;
        }

        // 应用当前过滤器
        if (this.currentFilter && this.currentFilter !== 'all') {
            if (logEntry.type !== this.currentFilter) {
                logEl.style.display = 'none';
            }
        }
    }

    /**
     * 获取日志类型图标
     */
    getTypeIcon(type) {
        const icons = {
            log: '<i class="fa-solid fa-circle-info"></i>',
            info: '<i class="fa-solid fa-info-circle"></i>',
            warn: '<i class="fa-solid fa-triangle-exclamation"></i>',
            error: '<i class="fa-solid fa-circle-exclamation"></i>',
            debug: '<i class="fa-solid fa-bug"></i>'
        };
        return icons[type] || icons.log;
    }

    /**
     * 转义HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 清空日志
     */
    clearLogs() {
        this.logs = [];
        const container = document.getElementById('sbt-console-content');
        if (container) {
            container.innerHTML = '';
        }
        this.addLog('info', '控制台已清空');
    }

    /**
     * 导出日志
     */
    exportLogs() {
        const logText = this.logs.map(log => {
            return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}`;
        }).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sbt-console-${new Date().toISOString().replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addLog('info', '日志已导出');
    }

    /**
     * 设置过滤器
     */
    setFilter(filter) {
        this.currentFilter = filter;

        // 更新按钮状态
        const filterBtns = document.querySelectorAll('.sbt-console-filter-btn');
        filterBtns.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 过滤日志显示
        const container = document.getElementById('sbt-console-content');
        if (!container) return;

        const logs = container.querySelectorAll('.sbt-console-log');
        logs.forEach(log => {
            if (filter === 'all') {
                log.style.display = '';
            } else {
                log.style.display = log.dataset.type === filter ? '' : 'none';
            }
        });
    }

    /**
     * 销毁控制台管理器
     */
    destroy() {
        if (!this.isInitialized) return;

        // 恢复原始console方法
        Object.keys(this.originalConsole).forEach(method => {
            console[method] = this.originalConsole[method];
        });

        this.isInitialized = false;
    }
}

// 导出单例
export const consoleManager = new ConsoleManager();
