/**
 * FILE: fieldTranslator.js
 *
 * 字段名称翻译工具 - 将英文字段名翻译为简体中文
 * 确保前端展示完全使用简体中文
 *
 * @created 2025-12-10
 */

/**
 * 字段名称映射表（英文 -> 简体中文）
 */
export const FIELD_TRANSLATIONS = {
    // === 通用字段 ===
    'id': 'ID',
    'name': '名称',
    'title': '标题',
    'description': '描述',
    'summary': '摘要',
    'status': '状态',
    'type': '类型',
    'category': '分类',

    // === 角色字段 ===
    'core': '核心信息',
    'identity': '身份',
    'appearance': '外貌',
    'personality': '性格',
    'background': '背景',
    'goals': '目标',
    'capabilities': '能力',
    'equipment': '装备',
    'experiences': '经历',
    'secrets': '秘密',
    'social': '社交',
    'relationships': '关系',
    'isProtagonist': '是否主角',

    // === 关系字段 ===
    'participants': '参与者',
    'type_label': '类型标签',
    'relationship_label': '关系标签',
    'relation_type': '关系类型',
    'affinity': '好感度',
    'current_affinity': '当前好感度',
    'emotional_weight': '情感权重',
    'narrative_voltage': '叙事电压',
    'cognitive_gap': '认知差距',
    'conflict_source': '冲突来源',
    'personality_chemistry': '性格化学反应',
    'meeting_status': '见面状态',
    'separation_state': '分离状态',
    'last_interaction': '最后互动',
    'first_scene_together': '首次同场景',

    // === 故事线字段 ===
    'trigger': '触发条件',
    'objectives': '目标',
    'involved_entities': '相关实体',
    'involved_chars': '相关角色',
    'progress_milestones': '进度里程碑',
    'progress': '进度',
    'current_status': '当前状态',
    'current_summary': '当前摘要',
    'current_stage': '当前阶段',
    'advancement': '推进',
    'progress_delta': '进度增量',
    'new_stage': '新阶段',

    // === 世界观字段 ===
    'keywords': '关键词',
    'properties': '属性',
    'owner': '所有者',
    'ideology': '意识形态',
    'influence': '影响力',
    'significance': '重要性',
    'timeframe': '时间范围',
    'traits': '特征',

    // === 状态值 ===
    'active': '进行中',
    'completed': '已完成',
    'paused': '已暂停',
    'failed': '已失败',
    'pending': '待处理',

    // === 关系类型 ===
    'allies': '盟友',
    'friends': '朋友',
    'family': '家人',
    'romantic': '恋爱关系',
    'rivals': '竞争对手',
    'enemies': '敌人',
    'mentor_student': '师徒',
    'business': '商业伙伴',
    'acquaintance': '相识',
    'stranger': '陌生人',
    'childhood_friends': '青梅竹马',
    'enemies_to_lovers': '欢喜冤家',
    'forbidden_love': '禁忌之恋',
    'one_sided': '单恋',
    'complicated': '复杂关系',
    'stranger_with_history': '陌路旧识',

    // === 时间线字段 ===
    'timeline': '时间线',
    'history': '历史记录',
    'history_entry': '历史条目',
    'timestamp': '时间戳',
    'chapter': '章节',
    'reasoning': '推理',
    'change': '变化',
    'final_affinity': '最终好感度',
    'source_chapter_uid': '来源章节UID',

    // === 张力引擎 ===
    'tension_engine': '张力引擎',
    'narrative_status': '叙事状态',
    'major_events': '重大事件',

    // === 其他 ===
    'latest_reasoning': '最新推理',
    'dossier_updates': '档案更新',
    'updates': '更新',
    'creations': '创建',
    'narrative_advancement': '叙事推进',
    'weight': '权重',
    'impact_type': '影响类型'
};

/**
 * 翻译字段名为简体中文
 * @param {string} fieldName - 英文字段名
 * @returns {string} 简体中文字段名
 */
export function translateField(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') {
        return fieldName;
    }

    // 直接查找映射表
    if (FIELD_TRANSLATIONS[fieldName]) {
        return FIELD_TRANSLATIONS[fieldName];
    }

    // 如果没有找到，尝试驼峰命名转换
    // 例如: "currentStatus" -> "current_status" -> "当前状态"
    const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (FIELD_TRANSLATIONS[snakeCase]) {
        return FIELD_TRANSLATIONS[snakeCase];
    }

    // 如果还是没找到，返回美化后的原字段名
    // 例如: "some_field" -> "Some Field"
    return fieldName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * 批量翻译对象的键名
 * @param {Object} obj - 原始对象
 * @returns {Object} 键名已翻译的新对象
 */
export function translateObjectKeys(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }

    const translated = {};
    for (const [key, value] of Object.entries(obj)) {
        const translatedKey = translateField(key);
        translated[translatedKey] = value;
    }
    return translated;
}

/**
 * 获取字段的显示名称（带图标）
 * @param {string} fieldName - 字段名
 * @returns {Object} {icon: string, label: string}
 */
export function getFieldDisplay(fieldName) {
    const label = translateField(fieldName);
    const iconMap = {
        'affinity': 'heart',
        'emotional_weight': 'chart-line',
        'narrative_voltage': 'bolt',
        'cognitive_gap': 'brain',
        'conflict_source': 'fire',
        'personality_chemistry': 'flask',
        'timeline': 'clock',
        'history': 'clock-rotate-left',
        'trigger': 'bolt',
        'objectives': 'list-check',
        'progress': 'chart-bar',
        'status': 'circle-info'
    };

    return {
        icon: iconMap[fieldName] || 'circle',
        label
    };
}
