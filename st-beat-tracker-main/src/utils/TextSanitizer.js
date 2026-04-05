/**
 * TextSanitizer - 文本清理工具
 *
 * 提供文本清理和验证功能，主要用于清理AI生成的摘要中的乱码和占位符
 *
 * @file src/utils/TextSanitizer.js
 * @module TextSanitizer
 * @author Claude (重构自 StoryBeatEngine.js)
 * @date 2025-12-07
 */

/**
 * 文本清理工具类
 *
 * @class TextSanitizer
 * @example
 * const cleaned = TextSanitizer.sanitizeText("δ׫דժ"); // 返回 "（暂无详细摘要）"
 * const valid = TextSanitizer.sanitizeText("这是有效的摘要文本"); // 返回原文本
 */
export class TextSanitizer {
    /**
     * 清理摘要文本中的常见乱码和占位符
     *
     * 会过滤以下内容：
     * - 乱码字符（如"δ׫"、"дժ"）
     * - 过短的文本（< 5字符）
     * - 占位符文本（"尚未撰写"、"暂无"）
     *
     * @static
     * @param {string} text - 需要清理的摘要文本
     * @returns {string} 清理后的文本，或在无效输入时返回标准占位符"（暂无详细摘要）"
     *
     * @example
     * TextSanitizer.sanitizeText("δ׫דժ"); // 返回 "（暂无详细摘要）"
     * TextSanitizer.sanitizeText("暂无"); // 返回 "（暂无详细摘要）"
     * TextSanitizer.sanitizeText("这是一段有效的摘要"); // 返回原文本
     */
    static sanitizeText(text) {
        // 验证输入
        if (!text || typeof text !== 'string') {
            return "（暂无详细摘要）";
        }

        // 过滤常见的乱码模式
        // - GBK->UTF8 编码错误导致的乱码
        // - 无意义的占位符
        // - 过短的文本（可能是错误输出）
        if (text.includes('δ׫') ||
            text.includes('дժ') ||
            text.trim().length < 5 ||
            text.includes("尚未撰写") ||
            text.includes("暂无")) {
            return "（暂无详细摘要）";
        }

        return text;
    }
}
