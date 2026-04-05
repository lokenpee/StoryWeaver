// utils/dossierSchema.js

const DEFAULT_SCHEMA_VERSION = 1;

const BUILTIN_FIELDS = [
    { key: 'appearance', label: '外貌特征', type: 'text', icon: 'fa-eye' },
    { key: 'personality', label: '性格心理', type: 'text', icon: 'fa-brain' },
    { key: 'background', label: '背景故事', type: 'text', icon: 'fa-book' },
    { key: 'goals', label: '目标与动机', type: 'text', icon: 'fa-bullseye' },
    { key: 'capabilities', label: '能力与技能', type: 'text', icon: 'fa-wand-sparkles' },
    { key: 'equipment', label: '装备资源', type: 'text', icon: 'fa-shield-halved' },
    { key: 'social', label: '归属与声望', type: 'text', icon: 'fa-flag' },
    { key: 'experiences', label: '经历与成长', type: 'text', icon: 'fa-clock-rotate-left' },
    { key: 'secrets', label: '秘密信息', type: 'text', icon: 'fa-key' }
];

const BUILTIN_KEY_SET = new Set(BUILTIN_FIELDS.map(field => field.key));

export const DOSSIER_FIELD_TYPES = ['text', 'tags'];

export const getDefaultDossierSchema = () => ({
    version: DEFAULT_SCHEMA_VERSION,
    fields: BUILTIN_FIELDS.map(field => ({ ...field, builtin: true }))
});

export const sanitizeDossierKey = (raw) => {
    if (!raw) return '';
    const safe = String(raw)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe;
};

export const normalizeDossierSchema = (schema) => {
    if (!schema || typeof schema !== 'object' || !Array.isArray(schema.fields)) {
        return getDefaultDossierSchema();
    }
    const normalized = {
        version: DEFAULT_SCHEMA_VERSION,
        fields: []
    };
    const seenKeys = new Set();
    schema.fields.forEach((field) => {
        if (!field || typeof field !== 'object') return;
        const rawKey = field.key || '';
        const key = sanitizeDossierKey(rawKey);
        if (!key || seenKeys.has(key)) return;
        const builtin = field.builtin === true || BUILTIN_KEY_SET.has(key);
        const type = DOSSIER_FIELD_TYPES.includes(field.type) ? field.type : 'text';
        const label = String(field.label || '').trim() || (BUILTIN_FIELDS.find(f => f.key === key)?.label) || key;
        const icon = (field.icon || BUILTIN_FIELDS.find(f => f.key === key)?.icon || 'fa-clipboard-list');
        normalized.fields.push({ key, label, type, builtin, icon });
        seenKeys.add(key);
    });
    return normalized;
};

export const formatDossierSchemaForPrompt = (schema) => {
    const normalized = normalizeDossierSchema(schema);
    const customFields = normalized.fields.filter(field => !field.builtin && field.key !== 'social');
    if (customFields.length === 0) {
        return '（无自定义字段）';
    }
    return customFields
        .map(field => `- custom.${field.key}: ${field.label} (${field.type === 'tags' ? '标签数组' : '文本'})`)
        .join('\n');
};

