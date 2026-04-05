// ======================================================================
// JSON提取工具函数
// ======================================================================
import { sbtConsole } from './sbtConsole.js';
let diagnose = (message, ...args) => sbtConsole.error(`[SBT-DIAGNOSE] ${message}`, ...args);
let info = (message, ...args) => sbtConsole.info(`[SBT-INFO] ${message}`, ...args);

/**
 * @description 从可能混杂了其他文本的字符串中，安全地提取出第一个有效的JSON对象。
 * @param {string} text - 从AI返回的原始文本。
 * @returns {object|null} - 解析后的JSON对象或null。
 */
export function extractJsonFromString(text) {
    if (!text || typeof text !== 'string') {
        diagnose("[JSON Extractor] Input text is invalid.");
        return null;
    }

    let jsonString = null;
    // 策略一：优先寻找Markdown代码块 (```json ... ```)
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (codeBlockMatch && codeBlockMatch.length > 1) {
        jsonString = codeBlockMatch[1].trim(); 
        info("[JSON Extractor] V2: Found and extracted JSON from a precise markdown code block.");
    } else {
        // 策略二：如果找不到代码块，则回退到基于括号匹配的“最大化”提取。
        info("[JSON Extractor] V2: No markdown code block found. Falling back to brace matching.");
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonString = text.substring(firstBrace, lastBrace + 1);
        }
    }

    if (!jsonString) {
        diagnose("[JSON Extractor] V2: Could not find any potential JSON content in the string.");
        return null;
    }

    try {
        const cleanedJsonString = jsonString.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(cleanedJsonString);
    } catch (error) {
        diagnose("[JSON Extractor] V2: Failed to parse the extracted string.", {
            originalError: error.message,
            jsonStringToParse: jsonString
        });
        
        throw new Error(`Failed to parse JSON. Reason: ${error.message}. Raw extracted content: "${jsonString.substring(0, 200)}..."`);
    }
}
