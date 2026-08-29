export const DEFAULT_CHAPTER_SPLIT_TYPE = 'goal_shift';

export const CHAPTER_SPLIT_TYPES = Object.freeze([
    'scene_change',
    'time_jump',
    'goal_shift',
    'conflict_closed',
]);

export const LEGACY_CHAPTER_SPLIT_TYPE_MAP = Object.freeze({
    scene_switch: 'scene_change',
    situation_change: 'scene_change',
    action_closed: 'conflict_closed',
    dialogue_closed: 'conflict_closed',
    plot_twist: 'conflict_closed',
    perspective_switch: 'scene_change',
    relationship_shift: 'conflict_closed',
    revelation: 'conflict_closed',
    decision_point: 'goal_shift',
    emotional_turn: 'conflict_closed',
    interaction_point: 'goal_shift',
    scene_change: 'scene_change',
    time_skip: 'time_jump',
    time_jump: 'time_jump',
    goal_shift: 'goal_shift',
    conflict_closed: 'conflict_closed',
    '场景明显切换': 'scene_change',
    '时间明显跳转': 'time_jump',
    '人物核心目标完全改变': 'goal_shift',
    '完整冲突闭环结束': 'conflict_closed',
    '一个完整冲突/行动闭环结束': 'conflict_closed',
});

const chapterSplitTypeSet = new Set(CHAPTER_SPLIT_TYPES);

export function normalizeChapterSplitType(type) {
    const raw = String(type || '').trim();
    if (chapterSplitTypeSet.has(raw)) return raw;
    return LEGACY_CHAPTER_SPLIT_TYPE_MAP[raw] || DEFAULT_CHAPTER_SPLIT_TYPE;
}
