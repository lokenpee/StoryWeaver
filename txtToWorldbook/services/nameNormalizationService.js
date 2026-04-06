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
