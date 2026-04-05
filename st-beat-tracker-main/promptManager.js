// FILE: promptManager.js
// 提示词管理模块 - 管理建筑师和回合执导的可配置提示词

import { BACKEND_SAFE_PASS_PROMPT } from './ai/prompt_templates.js';

/**
 * 提示词管理器
 * 负责存储、加载、导入导出提示词配置
 */
export class PromptManager {
    constructor() {
        this.STORAGE_KEY_ARCHITECT = 'sbt-architect-prompt-custom';
        this.STORAGE_KEY_CONDUCTOR = 'sbt-conductor-prompt-custom';

        // 默认提示词获取器（回调函数）
        this.defaultArchitectPromptGetter = null;
        this.defaultConductorPromptGetter = null;
    }

    /**
     * 设置默认提示词获取器
     * @param {Function} getter - 返回默认提示词的函数
     */
    setDefaultArchitectPromptGetter(getter) {
        this.defaultArchitectPromptGetter = getter;
    }

    /**
     * 设置默认提示词获取器
     * @param {Function} getter - 返回默认提示词的函数
     */
    setDefaultConductorPromptGetter(getter) {
        this.defaultConductorPromptGetter = getter;
    }

    /**
     * 获取建筑师提示词(优先返回自定义,否则返回默认)
     * @returns {string} 提示词内容
     */
    getArchitectPrompt() {
        const custom = localStorage.getItem(this.STORAGE_KEY_ARCHITECT);
        if (custom) return custom;
        if (this.defaultArchitectPromptGetter) {
            return this.defaultArchitectPromptGetter();
        }
        return '';
    }

    /**
     * 获取回合执导提示词(优先返回自定义,否则返回默认)
     * @returns {string} 提示词内容
     */
    getConductorPrompt() {
        const custom = localStorage.getItem(this.STORAGE_KEY_CONDUCTOR);
        if (custom) return custom;
        if (this.defaultConductorPromptGetter) {
            return this.defaultConductorPromptGetter();
        }
        return '';
    }

    /**
     * 保存自定义建筑师提示词
     * @param {string} prompt - 提示词内容
     */
    saveArchitectPrompt(prompt) {
        if (!prompt || prompt.trim() === '') {
            localStorage.removeItem(this.STORAGE_KEY_ARCHITECT);
            return;
        }
        localStorage.setItem(this.STORAGE_KEY_ARCHITECT, prompt);
    }

    /**
     * 保存自定义回合执导提示词
     * @param {string} prompt - 提示词内容
     */
    saveConductorPrompt(prompt) {
        if (!prompt || prompt.trim() === '') {
            localStorage.removeItem(this.STORAGE_KEY_CONDUCTOR);
            return;
        }
        localStorage.setItem(this.STORAGE_KEY_CONDUCTOR, prompt);
    }

    /**
     * 重置建筑师提示词为默认值
     */
    resetArchitectPrompt() {
        localStorage.removeItem(this.STORAGE_KEY_ARCHITECT);
    }

    /**
     * 重置回合执导提示词为默认值
     */
    resetConductorPrompt() {
        localStorage.removeItem(this.STORAGE_KEY_CONDUCTOR);
    }

    /**
     * 导出建筑师提示词为文件
     */
    exportArchitectPrompt() {
        const prompt = this.getArchitectPrompt();
        this._downloadTextFile(prompt, 'architect-prompt.txt');
    }

    /**
     * 导出回合执导提示词为文件
     */
    exportConductorPrompt() {
        const prompt = this.getConductorPrompt();
        this._downloadTextFile(prompt, 'conductor-prompt.txt');
    }

    /**
     * 导入建筑师提示词
     * @returns {Promise<string>} 导入的提示词内容
     */
    async importArchitectPrompt() {
        const content = await this._uploadTextFile();
        if (content) {
            this.saveArchitectPrompt(content);
        }
        return content;
    }

    /**
     * 导入回合执导提示词
     * @returns {Promise<string>} 导入的提示词内容
     */
    async importConductorPrompt() {
        const content = await this._uploadTextFile();
        if (content) {
            this.saveConductorPrompt(content);
        }
        return content;
    }

    /**
     * 检查是否有自定义的建筑师提示词
     * @returns {boolean}
     */
    hasCustomArchitectPrompt() {
        return !!localStorage.getItem(this.STORAGE_KEY_ARCHITECT);
    }

    /**
     * 检查是否有自定义的回合执导提示词
     * @returns {boolean}
     */
    hasCustomConductorPrompt() {
        return !!localStorage.getItem(this.STORAGE_KEY_CONDUCTOR);
    }

    /**
     * 下载文本文件
     * @private
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名
     */
    _downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * 上传文本文件
     * @private
     * @returns {Promise<string>} 文件内容
     */
    _uploadTextFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.md';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    resolve(event.target.result);
                };
                reader.onerror = () => {
                    reject(new Error('文件读取失败'));
                };
                reader.readAsText(file, 'UTF-8');
            };

            input.click();
        });
    }
}

// 创建单例实例
export const promptManager = new PromptManager();
