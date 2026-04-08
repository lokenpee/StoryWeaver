export function createParserService(deps = {}) {
    const {
        AppState,
        debugLog,
        getEnabledCategoryNames,
    } = deps;

    function filterResponseContent(text) {
        if (!text) return text;
        const filterTagsStr = AppState.settings.filterResponseTags || 'thinking,/think';
        const filterTags = filterTagsStr.split(',').map((t) => t.trim()).filter((t) => t);
        let cleaned = text;
        for (const tag of filterTags) {
            if (tag.startsWith('/')) {
                const tagName = tag.substring(1);
                cleaned = cleaned.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
            } else {
                cleaned = cleaned.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
            }
        }
        return cleaned;
    }

    function extractWorldbookDataByRegex(jsonString) {
        const result = {};
        const categories = getEnabledCategoryNames();
        for (const category of categories) {
            const categoryPattern = new RegExp(`"${category}"\\s*:\\s*\\{`, 'g');
            const categoryMatch = categoryPattern.exec(jsonString);
            if (!categoryMatch) continue;
            const startPos = categoryMatch.index + categoryMatch[0].length;
            let braceCount = 1;
            let endPos = startPos;
            while (braceCount > 0 && endPos < jsonString.length) {
                if (jsonString[endPos] === '{') braceCount++;
                if (jsonString[endPos] === '}') braceCount--;
                endPos++;
            }
            if (braceCount !== 0) continue;
            const categoryContent = jsonString.substring(startPos, endPos - 1);
            result[category] = {};
            const entryPattern = /"([^"]+)"\s*:\s*\{/g;
            let entryMatch;
            while ((entryMatch = entryPattern.exec(categoryContent)) !== null) {
                const entryName = entryMatch[1];
                const entryStartPos = entryMatch.index + entryMatch[0].length;
                let entryBraceCount = 1;
                let entryEndPos = entryStartPos;
                while (entryBraceCount > 0 && entryEndPos < categoryContent.length) {
                    if (categoryContent[entryEndPos] === '{') entryBraceCount++;
                    if (categoryContent[entryEndPos] === '}') entryBraceCount--;
                    entryEndPos++;
                }
                if (entryBraceCount !== 0) continue;
                const entryContent = categoryContent.substring(entryStartPos, entryEndPos - 1);
                let keywords = [];
                const keywordsMatch = entryContent.match(/"关键词"\s*:\s*\[([\s\S]*?)\]/);
                if (keywordsMatch) {
                    const keywordStrings = keywordsMatch[1].match(/"([^"]+)"/g);
                    if (keywordStrings) keywords = keywordStrings.map((s) => s.replace(/"/g, ''));
                }
                let content = '';
                const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
                if (contentMatch) {
                    const contentStartPos = contentMatch.index + contentMatch[0].length;
                    let contentEndPos = contentStartPos;
                    let escaped = false;
                    while (contentEndPos < entryContent.length) {
                        const char = entryContent[contentEndPos];
                        if (escaped) {
                            escaped = false;
                        } else if (char === '\\') {
                            escaped = true;
                        } else if (char === '"') {
                            let peekPos = contentEndPos + 1;
                            while (peekPos < entryContent.length && /[\s\r\n]/.test(entryContent[peekPos])) peekPos++;
                            const nextChar = entryContent[peekPos];
                            if (nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
                                break;
                            }
                        }
                        contentEndPos++;
                    }
                    content = entryContent.substring(contentStartPos, contentEndPos);
                    try {
                        content = JSON.parse(`"${content.replace(/(?<!\\)"/g, '\\"')}"`);
                    } catch (e) {
                        content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }
                }
                if (content || keywords.length > 0) {
                    const roleTypeMatch = entryContent.match(/"角色类型"\s*:\s*"([^"]+)"/);
                    const parsedEntry = { '关键词': keywords, '内容': content };
                    if (roleTypeMatch) {
                        parsedEntry['角色类型'] = roleTypeMatch[1];
                    }
                    result[category][entryName] = parsedEntry;
                }
            }
            if (Object.keys(result[category]).length === 0) delete result[category];
        }
        return result;
    }

    function normalizeRoleType(value) {
        const role = String(value || '').trim();
        if (!role) return '';
        if (role.includes('主角')) return '主角';
        if (role.includes('重要配角')) return '重要配角';
        if (role.includes('普通配角') || role.includes('配角')) return '普通配角';
        if (role.toUpperCase() === 'NPC' || role.includes('NPC') || role.includes('路人') || role.includes('龙套')) return 'NPC';
        return '';
    }

    function normalizeParsedWorldbookData(data) {
        if (!data || typeof data !== 'object') return data;

        const normalizeContentValue = (value) => {
            if (typeof value === 'string') return value;
            if (value === null || value === undefined) return '';
            if (Array.isArray(value)) {
                return value
                    .map((item) => String(item ?? '').trim())
                    .filter(Boolean)
                    .join('\n');
            }
            if (typeof value === 'object') {
                try {
                    return JSON.stringify(value);
                } catch (_) {
                    return String(value);
                }
            }
            return String(value);
        };

        for (const category in data) {
            const categoryData = data[category];
            if (!categoryData || typeof categoryData !== 'object') continue;

            for (const entryName in categoryData) {
                const entry = categoryData[entryName];
                if (!entry || typeof entry !== 'object') continue;

                if (!Array.isArray(entry['关键词'])) {
                    if (entry['关键词'] === null || entry['关键词'] === undefined || entry['关键词'] === '') {
                        entry['关键词'] = [];
                    } else {
                        entry['关键词'] = [String(entry['关键词'])];
                    }
                }
                entry['内容'] = normalizeContentValue(entry['内容']);

                if (category === '角色') {
                    const normalizedRoleType = normalizeRoleType(entry['角色类型']);
                    entry['角色类型'] = normalizedRoleType || '普通配角';
                }
            }
        }
        return data;
    }

    function repairJsonUnescapedQuotes(jsonStr) {
        let result = '';
        let inString = false;
        let i = 0;

        while (i < jsonStr.length) {
            const char = jsonStr[i];

            if (inString && char === '\\') {
                result += char;
                if (i + 1 < jsonStr.length) {
                    result += jsonStr[i + 1];
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (char === '"') {
                if (!inString) {
                    inString = true;
                    result += char;
                    i++;
                    continue;
                }

                let j = i + 1;
                while (j < jsonStr.length && /[\s\r\n]/.test(jsonStr[j])) j++;
                const nextChar = jsonStr[j];

                if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
                    inString = false;
                    result += char;
                } else {
                    result += '\\"';
                }
                i++;
                continue;
            }

            result += char;
            i++;
        }

        return result;
    }

    function parseAIResponse(response, options = {}) {
        const { strict = true } = options;
        const rawResponse = String(response ?? '');
        debugLog(`解析响应开始, 响应长度=${rawResponse.length}字符, strict=${strict}`);

        const directText = filterResponseContent(rawResponse).trim();
        const tryParse = (input) => {
            try {
                return { ok: true, value: JSON.parse(input) };
            } catch (error) {
                return { ok: false, error };
            }
        };

        const directResult = tryParse(directText);
        if (directResult.ok) return normalizeParsedWorldbookData(directResult.value);

        let fenced = directText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const first = fenced.indexOf('{');
        const last = fenced.lastIndexOf('}');
        if (first !== -1 && last > first) fenced = fenced.substring(first, last + 1);

        const fencedResult = tryParse(fenced);
        if (fencedResult.ok) return normalizeParsedWorldbookData(fencedResult.value);

        if (strict) {
            const summary = directText.slice(0, 200).replace(/\s+/g, ' ');
            throw new Error(`JSON解析失败（严格模式）。请检查模型输出是否为完整JSON。响应摘要: ${summary}${directText.length > 200 ? '...' : ''}`);
        }

        try {
            const repaired = repairJsonUnescapedQuotes(fenced);
            return normalizeParsedWorldbookData(JSON.parse(repaired));
        } catch (repairError) {
            debugLog('修复未转义引号后仍解析失败，进入bracket补全/regex fallback');
        }

        const open = (fenced.match(/{/g) || []).length;
        const close = (fenced.match(/}/g) || []).length;
        if (open > close) {
            const patched = fenced + '}'.repeat(open - close);
            try {
                return normalizeParsedWorldbookData(JSON.parse(patched));
            } catch (patchError) {
                try {
                    const repairedPatched = repairJsonUnescapedQuotes(patched);
                    return normalizeParsedWorldbookData(JSON.parse(repairedPatched));
                } catch (patchRepairError) {
                    debugLog('补全括号与修复引号后仍失败，进入regex fallback');
                }
            }
        }

        const extracted = extractWorldbookDataByRegex(fenced);
        if (extracted && typeof extracted === 'object' && Object.keys(extracted).length > 0) {
            return normalizeParsedWorldbookData(extracted);
        }

        const summary = directText.slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`JSON修复失败。响应摘要: ${summary}${directText.length > 200 ? '...' : ''}`);
    }

    return {
        filterResponseContent,
        parseAIResponse,
    };
}
