
/**
 * @description 为字符串生成一个简单的哈希值。
 * @param {string} str 输入字符串。
 * @returns {string} 16进制哈希字符串。
 */
export function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(16);
}

/**
 * @description 从AI的原始回复中清理和提取故事文本。
 * @param {string} rawStoryText AI的原始回复。
 * @returns {string} 清理后的纯文本。
 */
export function extractAndCleanStoryText(rawStoryText) {
    if (!rawStoryText) return '';
    
    let cleanedText = rawStoryText.replace(/<!--[\s\S]*?-->/g, '');
    cleanedText = cleanedText.replace(/(\n\s*){3,}/g, '\n\n');

    return cleanedText.trim();
}