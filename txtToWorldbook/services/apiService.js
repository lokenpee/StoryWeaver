export function createApiService(deps = {}) {
    const {
        AppState,
        Logger,
        APICaller,
        updateStreamContent,
        debugLog,
        messagesToString,
        convertToGeminiContents,
        applyMessageChain,
    } = deps;

    function getApiConfig(target = 'main') {
        if (target === 'director') {
            const fromSettings = AppState.settings.directorApi || {};
            return {
                provider: fromSettings.provider || 'openai-compatible',
                apiKey: fromSettings.apiKey || '',
                endpoint: fromSettings.endpoint || '',
                model: fromSettings.model || 'gemini-2.5-flash',
                maxTokens: normalizeMaxTokens(fromSettings.maxTokens, 2048),
            };
        }

        const fromSettings = AppState.settings.mainApi || {};
        return {
            provider: fromSettings.provider || AppState.settings.customApiProvider || 'openai-compatible',
            apiKey: fromSettings.apiKey || AppState.settings.customApiKey || '',
            endpoint: fromSettings.endpoint || AppState.settings.customApiEndpoint || '',
            model: fromSettings.model || AppState.settings.customApiModel || 'gemini-2.5-flash',
            maxTokens: normalizeMaxTokens(
                fromSettings.maxTokens ?? AppState.settings.customApiMaxTokens,
                2048
            ),
        };
    }

    function normalizeMaxTokens(value, fallback = 2048) {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(1, Math.min(8192, parsed));
    }

    function buildApiLogPrefix(target = 'main', taskId = null) {
        const apiTag = target === 'director' ? '导演API' : '主API';
        const parsedTask = Number.parseInt(taskId, 10);
        if (Number.isFinite(parsedTask) && parsedTask > 0) {
            return `[第${parsedTask}章][${apiTag}]`;
        }
        if (taskId !== null && taskId !== undefined && String(taskId).trim()) {
            return `[任务${String(taskId).trim()}][${apiTag}]`;
        }
        return `[${apiTag}]`;
    }

    async function callSillyTavernAPI(messages, taskId = null) {
        const timeout = AppState.settings.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        const combinedPrompt = messagesToString(messages);
        updateStreamContent(`\n📤 ${logPrefix} 发送请求到酒馆API (${messages.length}条消息)...\n`);
        debugLog(`${logPrefix} 酒馆API开始调用, 消息数=${messages.length}, 总长度=${combinedPrompt.length}, 超时=${timeout / 1000}秒`);

        try {
            if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                throw new Error('无法访问SillyTavern上下文');
            }

            const context = SillyTavern.getContext();
            debugLog(`${logPrefix} 获取到SillyTavern上下文`);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`API请求超时 (${timeout / 1000}秒)`)), timeout);
            });

            let result;

            if (typeof context.generateRaw === 'function') {
                try {
                    debugLog(`${logPrefix} 尝试generateRaw消息数组格式 (ST 1.13.2+)`);
                    result = await Promise.race([
                        context.generateRaw({ prompt: messages }),
                        timeoutPromise,
                    ]);
                    debugLog(`${logPrefix} generateRaw消息数组格式成功`);
                } catch (rawError) {
                    if (rawError.message?.includes('超时') || rawError.message?.includes('timeout') ||
                        rawError.message?.includes('API') || rawError.message?.includes('limit')) {
                        throw rawError;
                    }
                    debugLog(`${logPrefix} 消息数组格式不支持(${rawError.message})，回退字符串模式`);
                    updateStreamContent(`⚠️ ${logPrefix} 酒馆不支持消息数组格式，已回退为字符串模式\n`);
                    result = await Promise.race([
                        context.generateRaw(combinedPrompt, '', false),
                        timeoutPromise,
                    ]);
                }
            } else if (typeof context.generateQuietPrompt === 'function') {
                debugLog(`${logPrefix} 使用generateQuietPrompt（字符串模式）`);
                updateStreamContent(`ℹ️ ${logPrefix} 酒馆API: 使用generateQuietPrompt（字符串模式，消息角色不生效）\n`);
                result = await Promise.race([
                    context.generateQuietPrompt(combinedPrompt, false, false),
                    timeoutPromise,
                ]);
            } else {
                throw new Error('无法找到可用的生成函数');
            }

            debugLog(`${logPrefix} 收到响应, 长度=${result.length}字符`);
            updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
            return result;
        } catch (error) {
            debugLog(`${logPrefix} 酒馆API出错: ${error.message}`);
            updateStreamContent(`\n❌ ${logPrefix} 错误: ${error.message}\n`);
            throw error;
        }
    }

    function buildCustomApiRequest(messages, target = 'main') {
        const config = getApiConfig(target);
        const provider = config.provider;
        const apiKey = config.apiKey;
        const endpoint = config.endpoint;
        const model = config.model;
        const customApiMaxTokens = normalizeMaxTokens(config.maxTokens, 2048);
        const openaiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
        let requestUrl = '';
        let requestOptions = {};
        let isStreamRequest = false;

        switch (provider) {
            case 'anthropic': {
                if (!apiKey) throw new Error('Anthropic API Key 未设置');
                requestUrl = 'https://api.anthropic.com/v1/messages';
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: model || 'claude-sonnet-4-20250514',
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: 64000,
                    }),
                };
                break;
            }

            case 'gemini': {
                if (!apiKey) throw new Error('Gemini API Key 未设置');
                const geminiModel = model || 'gemini-2.5-flash';
                let geminiBaseUrl = endpoint ? endpoint.trim() : '';
                if (geminiBaseUrl) {
                    if (!geminiBaseUrl.startsWith('http')) geminiBaseUrl = 'https://' + geminiBaseUrl;
                    if (geminiBaseUrl.endsWith('/')) geminiBaseUrl = geminiBaseUrl.slice(0, -1);
                    if (geminiBaseUrl.includes('?')) {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent&key=${apiKey}`;
                    } else {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent?key=${apiKey}`;
                    }
                } else {
                    requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
                }
                const geminiData = convertToGeminiContents(messages);
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...geminiData,
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.3 },
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
                        ],
                    }),
                };
                break;
            }

            case 'openai-compatible': {
                let openaiEndpoint = endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
                const openaiModel = model || 'local-model';

                if (!openaiEndpoint.includes('/chat/completions')) {
                    if (openaiEndpoint.endsWith('/v1')) {
                        openaiEndpoint += '/chat/completions';
                    } else {
                        openaiEndpoint = openaiEndpoint.replace(/\/$/, '') + '/chat/completions';
                    }
                }

                if (!openaiEndpoint.startsWith('http')) {
                    openaiEndpoint = 'http://' + openaiEndpoint;
                }

                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    headers.Authorization = `Bearer ${apiKey}`;
                }

                requestUrl = openaiEndpoint;
                requestOptions = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: customApiMaxTokens,
                        stream: true,
                    }),
                };
                isStreamRequest = true;
                break;
            }

            default:
                throw new Error(`不支持的API提供商: ${provider}`);
        }

        return { provider, requestUrl, requestOptions, isStreamRequest, model };
    }

    function extractCustomApiText(provider, data) {
        if (provider === 'gemini') {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if (provider === 'anthropic') {
            return data.content?.[0]?.text || '';
        }
        return data.choices?.[0]?.message?.content || '';
    }

    async function callCustomAPI(messages, target = 'main', taskId = null) {
        const maxRetries = 3;
        const baseTimeout = AppState.settings.apiTimeout || 120000;
        const timeout = target === 'director'
            ? Math.min(baseTimeout, 8000)
            : baseTimeout;
        const requestConfig = buildCustomApiRequest(messages, target);
        const combinedPrompt = messagesToString(messages);

        const logPrefix = buildApiLogPrefix(target, taskId);
        updateStreamContent(`\n📤 ${logPrefix} 发送请求 (${requestConfig.provider}, ${messages.length}条消息)...\n`);
        debugLog(`${logPrefix} 开始调用, provider=${requestConfig.provider}, model=${requestConfig.model}, 消息数=${messages.length}, 总长度=${combinedPrompt.length}`);

        try {
            return await APICaller.withRetry(async (attempt) => {
                const attemptNo = attempt + 1;
                updateStreamContent(`🕓 ${logPrefix} 请求进行中（尝试 ${attemptNo}/${maxRetries + 1}）...\n`);
                debugLog(`${logPrefix} 请求目标: ${requestConfig.requestUrl.substring(0, 80)}..., 尝试=${attemptNo}`);

                if (requestConfig.isStreamRequest) {
                    const result = await APICaller.requestStream(requestConfig.requestUrl, {
                        ...requestConfig.requestOptions,
                        timeout,
                        inactivityTimeout: Math.min(timeout, 120000),
                    });
                    debugLog(`${logPrefix} 流式读取完成, 结果长度=${result.length}字符`);
                    updateStreamContent(`📥 ${logPrefix} 收到流式响应 (${result.length}字符)\n`);
                    if (!String(result || '').trim()) {
                        updateStreamContent(`⚠️ ${logPrefix} 响应为空文本，可能是流式格式不兼容\n`);
                    }
                    return result;
                }

                const data = await APICaller.requestJSON(requestConfig.requestUrl, {
                    ...requestConfig.requestOptions,
                    timeout,
                });
                debugLog(`${logPrefix} JSON解析完成, 开始提取内容`);
                const result = extractCustomApiText(requestConfig.provider, data);
                debugLog(`${logPrefix} 提取完成, 结果长度=${result.length}字符`);
                updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
                if (!String(result || '').trim()) {
                    updateStreamContent(`⚠️ ${logPrefix} JSON响应可解析但正文为空\n`);
                }
                return result;
            }, {
                retries: maxRetries,
                shouldRetry: (error) => APICaller.isRateLimitError(error),
                onRetry: async (error, nextAttempt, delay) => {
                    Logger.warn('API', `${logPrefix} 限流重试 #${nextAttempt}: ${error.message}`);
                    updateStreamContent(`⏳ ${logPrefix} 遇到限流，${delay}ms后重试...\n`);
                },
            });
        } catch (error) {
            const normalized = APICaller.handleError(error, '自定义API');
            debugLog(`${logPrefix} 出错: ${error.name || 'Error'} - ${error.message}`);
            if (normalized.type === 'timeout') {
                throw new Error(`API请求超时 (${timeout / 1000}秒)`);
            }
            throw error;
        }
    }

    async function handleFetchModelList(target = 'main') {
        const config = getApiConfig(target);
        const endpoint = config.endpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }

        let modelsUrl = endpoint;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1')) {
            modelsUrl += '/models';
        } else if (!modelsUrl.endsWith('/models')) {
            modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
        }

        if (!modelsUrl.startsWith('http')) {
            modelsUrl = 'http://' + modelsUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        Logger.info('API', '拉取模型列表: ' + modelsUrl);

        const data = await APICaller.getJSON(modelsUrl, { method: 'GET', headers });
        Logger.info('API', '模型列表响应: ' + JSON.stringify(data).substring(0, 200));

        let models = [];
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map((m) => m.id || m.name || m);
        } else if (Array.isArray(data)) {
            models = data.map((m) => typeof m === 'string' ? m : (m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map((m) => typeof m === 'string' ? m : (m.id || m.name || m));
        }

        return models;
    }

    async function handleQuickTestModel(target = 'main') {
        const config = getApiConfig(target);
        const endpoint = config.endpoint || '';
        const model = config.model || '';

        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }
        if (!model) {
            throw new Error('请先设置模型名称');
        }

        let requestUrl = endpoint;
        if (!requestUrl.includes('/chat/completions')) {
            if (requestUrl.endsWith('/v1')) {
                requestUrl += '/chat/completions';
            } else {
                requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
        }

        if (!requestUrl.startsWith('http')) {
            requestUrl = 'http://' + requestUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        Logger.info('API', `快速测试: ${requestUrl} 模型: ${model}`);
        const testMaxTokens = Math.min(normalizeMaxTokens(config.maxTokens, 1024), 1024);

        const startTime = Date.now();
        const data = await APICaller.getJSON(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                max_tokens: testMaxTokens,
                temperature: 0.1,
            }),
        });

        const elapsed = Date.now() - startTime;
        Logger.info('API', '测试响应: ' + JSON.stringify(data).substring(0, 200));

        let responseText = '';

        if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message && choice.message.content) {
                responseText = choice.message.content;
            } else if (choice.text) {
                responseText = choice.text;
            } else if (typeof choice.content === 'string') {
                responseText = choice.content;
            }
        } else if (data.response) {
            responseText = data.response;
        } else if (data.content) {
            responseText = data.content;
        } else if (data.text) {
            responseText = data.text;
        } else if (data.output) {
            responseText = data.output;
        } else if (data.generated_text) {
            responseText = data.generated_text;
        }

        if (!responseText || responseText.trim() === '') {
            Logger.warn('API', '无法解析响应，完整数据: ' + JSON.stringify(data, null, 2));

            const possibleFields = ['result', 'message', 'data', 'completion'];
            for (const field of possibleFields) {
                if (data[field]) {
                    if (typeof data[field] === 'string') {
                        responseText = data[field];
                        break;
                    } else if (typeof data[field] === 'object' && data[field].content) {
                        responseText = data[field].content;
                        break;
                    }
                }
            }
        }

        if (!responseText || responseText.trim() === '') {
            throw new Error(`API返回了无法解析的响应格式。\n响应数据: ${JSON.stringify(data).substring(0, 200)}`);
        }

        return {
            success: true,
            elapsed,
            response: responseText.substring(0, 100),
        };
    }

    async function callTargetPrompt(prompt, taskId = null, target = 'main') {
        const messages = target === 'main'
            ? applyMessageChain(prompt)
            : [{ role: 'user', content: String(prompt || '') }];
        const logPrefix = buildApiLogPrefix(target, taskId);
        debugLog(`${logPrefix} 消息链转换完成, ${messages.length}条消息, roles=[${messages.map((m) => m.role).join(',')}]`);
        if (target === 'main' && AppState.settings.useTavernApi) {
            return callSillyTavernAPI(messages, taskId);
        }
        return callCustomAPI(messages, target, taskId);
    }

    async function callAPI(prompt, taskId = null) {
        return callTargetPrompt(prompt, taskId, 'main');
    }

    async function callMainAPI(prompt, taskId = null) {
        return callTargetPrompt(prompt, taskId, 'main');
    }

    async function callDirectorAPI(prompt, taskId = null) {
        try {
            return await callTargetPrompt(prompt, taskId, 'director');
        } catch (error) {
            const fallbackEnabled = AppState.settings.directorAutoFallbackToMain !== false;
            if (!fallbackEnabled) {
                throw error;
            }
            if (AppState.settings.useTavernApi) {
                Logger.warn('API', `导演API失败，已跳过回退主AI（酒馆模式下避免发送链路递归）: ${error.message}`);
                updateStreamContent('⚠️ 导演API失败，已跳过回退主AI（酒馆模式下避免卡发送）\n');
                throw error;
            }
            Logger.warn('API', `导演API失败，已回退主AI: ${error.message}`);
            updateStreamContent(`⚠️ 导演API失败，已自动回退主AI\n`);
            const fallbackMessages = [{ role: 'user', content: String(prompt || '') }];
            return callCustomAPI(fallbackMessages, 'main', taskId);
        }
    }

    return {
        callSillyTavernAPI,
        callCustomAPI,
        handleFetchModelList,
        handleQuickTestModel,
        callMainAPI,
        callDirectorAPI,
        callAPI,
    };
}
