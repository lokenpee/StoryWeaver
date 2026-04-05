// modelManager.js
// 模型列表管理模块 - 负责从不同API提供商获取可用模型列表

import { USER } from './src/engine-adapter.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('ModelManager');

/**
 * 主调度函数：根据API提供商类型获取模型列表
 * @param {string} apiProvider - API提供商类型 ('direct_openai', 'sillytavern_proxy_openai', 'sillytavern_preset')
 * @param {string} apiUrl - API URL（预设模式下可选）
 * @param {string} apiKey - API Key（预设模式下可选）
 * @param {string} tavernProfile - SillyTavern预设ID（仅预设模式需要）
 * @returns {Promise<Array<string>>} 模型名称数组
 */
export async function fetchModels(apiProvider, apiUrl = '', apiKey = '', tavernProfile = '') {
    logger.info(`正在获取模型列表... 提供商: ${apiProvider}`);

    try {
        let models = [];

        // 策略分发：根据API提供商选择不同的获取方式
        switch (apiProvider) {
            case 'sillytavern_preset':
                models = await fetchModelsFromPreset(tavernProfile);
                break;

            case 'sillytavern_proxy_openai':
                models = await fetchModelsViaProxy(apiUrl, apiKey);
                break;

            case 'direct_openai':
            default:
                models = await fetchModelsDirect(apiUrl, apiKey);
                break;
        }

        logger.info(`成功获取 ${models.length} 个模型`);
        return models;

    } catch (error) {
        logger.error('获取模型列表失败:', error);
        throw new Error(`获取模型列表失败: ${error.message}`);
    }
}

/**
 * 策略一：从 SillyTavern 预设获取模型列表
 * 注意：预设模式下，模型列表由连接管理器提供
 */
async function fetchModelsFromPreset(profileId) {
    logger.debug('[预设] 从 SillyTavern 预设获取模型列表');

    if (!profileId) {
        throw new Error('未选择 SillyTavern 预设');
    }

    const context = USER.getContext();
    const profile = context.extensionSettings?.connectionManager?.profiles?.find(p => p.id === profileId);

    if (!profile) {
        throw new Error(`未找到预设 ID: ${profileId}`);
    }

    // 从预设配置中提取模型信息
    // 注意：不同的API类型可能有不同的模型获取方式
    const apiType = profile.api;

    logger.debug(`[预设] 预设类型: ${apiType}`);

    // 尝试从预设中获取可用模型列表
    // 如果预设提供了模型列表，直接返回
    if (profile.models && Array.isArray(profile.models)) {
        return profile.models;
    }

    // 否则，根据API类型尝试获取
    if (apiType === 'openai' || apiType === 'openrouter' || apiType === 'custom') {
        // 对于OpenAI兼容的API，尝试通过预设的URL和Key获取
        const presetUrl = profile.endpoint || profile.url;
        const presetKey = profile.apiKey || profile.key;

        if (presetUrl && presetKey) {
            // 通过代理模式获取（更可靠）
            return await fetchModelsViaProxy(presetUrl, presetKey);
        }
    }

    // 如果无法自动获取，返回预设中配置的单个模型
    const configuredModel = profile.preset?.model || profile.model;
    if (configuredModel) {
        logger.warn('[预设] 无法获取模型列表，返回预设中配置的单个模型');
        return [configuredModel];
    }

    throw new Error('该预设未配置模型信息，无法获取模型列表');
}

/**
 * 策略二：通过 SillyTavern 代理获取模型列表
 * 注意：代理模式主要用于chat completions，获取模型列表时直接调用API
 * 因为模型列表通常是公开端点，不会有CORS问题
 */
async function fetchModelsViaProxy(apiUrl, apiKey) {
    logger.debug('[代理] 代理模式：尝试直接获取模型列表');

    // 代理模式下，获取模型列表仍然直接调用目标API
    // 因为SillyTavern后端没有专门的模型列表代理端点
    return await fetchModelsDirect(apiUrl, apiKey, true); // 传递标志表示来自代理模式
}

/**
 * 策略三：直接调用API获取模型列表
 * 注意：可能遇到CORS跨域问题
 * @param {string} apiUrl - API URL
 * @param {string} apiKey - API Key
 * @param {boolean} fromProxy - 是否来自代理模式调用
 */
async function fetchModelsDirect(apiUrl, apiKey, fromProxy = false) {
    const mode = fromProxy ? '[代理]' : '[直连]';
    logger.debug(`${mode} 直接调用API获取模型列表`);

    if (!apiUrl || !apiKey) {
        throw new Error('API URL 和 API Key 不能为空');
    }

    // 智能构造模型列表端点URL
    let modelsUrl = apiUrl.trim();

    // 如果URL是chat/completions端点，转换为models端点
    if (modelsUrl.includes('/chat/completions')) {
        modelsUrl = modelsUrl.replace('/chat/completions', '/models');
    } else if (modelsUrl.includes('/v1')) {
        // 如果包含/v1，确保是/v1/models
        modelsUrl = modelsUrl.replace(/\/v1.*$/, '/v1/models');
    } else {
        // 否则直接追加/models
        modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
    }

    logger.debug(`${mode} 请求URL:`, modelsUrl);

    let response;
    try {
        response = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (fetchError) {
        // 捕获网络错误（包括CORS错误）
        logger.error(`${mode} 网络请求失败:`, fetchError);

        const errorMsg = fetchError.message || fetchError.toString();

        // 判断是否是CORS错误
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('CORS')) {
            throw new Error('⚠️\n\n该API的模型列表端点不允许浏览器直接访问。\n\n手动输入您知道的模型名称\n3. 保存设置后即可正常使用');
        }

        throw new Error(`网络请求失败: ${errorMsg}`);
    }

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`${mode} API返回错误:`, response.status, errorText);

        // 针对常见错误提供友好提示
        if (response.status === 404) {
            throw new Error('⚠️ 端点未找到 (404)\n\n该API可能不支持列出模型。\n\n💡 解决方案：请手动输入模型名称。');
        } else if (response.status === 401) {
            throw new Error('❌ 认证失败 (401)\n\n请检查您的 API Key 是否正确。');
        }

        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    logger.debug(`${mode} API响应:`, data);

    // 提取模型列表（兼容多种响应格式）
    let models = [];

    if (Array.isArray(data)) {
        models = data.map(m => m.id || m.model || m);
    } else if (data.data && Array.isArray(data.data)) {
        models = data.data.map(m => m.id || m.model || m);
    } else if (data.models && Array.isArray(data.models)) {
        models = data.models.map(m => m.id || m.model || m);
    }

    // 过滤和清洗
    return models
        .filter(Boolean)
        .filter(m => typeof m === 'string')
        .filter(m => !m.toLowerCase().includes('embed'))
        .sort();
}

/**
 * 将模型列表缓存到 localStorage
 * @param {string} cacheKey - 缓存键名
 * @param {Array<string>} models - 模型列表
 */
export function cacheModels(cacheKey, models) {
    try {
        localStorage.setItem(cacheKey, JSON.stringify(models));
        logger.debug(`模型列表已缓存: ${cacheKey}`);
    } catch (error) {
        logger.warn('缓存模型列表失败:', error);
    }
}

/**
 * 从 localStorage 读取缓存的模型列表
 * @param {string} cacheKey - 缓存键名
 * @returns {Array<string>|null} 模型列表或null
 */
export function getCachedModels(cacheKey) {
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const models = JSON.parse(cached);
            logger.info(`从缓存读取到 ${models.length} 个模型`);
            return models;
        }
    } catch (error) {
        logger.warn('读取缓存失败:', error);
    }
    return null;
}

export default {
    fetchModels,
    cacheModels,
    getCachedModels
};
