/**
 * ServiceFactory - 服务工厂
 *
 * 负责创建和配置LLM服务实例
 *
 * @file src/services/ServiceFactory.js
 * @module ServiceFactory
 * @author Claude (重构自 StoryBeatEngine.js)
 * @date 2025-12-07
 */

import { LLMApiService } from '../../LLMApiService.js';

/**
 * 服务工厂类
 *
 * @class ServiceFactory
 * @example
 * const apiSettings = stateManager.getApiSettings();
 * const { mainLlmService, conductorLlmService } = ServiceFactory.createServices(
 *   apiSettings,
 *   { USER, EDITOR, LEADER }
 * );
 */
export class ServiceFactory {
    /**
     * 创建主服务和回合裁判服务
     *
     * @static
     * @param {Object} apiSettings - API配置对象
     * @param {Object} apiSettings.main - 主服务配置
     * @param {string} apiSettings.main.apiProvider - API提供商
     * @param {string} apiSettings.main.apiUrl - API URL
     * @param {string} apiSettings.main.apiKey - API密钥
     * @param {string} apiSettings.main.modelName - 模型名称
     * @param {string} apiSettings.main.tavernProfile - Tavern预设ID
     * @param {Object} apiSettings.conductor - 回合裁判服务配置
     * @param {Object} adapters - 引擎适配器
     * @param {Object} adapters.USER - 用户适配器
     * @param {Object} adapters.EDITOR - 编辑器适配器
     * @param {Object} adapters.LEADER - 领袖适配器（可选）
     * @param {Function} infoLogger - 信息日志函数（可选）
     * @returns {{mainLlmService: LLMApiService, conductorLlmService: LLMApiService}} 服务实例
     *
     * @example
     * const services = ServiceFactory.createServices(
     *   {
     *     main: { apiProvider: 'openai', apiUrl: '...', apiKey: '...', modelName: 'gpt-4' },
     *     conductor: { apiProvider: 'openai', apiUrl: '...', apiKey: '...', modelName: 'gpt-3.5' }
     *   },
     *   { USER, EDITOR },
     *   console.log
     * );
     */
    static createServices(apiSettings, adapters, infoLogger = null) {
        // 实例化主服务
        const mainLlmService = new LLMApiService({
            api_provider: apiSettings.main.apiProvider || 'direct_openai',
            api_url: apiSettings.main.apiUrl,
            api_key: apiSettings.main.apiKey,
            model_name: apiSettings.main.modelName,
            tavernProfile: apiSettings.main.tavernProfile || '',
        }, { EDITOR: adapters.EDITOR, USER: adapters.USER });

        if (infoLogger) {
            infoLogger(`核心大脑 LLM 服务已实例化 [模式: ${apiSettings.main.apiProvider || 'direct_openai'}]`);
        }

        // 实例化回合裁判服务
        const conductorLlmService = new LLMApiService({
            api_provider: apiSettings.conductor.apiProvider || 'direct_openai',
            api_url: apiSettings.conductor.apiUrl,
            api_key: apiSettings.conductor.apiKey,
            model_name: apiSettings.conductor.modelName,
            tavernProfile: apiSettings.conductor.tavernProfile || '',
        }, { EDITOR: adapters.EDITOR, USER: adapters.USER });

        if (infoLogger) {
            infoLogger(`回合裁判 LLM 服务已实例化 [模式: ${apiSettings.conductor.apiProvider || 'direct_openai'}]`);
        }

        return {
            mainLlmService,
            conductorLlmService
        };
    }
}
