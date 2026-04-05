// utils/affinityUtils.js

export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;

export const AFFINITY_STAGE_RULES = [
    {
        key: 'stranger_wary',
        label: '陌生/警惕',
        min: 0,
        max: 10,
        coreMindset: '中立、观察、保持距离或轻微怀疑。',
        behaviors: [
            '对话：使用礼貌、客套或公式化的语言，避免分享个人信息。',
            '行动：倾向于被动反应，而非主动发起互动，保持物理和心理上的距离。',
            '内在：将对方视为一个需要评估的未知因素。'
        ]
    },
    {
        key: 'acquaintance_neutral',
        label: '熟悉/中立',
        min: 11,
        max: 40,
        coreMindset: '基本信任已建立，但无特殊情感投入。',
        behaviors: [
            '对话：可以进行日常、非私密的交谈，可能回应一些简单的请求。',
            '行动：互动更加自然，但仍以事务性或偶然性为主。',
            '内在：将对方视为环境中的一个无害、普通的组成部分。'
        ]
    },
    {
        key: 'friendly_trusted',
        label: '友好/信任',
        min: 41,
        max: 70,
        coreMindset: '积极的正面情感，愿意建立联系。',
        behaviors: [
            '对话：语气更轻松、真诚。可能会主动开启话题，分享一些个人的观点或经历。',
            '行动：愿意主动提供举手之劳的帮助。非语言的积极信号增多（如微笑、更近的距离）。',
            '内在：将对方视为朋友或可靠的人，乐于与其相处。'
        ]
    },
    {
        key: 'close_reliant',
        label: '亲密/依赖',
        min: 71,
        max: 90,
        coreMindset: '深度信任，情感上的依赖和关心。',
        behaviors: [
            '对话：可能会分享秘密、展露脆弱的一面。对话中会表现出对你的关心和担忧。',
            '行动：会主动为你考虑，提供重要的帮助，甚至在一定程度上为你承担风险。',
            '内在：将你的福祉纳入自己的考量范围，你的情绪会影响到TA。'
        ]
    },
    {
        key: 'bonded_protective',
        label: '羁绊/守护',
        min: 91,
        max: 100,
        coreMindset: '深刻的情感连接，将对方视为自己的一部分。',
        behaviors: [
            '对话：言语中充满不言而喻的默契和深层理解。',
            '行动：将保护你、实现你的愿望视为最高优先级之一，可能会做出自我牺牲的行为。',
            '内在：你的存在本身就是TA行动的核心动机之一。'
        ]
    }
];

export function clampAffinityValue(value, fallback = null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    const rounded = Math.round(numeric);
    return Math.min(AFFINITY_MAX, Math.max(AFFINITY_MIN, rounded));
}

export function getAffinityStageByValue(value) {
    const normalized = clampAffinityValue(value, null);
    if (normalized === null || normalized === undefined) {
        return null;
    }
    const stage =
        AFFINITY_STAGE_RULES.find(rule => normalized >= rule.min && normalized <= rule.max) ??
        AFFINITY_STAGE_RULES[AFFINITY_STAGE_RULES.length - 1];
    return { ...stage, value: normalized };
}

export function describeAffinityStage(value) {
    const stage = getAffinityStageByValue(value);
    if (!stage) {
        return null;
    }
    const behaviorSummary = stage.behaviors.join('；');
    return `【${stage.label}】核心心态：${stage.coreMindset}；普适行为准则：${behaviorSummary}`;
}
