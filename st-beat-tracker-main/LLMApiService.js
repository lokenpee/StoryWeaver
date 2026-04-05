import {EDITOR, USER} from './src/engine-adapter.js';
import { getRequestHeaders } from '/script.js';
import { createLogger } from './utils/logger.js';
import { sbtConsole } from './utils/sbtConsole.js';

const logger = createLogger('LLMApiService');
let ChatCompletionService = undefined;
try {
    // 动态导入，兼容模块不存在的情况
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    sbtConsole.warn("未检测到 /scripts/custom-request.js 或未正确导出 ChatCompletionService，将禁用代理相关功能。", e);
}
export class LLMApiService {
    constructor(config = {}, dependencies = {}) {
        this.config = {
            api_provider: config.api_provider || 'direct_openai', // 新增：API提供商策略
            api_url: config.api_url || "",
            api_key: config.api_key || "",
            model_name: config.model_name || "",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 63000,
            stream: config.stream || false,
            tavernProfile: config.tavernProfile || "" // 新增：SillyTavern 预设 ID
        };

        this.deps = dependencies;
        this.EDITOR = this.deps.EDITOR;
        this.USER = this.deps.USER;
    }
   /**
     *  动态更新API配置。
     * 这个新版本能够智能地将外部传入的驼峰命名（如 apiUrl）
     * 映射到内部使用的下划线命名（如 api_url），从而解决数据不匹配问题。
     * @param {object} newConfig - 新的配置项，例如 { apiUrl: "...", apiKey: "..." }
     */
    updateConfig(newConfig) {
        // API提供商策略
        if (newConfig.apiProvider !== undefined) this.config.api_provider = newConfig.apiProvider;
        if (newConfig.api_provider !== undefined) this.config.api_provider = newConfig.api_provider;

        if (newConfig.apiUrl !== undefined) this.config.api_url = newConfig.apiUrl;
        if (newConfig.api_url !== undefined) this.config.api_url = newConfig.api_url;

        if (newConfig.apiKey !== undefined) this.config.api_key = newConfig.apiKey;
        if (newConfig.api_key !== undefined) this.config.api_key = newConfig.api_key;

        if (newConfig.modelName !== undefined) this.config.model_name = newConfig.modelName;
        if (newConfig.model_name !== undefined) this.config.model_name = newConfig.model_name;

        if (newConfig.temperature !== undefined) this.config.temperature = newConfig.temperature;

        // 新增：SillyTavern 预设 ID
        if (newConfig.tavernProfile !== undefined) this.config.tavernProfile = newConfig.tavernProfile;

        sbtConsole.info("[LLMApiService] 配置已更新。提供商:", this.config.api_provider, "| 预设ID:", this.config.tavernProfile || "未设置");
    }
async testConnection() {
    // 如果是预设模式，检查预设ID而不是URL/Key
    if (this.config.api_provider === 'sillytavern_preset') {
        if (!this.config.tavernProfile) {
            throw new Error("未选择 SillyTavern 预设。请先在设置中选择一个预设。");
        }
    } else {
        if (!this.config.api_url || !this.config.api_key) {
            throw new Error("API URL 和 API Key 不能为空。请先在设置中填写。");
        }
    }

    sbtConsole.info(`[LLMApiService] 正在测试连接... (提供商: ${this.config.api_provider})`);

    const testMessages = [{ role: 'user', content: "Hello! Please reply with only one word: 'Success'." }];

    try {
        const responseText = await this.#executeApiCall(testMessages, null, null);

        if (responseText && responseText.toLowerCase().includes('success')) {
            return `连接成功！模型返回: "${responseText}"`;
        } else {
            throw new Error(`连接看似成功，但模型返回了非预期的内容: "${responseText || '空内容'}"`);
        }

    } catch (error) {
        sbtConsole.error("[LLMApiService] 连接测试失败", error);
        let detail = error.message || error.toString() || '未知错误';
        if (detail && typeof detail === 'string') {
            if (detail.includes('401')) {
                detail = '认证失败 (401)。请检查你的 API Key 是否正确。';
            } else if (detail.includes('404')) {
                detail = '未找到端点 (404)。请检查你的 API URL 是否正确，特别是对于非官方API，URL需要是完整的。';
            } else if (detail.includes('Failed to fetch')) {
                detail = '网络请求失败。请检查你的网络连接、代理设置，或确认API地址是否可以访问。';
            }
        }
        throw new Error(`连接测试失败: ${detail}`);
    }
}
    async callLLM(prompt, streamCallback = null, abortSignal = null) {
        if (!prompt) throw new Error("输入内容不能为空");

        // 根据提供商模式验证配置
        if (this.config.api_provider === 'sillytavern_preset') {
            if (!this.config.tavernProfile) {
                sbtConsole.error('[DEBUG-PROBE-3] SillyTavern 预设未配置:', JSON.stringify(this.config, null, 2));
                throw new Error("未选择 SillyTavern 预设，请在设置中选择。");
            }
        } else {
            if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
                sbtConsole.error('[DEBUG-PROBE-3] API 配置不完整:', JSON.stringify(this.config, null, 2));
                throw new Error("API配置不完整，请在设置中检查。");
            }
        }

        return await this.#callLLMWithRetry(prompt, streamCallback, abortSignal);
    }

    /**
     * @private
     *  包含自动重试逻辑的核心 LLM 调用方法。
     */
    async #callLLMWithRetry(prompt, streamCallback, abortSignal) {
        const MAX_RETRIES = 3;
        let lastError = null;
        let retryToast = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                // 将 abortSignal 传递给执行层
                const result = await this.#executeApiCall(prompt, streamCallback, abortSignal);
                
                if (retryToast) this.EDITOR.clear(retryToast);
                return result;
            } catch (error) {
                // 如果是中止错误，则不再重试，立即向上抛出
                if (error.name === 'AbortError') {
                    logger.info('API 调用被用户中止。');
                    throw error;
                }
                
                lastError = error;
                sbtConsole.warn(`[LLMApiService] 第 ${attempt} 次API调用失败:`, {
                    message: error?.message || String(error),
                    name: error?.name,
                    stack: error?.stack?.split('\n')?.[0]
                });

                 if (retryToast) this.EDITOR.clear(retryToast);

                if (attempt < MAX_RETRIES && this.#isRetryableError(error)) {
                    const delay = attempt * 1000;

                    retryToast = this.EDITOR.warning(
                        `将在 ${delay / 1000} 秒后进行第 ${attempt + 1} 次尝试...<br><small>原因: ${error.message}</small>`,
                        "API连接不稳定，正在自动重试",
                        {
                            timeOut: delay,
                            extendedTimeOut: delay,
                            closeButton: true,
                            escapeHtml: false
                        }
                         );
                    await new Promise(resolve => setTimeout(resolve, delay));

                } else {
                    break;
                }
            }
        }

        this.EDITOR.error(
            `已尝试 ${MAX_RETRIES} 次，但仍无法连接。<br><small>最终错误: ${lastError.message}</small>`,
            "API 调用彻底失败",
            { timeOut: 10000 }
        );
        throw lastError;
    }

    /**
     * @private
     * [新] 判断一个错误是否值得重试。
     */
    #isRetryableError(error) {
        const errorMessage = (error.message || error.toString() || '').toLowerCase();
        // 4xx 错误通常是客户端问题，不应重试
        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('404')) {
            return false;
        }
        // 503 Service Unavailable 可能是临时性服务器问题，可以重试
        // 但如果是底层服务不可用（如后端 API 未启动），重试也无意义
        // 我们仍然允许重试，但会快速失败
        return true;
    }

    /**
     * @private
     * 策略分发器：根据 api_provider 决定使用哪种API调用策略
     * 这个方法只负责执行一次API调用，不关心重试。
     */
    async #executeApiCall(prompt, streamCallback = null, abortSignal = null) {
        let messages;
        if (Array.isArray(prompt)) {
            messages = prompt;
        } else {
             messages = [
                { role: 'system', content: this.config.system_prompt },
                { role: 'user', content: prompt }
            ];
        }

        this.config.stream = streamCallback !== null;

        // ================== 策略分发器 ==================
        switch (this.config.api_provider) {
            case 'sillytavern_preset':
                logger.debug("策略: SillyTavern 预设模式");
                return this.#callViaSillyTavernPreset(messages, streamCallback, abortSignal);

            case 'sillytavern_proxy_openai':
                logger.debug("策略: SillyTavern 代理模式");
                return this.#callViaSillyTavernProxy(messages, streamCallback, abortSignal);

            case 'direct_openai':
            default:
                logger.debug("策略: 直接 Fetch 模式");
                return this.#callViaDirectFetch(messages, streamCallback, abortSignal);
        }
    }

    /**
     * @private
     * 策略零：使用 SillyTavern 预设
     * 直接使用用户在 SillyTavern 连接管理器中配置的预设，零配置，最佳用户体验
     * @param {Array} messages - 消息数组
     * @param {Function|null} streamCallback - 流式回调（注意：预设模式暂不支持流式传输）
     * @param {AbortSignal|null} abortSignal - 中止信号 (此模式下不支持)
     */
    async #callViaSillyTavernPreset(messages, streamCallback, abortSignal) {
        logger.debug('[预设模式] 使用 SillyTavern 预设调用');

        if (abortSignal) {
            sbtConsole.warn('[LLMApiService] SillyTavern 预设模式不支持中止操作。');
        }
        
        // 注意：ConnectionManagerRequestService 不支持流式传输
        if (streamCallback) {
            sbtConsole.warn('[SBT-预设模式] 预设模式暂不支持流式传输，将使用标准响应模式');
        }

        // 1. 检查依赖：TavernHelper 是 SillyTavern 提供的辅助工具
        if (!window.TavernHelper || !window.TavernHelper.triggerSlash) {
            throw new Error('TavernHelper 不可用，无法使用 SillyTavern 预设模式。请确保您的 SillyTavern 版本支持此功能。');
        }

        const context = this.USER.getContext();
        if (!context) {
            throw new Error('无法获取 SillyTavern 上下文');
        }

        // 2. 获取预设 ID
        const profileId = this.config.tavernProfile;
        if (!profileId) {
            throw new Error('未配置 SillyTavern 预设 ID');
        }

        let originalProfile = '';
        let responsePromise;

        // 3. 配置文件切换之舞（保证恢复）
        try {
            // 3.1 保存当前用户的活动配置文件名
            originalProfile = await window.TavernHelper.triggerSlash('/profile');
            logger.debug(`[预设模式] 当前配置文件: ${originalProfile}`);

            // 3.2 找到目标配置文件的完整信息
            const targetProfile = context.extensionSettings?.connectionManager?.profiles?.find(p => p.id === profileId);
            if (!targetProfile) {
                throw new Error(`未找到配置文件 ID: ${profileId}`);
            }
            const targetProfileName = targetProfile.name;

            // 3.3 如果当前配置不是目标配置，则执行切换
            if (originalProfile !== targetProfileName) {
                logger.debug(`[预设模式] 切换配置文件: ${originalProfile} -> ${targetProfileName}`);
                await window.TavernHelper.triggerSlash(`/profile await=true "${targetProfileName.replace(/"/g, '\\"')}"`);
            }

            // 3.4 使用 ConnectionManagerRequestService 发送请求
            if (!context.ConnectionManagerRequestService) {
                throw new Error('ConnectionManagerRequestService 不可用');
            }
            logger.debug(`[预设模式] 通过配置文件 ${targetProfileName} 发送请求`);
            responsePromise = context.ConnectionManagerRequestService.sendRequest(
                targetProfile.id,
                messages,
                this.config.max_tokens || 4000
            );

        } finally {
            // 3.5 恢复原始配置（无论成功与否）
            try {
                const currentProfileAfterCall = await window.TavernHelper.triggerSlash('/profile');
                if (originalProfile && originalProfile !== currentProfileAfterCall) {
                    logger.debug(`[预设模式] 恢复原始配置文件: ${currentProfileAfterCall} -> ${originalProfile}`);
                    await window.TavernHelper.triggerSlash(`/profile await=true "${originalProfile.replace(/"/g, '\\"')}"`);
                }
            } catch (restoreError) {
                sbtConsole.error('[SBT-预设模式] 恢复配置文件失败:', restoreError);
            }
        }

        // 4. 等待并处理响应
        const result = await responsePromise;
        if (!result) {
            throw new Error('未收到 API 响应');
        }

        // 5. 提取响应内容（兼容不同的响应格式）
        let content = '';
        if (typeof result === 'string') {
            content = result;
        } else if (result.choices && result.choices[0]?.message?.content) {
            content = result.choices[0].message.content;
        } else if (result.content) {
            content = result.content;
        } else if (result.text) {
            content = result.text;
        } else {
            sbtConsole.warn('[SBT-预设模式] 未知的响应格式:', result);
            content = JSON.stringify(result);
        }

        return this.#cleanResponse(content);
    }

    /**
     * @private
     * 策略一：通过 SillyTavern 后端进行代理请求
     * 此策略可绕过浏览器CORS限制，适用于需要代理的场景
     */
    async #callViaSillyTavernProxy(messages, streamCallback, abortSignal) {
        try {
            const requestData = {
                stream: this.config.stream,
                messages: messages,
                max_tokens: this.config.max_tokens,
                model: this.config.model_name,
                temperature: this.config.temperature,
                chat_completion_source: 'openai',
                reverse_proxy: this.config.api_url,
                proxy_password: this.config.api_key || '',
            };

            // 【调试专用】打印完整请求体到前端控制台
            // 使用error级别确保总是显示（这不是真正的错误，只是调试信息）
            sbtConsole.error('[🔍 API请求调试 - 非错误] 发送到SillyTavern代理的完整请求:', JSON.stringify({
                模型名称: requestData.model,
                API来源: requestData.chat_completion_source,
                反向代理URL: requestData.reverse_proxy,
                是否流式: requestData.stream,
                最大tokens: requestData.max_tokens,
                温度: requestData.temperature,
                消息数量: messages.length,
                密码状态: requestData.proxy_password ? '✅已设置' : '❌未设置',
                完整消息内容: messages.map((msg, idx) => ({
                    序号: idx + 1,
                    角色: msg.role,
                    内容长度: msg.content?.length || 0,
                    内容预览: msg.content?.substring(0, 200) + (msg.content?.length > 200 ? '...' : '')
                }))
            }, null, 2));

            logger.debug('[代理-调试] 发送到 SillyTavern 后端的参数:', {
                ...requestData,
                proxy_password: requestData.proxy_password ? '***已设置***' : '(空)',
                messages: `${messages.length} 条消息`
            });

            const response = await fetch('/api/backends/chat-completions/generate', {
                method: 'POST',
                 headers: {
        ...getRequestHeaders(),
        'Content-Type': 'application/json'
    },
                body: JSON.stringify(requestData),
                signal: abortSignal, // 传递中止信号
            });

            if (!response.ok) {
                const errorText = await response.text();
                sbtConsole.error('[代理模式] SillyTavern 后端返回错误:', response.status, errorText);

                // 针对 503 错误提供更友好的提示
                if (response.status === 503) {
                    throw new Error(`后端服务暂时不可用 (503)。可能原因:\n1. 目标 API 服务器未启动或过载\n2. SillyTavern 后端与目标 API 之间的连接问题\n3. API 配置错误 (请检查 URL: ${this.config.api_url})`);
                }

                throw new Error(`SillyTavern 后端请求失败 (${response.status}): ${errorText}`);
            }

            // 检查是否是流式响应
            if (this.config.stream && streamCallback) {
                logger.debug('[代理模式] 处理流式响应...');
                return await this.#handleProxyStreamResponse(response, streamCallback);
            }

            // 非流式响应
            const responseData = await response.json();
            logger.debug('[代理-调试] SillyTavern 后端响应:', responseData);

            // 处理响应
            if (responseData.error) {
                // 增强错误信息，帮助用户调试
                const errorMsg = responseData.error.message || JSON.stringify(responseData.error);
                logger.error('[代理模式] API返回错误:', {
                    错误消息: errorMsg,
                    请求配置: {
                        模型: this.config.model_name || '(未设置)',
                        API来源: 'openai',
                        反向代理: this.config.api_url || '(未设置)',
                        密码状态: this.config.api_key ? '已设置' : '未设置'
                    }
                });
                throw new Error(`API 错误: ${errorMsg}\n\n调试信息:\n- 模型: ${this.config.model_name || '(未设置)'}\n- API URL: ${this.config.api_url || '(未设置)'}\n- 提供商: ${this.config.api_provider}`);
            }

            const content = responseData.choices?.[0]?.message?.content || responseData.content;
            if (!content) {
                throw new Error("通过内部路由获取响应失败或响应内容为空");
            }

            return this.#cleanResponse(content);

        } catch (error) {
            // 正确序列化错误信息，避免显示为空对象 {}
            const errorDetails = {
                message: error?.message || '未知错误',
                name: error?.name,
                status: error?.status,
                stack: error?.stack?.split('\n').slice(0, 3).join('\n')
            };
            sbtConsole.error("通过 SillyTavern 内部路由调用 LLM API 错误:", errorDetails);
            throw error;
        }
    }

    /**
     * @private
     * 处理 SillyTavern 代理模式的流式响应
     */
    async #handleProxyStreamResponse(response, streamCallback) {
        if (!response.body) {
            throw new Error("无法获取代理流式响应体");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';
        let chunkIndex = 0;

        try {
            logger.debug('[代理流式] 开始处理流式响应...');

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    logger.debug('[代理流式] 流式响应完成 (done=true)');
                    break;
                }

                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                chunkIndex++;
                logger.debug(`[代理流式] 收到第 ${chunkIndex} 块，缓冲区长度: ${buffer.length}`);

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;

                    try {
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                logger.debug('[代理流式] 收到 [DONE] 标记');
                                continue;
                            }

                            const jsonData = JSON.parse(dataStr);

                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                        }
                    } catch (e) {
                        sbtConsole.warn("[代理流式] 解析行 JSON 错误:", e, "行内容:", trimmedLine);
                    }
                }
            }

            // 处理最后的缓冲区
            const finalBufferTrimmed = buffer.trim();
            if (finalBufferTrimmed) {
                logger.debug(`[代理流式] 处理最终缓冲区: "${finalBufferTrimmed}"`);
                try {
                    if (finalBufferTrimmed.startsWith('data: ')) {
                        const dataStr = finalBufferTrimmed.substring(6).trim();
                        if (dataStr !== '[DONE]') {
                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                        }
                    }
                } catch (e) {
                    sbtConsole.warn("[代理流式] 处理最终缓冲区错误:", e);
                }
            }

            logger.debug('[代理流式] 流式处理完成。总响应长度:', fullResponse.length);
            return this.#cleanResponse(fullResponse);
        } catch (streamError) {
            sbtConsole.error('[代理流式] 流式读取错误:', streamError);
            throw streamError;
        } finally {
            logger.debug('[代理流式] 释放流锁');
            reader.releaseLock();
        }
    }

    /**
     * @private
     * 策略二：直接使用 fetch 进行 API 请求
     * 注意：此策略可能遇到CORS跨域问题
     */
    async #callViaDirectFetch(messages, streamCallback, abortSignal) {
        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: this.config.stream
        };

        try {
            if (this.config.stream) {
                if (!streamCallback || typeof streamCallback !== 'function') {
                    throw new Error("流式模式下必须提供有效的streamCallback函数");
                }
                return await this.#handleStreamResponse(apiEndpoint, headers, data, streamCallback, abortSignal);
            } else {
                return await this.#handleRegularResponse(apiEndpoint, headers, data, abortSignal);
            }
        } catch (error) {
            // 正确序列化错误信息，避免显示为空对象 {}
            const errorDetails = {
                message: error?.message || '未知错误',
                name: error?.name,
                status: error?.status,
                stack: error?.stack?.split('\n').slice(0, 3).join('\n')
            };
            sbtConsole.error("直接调用 LLM API 错误:", errorDetails);
            throw error;
        }
    }

    async #handleRegularResponse(apiEndpoint, headers, data, abortSignal) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
            signal: abortSignal, // 传递中止信号
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();

        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("API返回无效的响应结构");
        }

        let translatedText = responseData.choices[0].message.content;
        return this.#cleanResponse(translatedText);
    }

    async #handleStreamResponse(apiEndpoint, headers, data, streamCallback, abortSignal) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
            signal: abortSignal, // 传递中止信号
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';
        let chunkIndex = 0; 

        try {
            logger.debug('[Stream] Starting stream processing for custom API...'); 
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    logger.debug('[Stream] Custom API stream finished (done=true).'); 
                    break;
                }

                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                chunkIndex++;
                logger.debug(`[Stream] Custom API received chunk ${chunkIndex}. Buffer length: ${buffer.length}`); 

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; 

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;
                    logger.debug(`[Stream] Custom API processing line: "${trimmedLine}"`); 

                    try {
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                logger.debug('[Stream] Custom API received [DONE] marker.'); 
                                continue; 
                            }

                            const jsonData = JSON.parse(dataStr);

                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content); 
                            } else {
                            }
                        } else {
                             logger.debug('[Stream] Custom API line does not start with "data: ". Skipping.');
                        }
                    } catch (e) {
                        sbtConsole.warn("[Stream] Custom API error parsing line JSON:", e, "Line:", trimmedLine); 
                    }
                }
            }

            const finalBufferTrimmed = buffer.trim();
            if (finalBufferTrimmed) {
                logger.debug(`[Stream] Custom API processing final buffer content: "${finalBufferTrimmed}"`); 
                try {
                    if (finalBufferTrimmed.startsWith('data: ')) {
                         const dataStr = finalBufferTrimmed.substring(6).trim();
                         if (dataStr !== '[DONE]') {
                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                         }
                    }
                } catch (e) {
                    sbtConsole.warn("[Stream] Custom API error processing final buffer content:", e);
                }
            }

            logger.debug('[Stream] Custom API stream processing complete. Full response length:', fullResponse.length); 
            return this.#cleanResponse(fullResponse);
        } catch (streamError) {
            sbtConsole.error('[Stream] Custom API error during stream reading:', streamError); 
            throw streamError; 
        } finally {
            logger.debug('[Stream] Custom API releasing stream lock.'); 
            reader.releaseLock();
        }
    }

    #cleanResponse(text) {
        return text.trim();
    }

    
}

export default LLMApiService;
