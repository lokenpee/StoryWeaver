// src/constants.js

/**
 * 统一管理整个应用中使用的常量，避免“魔法字符串”，
 * 提高代码的可维护性和健壮性。
 */

// 业务事件类型
export const EVENT_TYPES = Object.freeze({
    PROMPT_BEFORE_SEND: 'prompt:before_send',
    RESPONSE_RECEIVED: 'response:received',
});

// 引擎的生命周期状态
export const ENGINE_STATUS = Object.freeze({
    IDLE: { text: '空闲', icon: 'fa-coffee' },
    BUSY_GENESIS: { text: '创世纪...', icon: 'fa-seedling' },
    BUSY_SYNCING: { text: '同步状态...', icon: 'fa-sync fa-spin' },
    BUSY_DIRECTING: { text: '导演决策中...', icon: 'fa-video fa-beat' },
    BUSY_ANALYZING: { text: '后台分析中...', icon: 'fa-magnifying-glass fa-beat' },
    BUSY_CONSOLIDATING: { text: '记忆固化中...', icon: 'fa-microchip fa-beat' },
    BUSY_PLANNING: { text: '规划新章节...', icon: 'fa-sitemap' },
        BUSY_TRANSITIONING: { text: '章节转换中...', icon: 'fa-hourglass-half fa-spin' },
});

// V7.0 叙事模式常量定义
export const NARRATIVE_MODES = Object.freeze({
    WEB_NOVEL: {
        id: 'web_novel',
        name: '网文模式',
        icon: 'fa-fire',
        description: '环环相扣、章章有梗、拒绝平淡'
    },
    CLASSIC_RPG: {
        id: 'classic_rpg',
        name: '正剧模式',
        icon: 'fa-masks-theater',
        description: '尊重叙事呼吸、允许留白、体验生活'
    }
});

// 网文模式强制约束类型
export const WEB_NOVEL_CONSTRAINTS = Object.freeze({
    FORBID_PURE_DAILY: 'forbid_pure_daily',
    FORBID_SLEEP_AFTER_SOLVE: 'forbid_sleep_after_solve',
    REQUIRE_SELLING_POINT: 'require_selling_point',
    REQUIRE_HOOK: 'require_hook',
    MIN_CONFLICT_COUNT: 'min_conflict_count'
});