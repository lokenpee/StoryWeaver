function safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function compactSpaces(text) {
    return safeString(text).replace(/\s+/g, ' ').trim();
}

export function normalizeEntryName(name) {
    let value = compactSpaces(name);

    // Remove common version/volume suffixes: _卷1, (卷二), -第3章, _v2, _新版, _重做.
    value = value
        .replace(/[_\-\s]*第?[零一二三四五六七八九十百千万\d]+[卷章回部篇节]$/giu, '')
        .replace(/[_\-\s]*卷[零一二三四五六七八九十百千万\d]+$/giu, '')
        .replace(/[(_\-\s]*[Vv][Ee][Rr]?[\s._-]*\d+$/g, '')
        .replace(/[(_\-\s]*(新版|旧版|重做版|重制版|修订版|临时版|备份|草稿|重复|改)$/giu, '')
        .replace(/[（(]\s*第?[零一二三四五六七八九十百千万\d]+[卷章回部篇节]\s*[）)]$/giu, '')
        .replace(/[（(]\s*(新版|旧版|重做版|重制版|修订版|临时版|备份|草稿|重复|改)\s*[）)]$/giu, '')
        .trim();

    return value || compactSpaces(name);
}

export function normalizeNameForComparison(name) {
    return normalizeEntryName(name)
        .toLowerCase()
        .replace(/[\s`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?！￥…（）【】、；：‘’“”，。？《》·]/g, '');
}

export function areNamesObviouslySame(nameA, nameB) {
    const a = normalizeNameForComparison(nameA);
    const b = normalizeNameForComparison(nameB);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
}

function splitContentSegments(content) {
    return safeString(content)
        .split(/\n\s*---\s*\n/g)
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeTextForComparison(text) {
    return safeString(text)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[，。！？；：,.!?;:'"“”‘’`~!@#$%^&*()_+\-=\[\]{}\\|<>\/]/g, '');
}

function calculateCharOverlap(a, b) {
    if (!a || !b) return 0;
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));
    let overlap = 0;
    for (const ch of setA) {
        if (setB.has(ch)) overlap++;
    }
    return overlap / Math.max(setA.size, setB.size, 1);
}

function normalizeFieldName(fieldName) {
    const raw = safeString(fieldName).trim();
    if (!raw) return '';

    const compact = raw
        .toLowerCase()
        .replace(/[\s_\-（）()【】\[\]{}]/g, '')
        .replace(/(?:补充|扩展|说明|信息)\d*$/g, '');

    if (/^(姓名|人物名称|角色名称|名字|名称)$/.test(compact)) return '名称';
    if (/^(台词|语录|话语示例|说话风格)$/.test(compact)) return '话语示例';
    if (/^(履历|经历|背景|背景故事|过往)$/.test(compact)) return '背景故事';
    if (/^(外貌|形象|外形)$/.test(compact)) return '外貌';
    if (/^(能力|技能|特长)$/.test(compact)) return '能力';
    if (/^(性格|性格特征)$/.test(compact)) return '性格';

    return compact;
}

function isValueNearDuplicate(existingValue, incomingValue) {
    const left = normalizeTextForComparison(existingValue);
    const right = normalizeTextForComparison(incomingValue);
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.includes(right) || right.includes(left)) return true;
    return calculateCharOverlap(left, right) >= 0.9;
}

function addUniqueValue(bucket, value) {
    const trimmed = safeString(value).trim();
    if (!trimmed) return;

    const duplicatedIndex = bucket.values.findIndex((item) => isValueNearDuplicate(item, trimmed));
    if (duplicatedIndex === -1) {
        bucket.values.push(trimmed);
        return;
    }

    if (trimmed.length > bucket.values[duplicatedIndex].length) {
        bucket.values[duplicatedIndex] = trimmed;
    }
}

function parseStructuredContent(content) {
    const lines = safeString(content).split(/\r?\n/);
    const fields = new Map();
    const fieldOrder = [];
    const freeText = [];
    const seenFreeText = new Set();
    let hasField = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const fieldMatch = line.match(/^(?:[-*•\d.()（）一二三四五六七八九十、\s]+)?(?:\*\*)?\s*([^:：\n]{1,40}?)\s*(?:\*\*)?\s*[:：]\s*(.+)$/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            const fieldValue = fieldMatch[2].trim();
            const fieldKey = normalizeFieldName(fieldName);
            if (!fieldKey || !fieldValue) continue;

            hasField = true;
            if (!fields.has(fieldKey)) {
                fields.set(fieldKey, { name: fieldName, values: [] });
                fieldOrder.push(fieldKey);
            }
            addUniqueValue(fields.get(fieldKey), fieldValue);
            continue;
        }

        const normalized = normalizeTextForComparison(line);
        if (!normalized || seenFreeText.has(normalized)) continue;
        seenFreeText.add(normalized);
        freeText.push(line);
    }

    return { fields, fieldOrder, freeText, hasField };
}

function mergeParsedStructuredContent(base, incoming) {
    for (const key of incoming.fieldOrder) {
        const incomingBucket = incoming.fields.get(key);
        if (!incomingBucket) continue;

        if (!base.fields.has(key)) {
            base.fields.set(key, { name: incomingBucket.name, values: [] });
            base.fieldOrder.push(key);
        }

        const baseBucket = base.fields.get(key);
        for (const value of incomingBucket.values) {
            addUniqueValue(baseBucket, value);
        }
    }

    for (const line of incoming.freeText) {
        const duplicated = base.freeText.some((item) => isValueNearDuplicate(item, line));
        if (!duplicated) base.freeText.push(line);
    }
}

function buildStructuredContent(parsed) {
    const output = [];

    for (const key of parsed.fieldOrder) {
        const bucket = parsed.fields.get(key);
        if (!bucket || bucket.values.length === 0) continue;

        output.push(`${bucket.name}: ${bucket.values[0]}`);
        for (let i = 1; i < bucket.values.length; i++) {
            output.push(`${bucket.name}补充${i}: ${bucket.values[i]}`);
        }
    }

    if (parsed.freeText.length > 0) {
        if (output.length > 0) output.push('');
        output.push(...parsed.freeText);
    }

    return output.join('\n').trim();
}

export function isContentNearDuplicate(existingContent, incomingContent) {
    const left = normalizeTextForComparison(existingContent);
    const right = normalizeTextForComparison(incomingContent);
    if (!left || !right) return false;

    if (left === right) return true;
    if (left.includes(right) || right.includes(left)) return true;

    // Guard against paraphrase duplicates.
    return calculateCharOverlap(left, right) >= 0.88;
}

export function mergeContentWithDedup(existingContent, incomingContent, separator = '\n\n---\n\n') {
    if (!safeString(existingContent).trim()) return safeString(incomingContent).trim();
    if (!safeString(incomingContent).trim()) return safeString(existingContent).trim();

    if (isContentNearDuplicate(existingContent, incomingContent)) {
        return safeString(existingContent).length >= safeString(incomingContent).length
            ? safeString(existingContent).trim()
            : safeString(incomingContent).trim();
    }

    const existingSegments = splitContentSegments(existingContent);
    const incomingSegments = splitContentSegments(incomingContent);

    const merged = [...existingSegments];
    for (const segment of incomingSegments) {
        const duplicated = merged.some((item) => isContentNearDuplicate(item, segment));
        if (!duplicated) merged.push(segment);
    }

    return merged.join(separator).trim();
}

export function mergeContentByFieldFusion(existingContent, incomingContent) {
    const left = safeString(existingContent).trim();
    const right = safeString(incomingContent).trim();

    if (!left && !right) return '';
    if (!left) {
        const parsedRight = parseStructuredContent(right);
        return parsedRight.hasField ? buildStructuredContent(parsedRight) : right;
    }
    if (!right) {
        const parsedLeft = parseStructuredContent(left);
        return parsedLeft.hasField ? buildStructuredContent(parsedLeft) : left;
    }

    const parsedLeft = parseStructuredContent(left);
    const parsedRight = parseStructuredContent(right);

    if (!parsedLeft.hasField && !parsedRight.hasField) {
        return mergeContentWithDedup(left, right);
    }

    mergeParsedStructuredContent(parsedLeft, parsedRight);
    return buildStructuredContent(parsedLeft);
}
