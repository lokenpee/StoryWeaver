// FILE: src/utils/SbtEditToDelta.js

const WORLDVIEW_CATEGORIES = new Set([
    'locations',
    'items',
    'factions',
    'concepts',
    'events',
    'races'
]);

const STORYLINE_CATEGORIES = new Set([
    'main_quests',
    'side_quests',
    'relationship_arcs',
    'personal_arcs'
]);

const ensureObject = (root, key) => {
    if (!root[key] || typeof root[key] !== 'object') {
        root[key] = {};
    }
    return root[key];
};

const ensurePath = (root, pathParts) => {
    let cursor = root;
    pathParts.forEach((part) => {
        cursor = ensureObject(cursor, part);
    });
    return cursor;
};

const normalizeCategory = (category) => {
    if (!category) return '';
    return String(category).trim();
};

const normalizeWorldviewCategory = (category) => {
    const normalized = normalizeCategory(category);
    if (normalized.startsWith('worldview.')) {
        return normalized.slice('worldview.'.length);
    }
    if (WORLDVIEW_CATEGORIES.has(normalized)) return normalized;
    return '';
};

const normalizeStorylineCategory = (category) => {
    const normalized = normalizeCategory(category);
    if (normalized.startsWith('storylines.')) {
        return normalized.slice('storylines.'.length);
    }
    if (STORYLINE_CATEGORIES.has(normalized)) return normalized;
    return '';
};

const flattenToDotPaths = (obj, prefix = '', output = {}) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        output[prefix] = obj;
        return output;
    }
    Object.entries(obj).forEach(([key, value]) => {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenToDotPaths(value, next, output);
        } else {
            output[next] = value;
        }
    });
    return output;
};

const expandDotPaths = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    const result = {};
    Object.entries(obj).forEach(([key, value]) => {
        if (key.includes('.')) {
            const parts = key.split('.');
            let cursor = result;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    cursor[part] = value;
                } else {
                    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
                        cursor[part] = {};
                    }
                    cursor = cursor[part];
                }
            }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = expandDotPaths(value);
        } else {
            result[key] = value;
        }
    });
    return result;
};

export const commandsToDelta = (commands = [], options = {}) => {
    const warn = options.warn || (() => {});
    const delta = {};

    const ensureCreationsStatic = () => {
        const creations = ensureObject(delta, 'creations');
        return ensureObject(creations, 'staticMatrices');
    };

    const ensureUpdates = () => ensureObject(delta, 'updates');

    commands.forEach((command) => {
        const { name, args } = command;
        switch (name) {
            case 'createEntity': {
                const [category, id, data] = args;
                const normalized = normalizeCategory(category);
                if (!normalized || !id || !data) {
                    warn(`createEntity skipped: invalid args`);
                    return;
                }
                const creations = ensureCreationsStatic();
                if (normalized === 'characters') {
                    ensurePath(creations, ['characters'])[id] = data;
                    return;
                }
                const worldCategory = normalizeWorldviewCategory(normalized);
                if (worldCategory) {
                    ensurePath(creations, ['worldview', worldCategory])[id] = data;
                    return;
                }
                const storyCategory = normalizeStorylineCategory(normalized);
                if (storyCategory) {
                    ensurePath(creations, ['storylines', storyCategory])[id] = data;
                    return;
                }
                if (normalized === 'relationship_graph') {
                    const graph = ensurePath(creations, ['relationship_graph']);
                    if (!Array.isArray(graph.edges)) graph.edges = [];
                    graph.edges.push(data);
                    return;
                }
                warn(`createEntity skipped: unknown category ${normalized}`);
                return;
            }
            case 'updateEntity': {
                const [category, id, data] = args;
                const normalized = normalizeCategory(category);
                if (!normalized || !id || !data) {
                    warn(`updateEntity skipped: invalid args`);
                    return;
                }
                const normalizedData = expandDotPaths(data);
                const updates = ensureUpdates();
                if (normalized === 'characters') {
                    ensurePath(updates, ['characters'])[id] = normalizedData;
                    return;
                }
                const worldCategory = normalizeWorldviewCategory(normalized);
                if (worldCategory) {
                    ensurePath(updates, ['worldview', worldCategory])[id] = normalizedData;
                    return;
                }
                warn(`updateEntity skipped: unknown category ${normalized}`);
                return;
            }
            case 'keepEntity': {
                const [category, id] = args;
                const normalized = normalizeCategory(category);
                if (!normalized || !id) {
                    warn(`keepEntity skipped: invalid args`);
                }
                return;
            }
            case 'deleteEntity': {
                warn(`deleteEntity ignored: deletion not supported`);
                return;
            }
            case 'updateStoryline': {
                const [category, id, data] = args;
                const storyCategory = normalizeStorylineCategory(category);
                if (!storyCategory || !id || !data) {
                    warn(`updateStoryline skipped: invalid args`);
                    return;
                }
                const updates = ensureUpdates();
                ensurePath(updates, ['storylines', storyCategory])[id] = data;
                return;
            }
            case 'keepStoryline': {
                const [category, id] = args;
                const storyCategory = normalizeStorylineCategory(category);
                if (!storyCategory || !id) {
                    warn(`keepStoryline skipped: invalid args`);
                }
                return;
            }
            case 'appendRelationshipEdge': {
                const [data] = args;
                if (!data || typeof data !== 'object') {
                    warn(`appendRelationshipEdge skipped: invalid args`);
                    return;
                }
                const creations = ensureCreationsStatic();
                const graph = ensurePath(creations, ['relationship_graph']);
                if (!Array.isArray(graph.edges)) graph.edges = [];
                graph.edges.push(data);
                return;
            }
            case 'updateRelationshipEdge': {
                const [edgeId, data] = args;
                if (!edgeId || !data || typeof data !== 'object') {
                    warn(`updateRelationshipEdge skipped: invalid args`);
                    return;
                }
                if (!Array.isArray(delta.relationship_updates)) {
                    delta.relationship_updates = [];
                }
                const updates = flattenToDotPaths(data);
                delta.relationship_updates.push({
                    relationship_id: edgeId,
                    updates
                });
                return;
            }
            case 'updateCharacterRelationship': {
                const [charId, targetId, data] = args;
                if (!charId || !targetId || !data || typeof data !== 'object') {
                    warn(`updateCharacterRelationship skipped: invalid args`);
                    return;
                }
                const updates = ensureUpdates();
                ensurePath(updates, ['characters', charId, 'social', 'relationships'])[targetId] = data;
                return;
            }
            case 'updateChronology': {
                const [data] = args;
                if (!data || typeof data !== 'object') {
                    warn(`updateChronology skipped: invalid args`);
                    return;
                }
                delta.chronology_update = data;
                return;
            }
            case 'setLongTermSummary': {
                const [text] = args;
                if (typeof text !== 'string') {
                    warn(`setLongTermSummary skipped: invalid args`);
                    return;
                }
                delta.new_long_term_summary = text;
                return;
            }
            default:
                warn(`unknown_command:${name}`);
        }
    });

    return delta;
};
