// utils/storylineValidator.js
// 故事线ID命名规范验证器 - 防止分类错乱

/**
 * 故事线验证器
 * 用途：强制执行ID命名规范，确保ID与分类匹配，从架构层面防止分类错误
 */
export class StorylineValidator {
    /**
     * ID前缀与分类的强制映射规则
     * 每个分类可以有多个匹配规则（正则表达式）
     */
    static CATEGORY_RULES = {
        // 主线任务：quest_main_* 或 quest_*（不含side）
        'main_quests': [
            /^quest_main_/i,                    // quest_main_investigate
            /^quest_(?!side_)[^_]+$/i          // quest_mystery（排除quest_side_）
        ],

        // 支线任务：quest_side_* 或 side_*
        'side_quests': [
            /^quest_side_/i,                    // quest_side_delivery
            /^side_/i                           // side_merchant_help
        ],

        // 关系弧光：arc_rel_*
        'relationship_arcs': [
            /^arc_rel_/i                        // arc_rel_protagonist_npc1
        ],

        // 个人弧光：arc_personal_* 或 arc_*（不含rel）
        'personal_arcs': [
            /^arc_personal_/i,                  // arc_personal_overcome_fear
            /^arc_(?!rel_)[^_]+$/i             // arc_growth（排除arc_rel_）
        ]
    };

    /**
     * 验证ID是否符合分类的命名规范
     * @param {string} storylineId - 故事线ID
     * @param {string} category - 目标分类
     * @returns {{valid: boolean, reason: string, suggestedCategory: string|null, confidence: number}}
     */
    static validateIdCategoryMatch(storylineId, category) {
        if (!storylineId || typeof storylineId !== 'string') {
            return {
                valid: false,
                reason: 'ID不能为空或非字符串',
                suggestedCategory: null,
                confidence: 0
            };
        }

        const rules = this.CATEGORY_RULES[category];

        if (!rules) {
            return {
                valid: false,
                reason: `未知分类: ${category}`,
                suggestedCategory: null,
                confidence: 0
            };
        }

        // 检查ID是否匹配该分类的任一规则
        const matches = rules.some(regex => regex.test(storylineId));

        if (matches) {
            return {
                valid: true,
                reason: '',
                suggestedCategory: null,
                confidence: 1.0
            };
        }

        // ID不匹配，尝试推断正确分类
        const inference = this.inferCategoryFromId(storylineId);

        return {
            valid: false,
            reason: `ID "${storylineId}" 不符合分类 "${category}" 的命名规范`,
            suggestedCategory: inference.category,
            confidence: inference.confidence
        };
    }

    /**
     * 从ID推断应该属于哪个分类
     * @param {string} storylineId
     * @returns {{category: string|null, confidence: number}}
     */
    static inferCategoryFromId(storylineId) {
        let bestMatch = null;
        let highestConfidence = 0;

        for (const [category, rules] of Object.entries(this.CATEGORY_RULES)) {
            for (let i = 0; i < rules.length; i++) {
                const regex = rules[i];
                if (regex.test(storylineId)) {
                    // 第一个规则（更具体的）有更高置信度
                    const confidence = 1.0 - (i * 0.2);
                    if (confidence > highestConfidence) {
                        bestMatch = category;
                        highestConfidence = confidence;
                    }
                }
            }
        }

        return {
            category: bestMatch,
            confidence: highestConfidence
        };
    }

    /**
     * 生成符合规范的ID
     * @param {string} category - 目标分类
     * @param {string} baseName - 基础名称
     * @returns {string}
     */
    static generateValidId(category, baseName) {
        const prefixes = {
            'main_quests': 'quest_main_',
            'side_quests': 'quest_side_',
            'relationship_arcs': 'arc_rel_',
            'personal_arcs': 'arc_personal_'
        };

        const prefix = prefixes[category] || 'unknown_';
        const cleanName = baseName
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_') // 保留中文、字母、数字
            .replace(/^_+|_+$/g, ''); // 去除首尾下划线

        return prefix + cleanName;
    }

    /**
     * 批量验证多个故事线
     * @param {Object} storylinesMap - {category: {id: data}}
     * @returns {{valid: Array, invalid: Array}}
     */
    static validateBatch(storylinesMap) {
        const valid = [];
        const invalid = [];

        for (const [category, storylines] of Object.entries(storylinesMap)) {
            for (const id of Object.keys(storylines)) {
                const result = this.validateIdCategoryMatch(id, category);

                if (result.valid) {
                    valid.push({ id, category });
                } else {
                    invalid.push({
                        id,
                        category,
                        reason: result.reason,
                        suggestedCategory: result.suggestedCategory,
                        confidence: result.confidence
                    });
                }
            }
        }

        return { valid, invalid };
    }

    /**
     * 获取分类的示例ID格式
     * @param {string} category
     * @returns {string}
     */
    static getExampleId(category) {
        const examples = {
            'main_quests': 'quest_main_investigate 或 quest_mystery',
            'side_quests': 'quest_side_delivery 或 side_merchant_help',
            'relationship_arcs': 'arc_rel_protagonist_npc1',
            'personal_arcs': 'arc_personal_overcome_fear 或 arc_growth'
        };

        return examples[category] || '无示例';
    }
}
