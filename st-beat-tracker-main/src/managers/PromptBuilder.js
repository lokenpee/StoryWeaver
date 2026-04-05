/**
 * PromptBuilder - 提示词构建管理器
 *
 * 负责构建各类AI提示词，包括系统提示、执导指令、叙事约束等
 *
 * @file src/managers/PromptBuilder.js
 * @module PromptBuilder
 * @author Claude (重构自 StoryBeatEngine.js)
 * @date 2025-12-07
 */

import { DIRECTOR_RULEBOOK_PROMPT, AFFINITY_BEHAVIOR_MATRIX_PROMPT } from '../../ai/prompt_templates.js';

/**
 * 提示词构建管理器类
 *
 * @class PromptBuilder
 * @example
 * const systemPrompt = PromptBuilder.buildRegularSystemPrompt(currentChapter);
 * const directorInstructions = PromptBuilder.buildHardcodedDirectorInstructions(0, currentBeat, allBeats);
 */
export class PromptBuilder {
    /**
     * 将好感度数值转换为详细的行为准则描述
     *
     * @static
     * @param {number} affinity - 好感度数值 (0-100)
     * @returns {Object} 包含阶段名称和行为准则的对象
     * @returns {string} .stage - 阶段名称（中英文）
     * @returns {string} .description - 详细的行为准则描述
     */
    static getAffinityBehaviorGuideline(affinity) {
        if (affinity <= 10) {
            return {
                stage: "陌生/警惕 (Stranger/Wary)",
                description: `**核心心态**: 中立、观察、保持距离或轻微怀疑。
**普适行为准则**:
  - 对话：使用礼貌、客套或公式化的语言。避免分享个人信息。
  - 行动：倾向于被动反应，而非主动发起互动。保持物理和心理上的距离。
  - 内在：将对方视为一个需要评估的未知因素。`
            };
        } else if (affinity <= 40) {
            return {
                stage: "熟悉/中立 (Acquaintance/Neutral)",
                description: `**核心心态**: 基本信任已建立，但无特殊情感投入。
**普适行为准则**:
  - 对话：可以进行日常、非私密的交谈。可能会回应一些简单的请求。
  - 行动：互动更加自然，但仍以事务性或偶然性为主。
  - 内在：将对方视为环境中的一个无害、普通的组成部分。`
            };
        } else if (affinity <= 70) {
            return {
                stage: "友好/信任 (Friendly/Trusted)",
                description: `**核心心态**: 积极的正面情感，愿意建立联系。
**普适行为准则**:
  - 对话：语气更轻松、真诚。可能会主动开启话题，分享一些个人的观点或经历。
  - 行动：愿意主动提供举手之劳的帮助。非语言的积极信号增多（如微笑、更近的距离）。
  - 内在：将对方视为"朋友"或"可靠的人"，乐于与其相处。`
            };
        } else if (affinity <= 90) {
            return {
                stage: "亲密/依赖 (Close/Reliant)",
                description: `**核心心态**: 深度信任，情感上的依赖和关心。
**普适行为准则**:
  - 对话：可能会分享秘密、展露脆弱的一面。对话中会表现出对你的关心和担忧。
  - 行动：会主动为你考虑，提供重要的帮助，甚至在一定程度上为你承担风险。
  - 内在：将你的福祉纳入自己的考量范围，你的情绪会影响到TA。`
            };
        } else {
            return {
                stage: "羁绊/守护 (Bonded/Protective)",
                description: `**核心心态**: 深刻的情感连接，将对方视为自己的一部分。
**普适行为准则**:
  - 对话：言语中充满不言而喻的默契和深层理解。
  - 行动：将保护你、实现你的愿望视为最高优先级之一，可能会做出自我牺牲的行为。
  - 内在：你的存在本身就是TA行动的核心动机之一。`
            };
        }
    }
    /**
     * 构建关系指南
     *
     * 根据章节中的角色关系数据，生成关系指南提示词
     *
     * @static
     * @param {Object} currentChapter - 当前章节对象
     * @param {Object} currentChapter.staticMatrices - 静态矩阵数据
     * @param {Object} currentChapter.staticMatrices.characters - 角色数据
     * @param {Object} currentChapter.dynamicState - 动态状态数据
     * @param {Object} currentChapter.dynamicState.characters - 动态角色数据
     * @returns {string} 关系指南提示词
     *
     * @example
     * const relationshipGuide = PromptBuilder.buildRelationshipGuide(currentChapter);
     */
    static buildRelationshipGuide(currentChapter) {
        let guide = AFFINITY_BEHAVIOR_MATRIX_PROMPT;

        const characters = currentChapter.staticMatrices.characters || {};
        const protagonistId = Object.keys(characters).find(
            id => characters[id].isProtagonist
        );

        if (!protagonistId) {
            guide += "错误：未找到主角信息。\n";
            return guide;
        }

        // 从新数据模型中提取关系：遍历所有NPC对主角的关系
        let hasRelations = false;
        for (const charId in characters) {
            if (charId === protagonistId) continue; // 跳过主角自己

            // 优先使用动态关系，回退到静态关系
            const dynamicRel = currentChapter.dynamicState.characters?.[charId]?.relationships?.[protagonistId];
            const staticRel = characters[charId]?.relationships?.[protagonistId];

            const affinity = dynamicRel?.current_affinity ?? staticRel?.affinity;
            if (affinity !== undefined) {
                hasRelations = true;
                const charName = characters[charId]?.name || charId;

                // 使用新的转换函数获取详细的行为准则
                const guideline = PromptBuilder.getAffinityBehaviorGuideline(affinity);

                guide += `\n### **${charName} 对你的看法**\n`;
                guide += `**好感度数值:** ${affinity}/100\n`;
                guide += `**当前阶段:** ${guideline.stage}\n\n`;
                guide += `${guideline.description}\n`;
            }
        }

        if (!hasRelations) {
            guide += "你与其他角色的关系网络尚未建立。\n";
        }
        return guide;
    }

    /**
     * 构建常规系统提示词
     *
     * 包含核心法则和关系指南
     *
     * @static
     * @param {Object} currentChapter - 当前章节对象
     * @returns {string} 系统提示词
     *
     * @example
     * const systemPrompt = PromptBuilder.buildRegularSystemPrompt(currentChapter);
     */
    static buildRegularSystemPrompt(currentChapter) {
        const relationshipGuide = PromptBuilder.buildRelationshipGuide(currentChapter);

        return [
            DIRECTOR_RULEBOOK_PROMPT,
            relationshipGuide
        ].join('\n\n---\n\n');
    }

    /**
     * 构建硬编码的执导指令
     *
     * V9.0 新增：不再由裁判AI生成，而是系统硬编码
     *
     * @static
     * @param {number} currentBeatIdx - 当前节拍索引
     * @param {Object} currentBeat - 当前节拍对象
     * @param {Array} beats - 所有节拍数组
     * @returns {string} 格式化的执导指令
     *
     * @example
     * const instructions = PromptBuilder.buildHardcodedDirectorInstructions(0, currentBeat, allBeats);
     */
    static buildHardcodedDirectorInstructions(currentBeatIdx, currentBeat, beats, options = {}) {
        const nextBeat = beats[currentBeatIdx + 1];
        const beatDescription = currentBeat?.physical_event || currentBeat?.description || '未知节拍';
        const isHighlight = currentBeat?.is_highlight === true;
        const typeMap = {
            Hybrid_Scene: '混合场景',
            Dialogue_Scene: '对话场景',
            Action: '动作场景',
            Exposition: '说明场景',
            Transition: '过渡场景'
        };
        const beatTypeLabel = typeMap[currentBeat?.type] || currentBeat?.type || '未知';
        const environmentState = currentBeat?.environment_state || '';
        const subtextDesign = currentBeat?.subtext_design || '';
        const exitCondition = currentBeat?.exit_condition || '';

        const sections = [
            `# 🎬 【本回合剧情目标】`,
            ``,
            `## 当前剧情进度`,
            `- **当前节拍（索引 ${currentBeatIdx}）：** ${beatDescription}`,
            ``,
            `## 当前节拍详情`,
            `- **场景类型:** ${beatTypeLabel}`,
            `- **本回合需要完成的剧情大纲:** ${beatDescription}`,
            `- **环境状态:** ${environmentState}`,
            `- **潜台词方向:** ${subtextDesign}`,
            ``
        ];

        // 🌟 高光节点特殊指令
        if (isHighlight) {
            sections.push(
                `## ⚠️ 【★ 高光时刻】`,
                ``,
                `本节拍是本章的情感支点，请不计篇幅成本地详细演绎：`,
                `- 充分展开情感细节和内心活动`,
                `- 使用丰富的感官描写`,
                `- 允许使用更长的篇幅来刻画这一关键时刻`,
                ``
            );
        }

        sections.push(
            `## 执导原则（必须严格遵守）`,
            ``,
            `### 1. 节点判定的宽容性`,
            `- 只要玩家的行为在**意图**上符合当前节拍，即可推进`,
            `- 不要死板纠结字面细节，理解玩家的真实意图`,
            ``,
            `### 2. 对话节点必须等待玩家参与`,
            `- 如果当前节拍涉及对话或互动，必须等待玩家的实质性回应`,
            `- 不要自问自答，不要替玩家做决定`,
            ``,
            `### 3. 信息迷雾协议（防止剧透）`,
            `- **你只能看到当前节拍及之前的内容**`,
            `- 未来的节拍已被物理删除，你无法提前描写`,
            `- 专注于当前节拍的演绎，不要猜测或暗示后续内容`,
            ``,
            `### 4. 停止位置`,
            `- **本回合目标:** 完成当前节拍（索引 ${currentBeatIdx}）`,
            `- **停止位置:** 在当前节拍的核心事件完成后结束`,
            `- 可以自然延伸对话和互动，但不要触发下一节拍的核心事件`,
            ``
        );

        return sections.join('\n');
    }

    /**
     * Build STAY-mode turn instructions (scene retention).
     *
     * @static
     * @param {number} currentBeatIdx
     * @param {Object} currentBeat
     * @param {Object} nextBeat
     * @param {Array} beats
     * @param {Object} options
     * @param {string} options.logicSafetyWarning
     * @returns {string}
     */
    static buildStayPrompt(currentBeatIdx, currentBeat, nextBeat, beats, options = {}) {
        const compactPreview = (value, maxLen = 120) => {
            if (!value) return '无';
            const text = String(value).trim();
            if (!text) return '无';
            return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
        };

        const prevBeat = Number.isInteger(currentBeatIdx) && currentBeatIdx > 0
            ? beats[currentBeatIdx - 1]
            : null;
        const prevPreview = prevBeat?.physical_event || prevBeat?.summary || prevBeat?.description || '无';
        const prevIdxLabel = prevBeat ? currentBeatIdx - 1 : '无';

        const nextPreview = nextBeat?.physical_event || nextBeat?.summary || nextBeat?.description || '无';
        const nextIdxLabel = nextBeat ? currentBeatIdx + 1 : '无';

        const warningRaw = options?.logicSafetyWarning;
        const warning = typeof warningRaw === 'string' ? warningRaw.trim() : '';

        const header = [
            '# 滞留模式：场景驻留与延展',
            '',
            '核心指令：',
            `- 锁定范围：只在当前节拍内描写（索引 ${currentBeatIdx}）。`,
            '- 禁止进入下一节拍或结束场景。',
            '- 当用户意图支持时，可在当前节拍内延伸/扩写。',
            '- 允许在当前节拍内推进时间（例如吃饭延续到下午），但不得与下一节拍冲突。',
            '- 重点回应用户互动、内心活动、感官细节。',
            '',
            '节拍上下文（只读）：',
            `- 上一节拍预览（索引 ${prevIdxLabel}）：${compactPreview(prevPreview)}`,
            `- 下一节拍预览（索引 ${nextIdxLabel}）：${compactPreview(nextPreview)}`,
            '',
            '逻辑防火墙（只读）：',
            '- 禁止剧透或暗示下一节拍。',
            '- 当前描写不得破坏下一节拍的前提条件。'
        ];

        if (warning && warning !== 'NONE' && warning !== '无') {
            header.push(`- 逻辑安全警告：${warning}`);
        }

        header.push('');
        const base = PromptBuilder.buildHardcodedDirectorInstructions(currentBeatIdx, currentBeat, beats);
        return header.join('\n') + '\n' + base;
    }

    /**
     * Build SWITCH-mode turn instructions (narrative advance).
     *
     * @static
     * @param {Object} previousBeat
     * @param {Object} nextBeat
     * @param {number} nextBeatIdx
     * @param {Array} beats
     * @returns {string}
     */
    static buildSwitchPrompt(previousBeat, nextBeat, nextBeatIdx, beats) {
        const compactPreview = (value, maxLen = 120) => {
            if (!value) return '无';
            const text = String(value).trim();
            if (!text) return '无';
            return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
        };

        const exitCondition = previousBeat?.exit_condition || '无';
        const prevPreview = previousBeat?.physical_event || previousBeat?.summary || previousBeat?.description || '无';
        const prevIdxLabel = Number.isInteger(nextBeatIdx) ? nextBeatIdx - 1 : '无';

        const followingBeat = Number.isInteger(nextBeatIdx) ? beats[nextBeatIdx + 1] : null;
        const followingPreview = followingBeat?.physical_event || followingBeat?.summary || followingBeat?.description || '无';
        const followingIdxLabel = followingBeat ? nextBeatIdx + 1 : '无';

        const header = [
            '# 切换模式：剧情推进',
            '',
            '- 过渡：用 1-2 句话自然收束上一场景。',
            `- 如有必要，遵循退出条件：${exitCondition}`,
            '- 立即进入新节拍。',
            '- 重点建立新场景（详见下方“本回合剧情目标”）。',
            '',
            '节拍上下文（只读）：',
            `- 上一节拍预览（索引 ${prevIdxLabel}）：${compactPreview(prevPreview)}`,
            `- 下一节拍预览（索引 ${followingIdxLabel}）：${compactPreview(followingPreview)}`,
            ''
        ];

        const base = PromptBuilder.buildHardcodedDirectorInstructions(nextBeatIdx, nextBeat, beats);
        return header.join('\n') + '\n' + base;
    }

    /**
     * 格式化微指令
     *
     * 提取校准提示（如果存在）
     *
     * @static
     * @param {Object} instruction - 微指令对象
     * @param {string} instruction.corrective_action - 校准行动
     * @returns {string} 格式化后的微指令，或空字符串
     *
     * @example
     * const formatted = PromptBuilder.formatMicroInstruction({ corrective_action: '加快节奏' });
     */
    static formatMicroInstruction(instruction) {
        // 如果输入无效，返回空字符串（主要内容已在 buildStrictNarrativeConstraints 中输出）
        if (!instruction || typeof instruction !== 'object') {
            return "";
        }
        const { corrective_action } = instruction;
        // 如果是校准指令，显示校准提示
        if (corrective_action && corrective_action.toLowerCase() !== '无 (none)') {
            return `**校准提示:** ${corrective_action}`;
        }

        // 常规情况下返回空，因为主要内容已在 buildStrictNarrativeConstraints 中
        return "";
    }

    /**
     * 构建强化叙事约束
     *
     * V4.2: 方案三 - Prompt强化
     * V8.1: 添加润滑策略传递 - 当社交摩擦力为高/极高时，将润滑策略发送给演绎AI
     * V8.2: 高光时刻强制执行 - 检测到★高光标记时，将"建议"改为"要求"
     *
     * @static
     * @param {string} currentBeat - 当前节拍描述
     * @param {Object} microInstruction - 微指令对象
     * @param {string} microInstruction.scope_limit - 演绎边界
     * @param {string} microInstruction.narrative_goal - 叙事目标
     * @param {Object} commonSenseReview - 常识审查对象
     * @param {string} commonSenseReview.social_friction_level - 社交摩擦力等级
     * @param {string} commonSenseReview.lubrication_strategy - 润滑策略
     * @returns {string} 格式化的叙事约束
     *
     * @example
     * const constraints = PromptBuilder.buildStrictNarrativeConstraints(
     *   '主角进入酒馆',
     *   { scope_limit: '限于酒馆内部', narrative_goal: '展现环境氛围' },
     *   { social_friction_level: '高', lubrication_strategy: '先观察再互动' }
     * );
     */
    static buildStrictNarrativeConstraints(currentBeat, microInstruction, commonSenseReview) {
        const scopeLimit = microInstruction?.scope_limit || '未定义';
        const narrativeGoal = microInstruction?.narrative_goal || '按照当前节拍自由演绎。';

        // 【V8.2 新增】检测是否为高光时刻
        const isHighlightMoment = narrativeGoal.includes('【★ 高光时刻】');

        let constraints = [
            `**当前节拍:** ${currentBeat}`
        ];

        // 【V8.2 新增】高光时刻时，scope_limit 升维为强制约束
        if (isHighlightMoment) {
            constraints.push(`**演绎边界（★强制约束）:** ${scopeLimit}`);
        } else {
            constraints.push(`**演绎边界:** ${scopeLimit}`);
        }

        constraints.push(``);

        // 【V8.1 新增】检查社交摩擦力，如果为高/极高，则添加润滑策略
        if (commonSenseReview && typeof commonSenseReview === 'object') {
            const frictionLevel = commonSenseReview.social_friction_level;
            const lubricationStrategy = commonSenseReview.lubrication_strategy;

            if ((frictionLevel === '高' || frictionLevel === '极高') &&
                lubricationStrategy &&
                lubricationStrategy.trim() !== '' &&
                lubricationStrategy !== '无需润滑') {

                // 添加润滑策略到叙事建议之前
                constraints.push(`**【社交摩擦力润滑方案】** ${lubricationStrategy}`);
                constraints.push(``);
            }
        }

        // 【V8.2 新增】高光时刻使用强制语气
        if (isHighlightMoment) {
            constraints.push(`**导演要求（★高光时刻 - 强制执行）:** ${narrativeGoal}`);
        } else {
            constraints.push(`**叙事建议:** ${narrativeGoal}`);
        }

        return constraints.join('\n');
    }
}
