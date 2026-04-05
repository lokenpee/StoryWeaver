// ai/turnConductorAgent.js

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { createLogger } from '../utils/logger.js';
import { sbtConsole } from '../utils/sbtConsole.js';

const logger = createLogger('回合裁判');

export class TurnConductorAgent extends Agent {

    constructor(...args) {
        super(...args);
        // 获取promptManager实例
        this.promptManager = null;
    }

    /**
     * 注入promptManager实例
     * @param {PromptManager} manager - 提示词管理器实例
     */
    setPromptManager(manager) {
        this.promptManager = manager;
    }

    /**
     * 获取完整的默认提示词（包含示例数据，用于导出）
     * @returns {string} 完整的默认提示词
     */
    getCompleteDefaultPrompt() {
        // 创建示例上下文数据用于生成完整模板
        const exampleContext = {
            lastExchange: '[EXAMPLE] Recent AI/User exchange',
            userLastMessage: 'Example user input',
            currentBeatIdx: 0,
            currentBeat: { physical_event: 'Example Beat A (Current)' },
            nextBeat: { physical_event: 'Example Beat B (Next)' },
            chapterBlueprint: {
                title: 'Example Chapter',
                plot_beats: ['Example Beat 1', 'Example Beat 2']
            },
            staticMatrices: {
                characters: {},
                worldview: {},
                items: {},
                locations: {}
            },
            stylisticArchive: {
                imagery_and_metaphors: [],
                frequent_descriptors: { adjectives: [], adverbs: [] },
                sensory_patterns: []
            },
            narrativeRhythmClock: {
                current_phase: "inhale",
                cycle_count: 0,
                current_phase_duration: 0
            }
        };

        // 调用_createPrompt生成完整模板（带示例数据）
        return this._createPrompt(exampleContext);
    }

    async execute(context) {
        this.diagnose(`--- TurnConductor V11.0 (Navigation Gate + GPS/Fallback) START ---`);

        const {
            lastExchange,
            chapterBlueprint,
            chapter,
            currentBeat,
            nextBeat,
            currentBeatIdx,
            userLastMessage
        } = context;

        const prompt = this._createPrompt({
            lastExchange,
            chapterBlueprint,
            staticMatrices: chapter?.staticMatrices || {},
            currentBeat,
            nextBeat,
            currentBeatIdx,
            userLastMessage
        });

        sbtConsole.groupCollapsed('[SBT-DIAGNOSE] TurnConductor Prompt V11.0');
        logger.debug(prompt);
        sbtConsole.groupEnd();

        try {
            const responseText = await this.deps.conductorLlmService.callLLM(
                [{ role: 'user', content: prompt }]
            );

            const strippedResponse = this._stripLogicCheckBlock(responseText);
            const hasJsonMarkers = typeof strippedResponse === 'string'
                && (strippedResponse.includes('```json') || strippedResponse.includes('{'));

            if (!hasJsonMarkers) {
                this.warn('[CONDUCTOR-V11] No JSON detected in response. Falling back to STAY.');
                return {
                    navigation_decision: "STAY",
                    reasoning: "fallback: no JSON in response",
                    logic_safety_warning: 'NONE',
                    status: "CONTINUE",
                    current_beat_idx: Number.isFinite(Number(currentBeatIdx)) ? Number(currentBeatIdx) : 0,
                    narrative_hold: 'NONE',
                    tone_correction: null,
                    beat_completion_analysis: 'NO_JSON',
                    realtime_context_ids: []
                };
            }

            const decision = this.extractJsonFromString(strippedResponse);
            if (!decision || typeof decision !== 'object') {
                this.warn('[CONDUCTOR-V11] Invalid JSON decision. Falling back to STAY.');
                return {
                    navigation_decision: "STAY",
                    reasoning: "fallback: invalid or missing JSON",
                    logic_safety_warning: 'NONE',
                    status: "CONTINUE",
                    current_beat_idx: Number.isFinite(Number(currentBeatIdx)) ? Number(currentBeatIdx) : 0,
                    narrative_hold: 'NONE',
                    tone_correction: null,
                    beat_completion_analysis: 'INVALID_JSON',
                    realtime_context_ids: []
                };
            }

            const rawNavigationDecision = typeof decision.navigation_decision === 'string'
                ? decision.navigation_decision.trim()
                : '';

            const mapNavigationDecision = (value) => {
                if (!value) return '';
                const upperValue = value.toUpperCase();
                if (upperValue === 'STAY' || upperValue === 'SWITCH') {
                    return upperValue;
                }
                const stayKeywords = ['停留', '滞留', '保持', '留在', '驻留', '继续', '不切换', '不推进', '不前进'];
                const switchKeywords = ['切换', '推进', '前进', '进入', '下一步', '下一个', '转入', '转换'];

                if (stayKeywords.some(keyword => value.includes(keyword))) {
                    return 'STAY';
                }
                if (switchKeywords.some(keyword => value.includes(keyword))) {
                    return 'SWITCH';
                }
                return '';
            };

            let navigationDecision = mapNavigationDecision(rawNavigationDecision);

            if (navigationDecision != 'STAY' && navigationDecision != 'SWITCH') {
                if (Number.isFinite(Number(decision.current_beat_idx)) && Number.isFinite(Number(currentBeatIdx))) {
                    navigationDecision = Number(decision.current_beat_idx) > Number(currentBeatIdx) ? 'SWITCH' : 'STAY';
                } else {
                    navigationDecision = 'STAY';
                }
            }
            decision.navigation_decision = navigationDecision;

            if (typeof decision.logic_safety_warning === 'string' && decision.logic_safety_warning.trim() === '无') {
                decision.logic_safety_warning = 'NONE';
            }
            if (!decision.logic_safety_warning) {
                decision.logic_safety_warning = 'NONE';
            }
            if (!decision.reasoning) {
                decision.reasoning = 'N/A';
            }

            sbtConsole.group('[CONDUCTOR-V11-OUTPUT] Navigation + GPS/Tone Output');
            logger.debug('navigation_decision:', decision.navigation_decision);
            logger.debug('reasoning:', typeof decision.reasoning === 'string' ? decision.reasoning.substring(0, 100) + '...' : decision.reasoning);
            logger.debug('logic_safety_warning:', typeof decision.logic_safety_warning === 'string' ? decision.logic_safety_warning.substring(0, 100) + '...' : decision.logic_safety_warning);
            logger.debug('status:', decision.status);
            logger.debug('current_beat_idx:', decision.current_beat_idx);
            logger.debug('narrative_hold:', typeof decision.narrative_hold === 'string' ? decision.narrative_hold.substring(0, 60) + '...' : decision.narrative_hold);
            logger.debug('tone_correction:', typeof decision.tone_correction === 'string'
                ? decision.tone_correction.substring(0, 100) + '...'
                : (decision.tone_correction ? JSON.stringify(decision.tone_correction).substring(0, 100) : 'null (none)'));
            logger.debug('beat_completion_analysis:', typeof decision.beat_completion_analysis === 'string' ? decision.beat_completion_analysis.substring(0, 60) + '...' : decision.beat_completion_analysis);
            logger.debug('realtime_context_ids:', decision.realtime_context_ids);
            sbtConsole.groupEnd();

            if (!decision.realtime_context_ids) {
                decision.realtime_context_ids = [];
            }
            if (!decision.tone_correction) {
                decision.tone_correction = null;
            }
            if (!decision.beat_completion_analysis) {
                decision.beat_completion_analysis = 'NO_ANALYSIS';
            }

            if (decision.tone_correction) {
                sbtConsole.warn('[TONE CORRECTION REQUIRED] Tone deviation detected.');
                sbtConsole.warn(decision.tone_correction);
            }

            this.info('--- TurnConductor V11.0 --- Navigation Gate + GPS/Tone DONE');
            return decision;

        } catch (error) {
            this.diagnose('--- TurnConductor V11.0 FAILED ---', error);
            if (this.toastr) {
                this.toastr.error(`Conductor failed: ${error.message}`, 'Conductor Error');
            }
            return {
                navigation_decision: "STAY",
                reasoning: "fallback: conductor failed",
                logic_safety_warning: 'NONE',
                status: "CONTINUE",
                current_beat_idx: Number.isFinite(Number(currentBeatIdx)) ? Number(currentBeatIdx) : 0,
                narrative_hold: 'NONE',
                tone_correction: null,
                beat_completion_analysis: 'EXECUTION_FAILED',
                realtime_context_ids: []
            };
        }
    }
// ai/turnConductorAgent.js

_createPrompt(context) {
    // 如果有自定义提示词，直接使用
    if (this.promptManager && this.promptManager.hasCustomConductorPrompt()) {
        const customPrompt = this.promptManager.getConductorPrompt();
        logger.info("[回合裁判] 使用自定义提示词");
        return BACKEND_SAFE_PASS_PROMPT + customPrompt;
    }

    // 极简模式：只提取必要数据
    const {
        lastExchange,
        chapterBlueprint,
        staticMatrices,
        currentBeat,
        nextBeat,
        currentBeatIdx,
        userLastMessage,
        externalDatabaseContext,
        externalWorldbookContext,
        externalRecentContext
    } = context;
    const beats = chapterBlueprint?.plot_beats || [];

    // 【实体召回开关检测】默认关闭
    const isEntityRecallEnabled = localStorage.getItem('sbt-entity-recall-enabled') === 'true';
    let entityManifestContent = '';
    let chapterContextIds = [];

    if (isEntityRecallEnabled) {
        const entityData = this._generateEntityManifest(staticMatrices);
        entityManifestContent = entityData.content;
        chapterContextIds = chapterBlueprint?.chapter_context_ids || [];
    }

    
    const currentBeatSummary = currentBeat?.physical_event || currentBeat?.summary || currentBeat?.description || '未知节拍';
    const nextBeatSummary = nextBeat?.physical_event || nextBeat?.summary || nextBeat?.description || '无';
    const safeUserMessage = (typeof userLastMessage == 'string' && userLastMessage.trim() != '')
        ? userLastMessage
        : '[无用户回复]';
    const hasNavigationContext = !!(currentBeat || nextBeat || userLastMessage || Number.isFinite(Number(currentBeatIdx)));
    const navigationContextBlock = hasNavigationContext ? `
[导航闸门]
当前节拍A（驻留）：${currentBeatSummary}
下一节拍B（待办）：${nextBeatSummary}
用户最新回复："${safeUserMessage}"

决策规则：
- 停留：用户表现出明显互动意图（提问、情感、动作、拒绝离开）。
- 切换：用户表现出推进意图或被动回应（简短回复、沉默、明确前进指令）。

逻辑安全检查：
- 若判定为停留，检查用户行为是否会破坏下一节拍前提。
- 如有冲突，请写入 logic_safety_warning。
` : '';

    const externalBlocks = [];
    if (externalWorldbookContext) {
        externalBlocks.push(`【世界书补充】\n${externalWorldbookContext}`);
    }
    if (externalDatabaseContext) {
        externalBlocks.push(`【数据库大纲+总结】\n${externalDatabaseContext}`);
    }
    if (externalRecentContext) {
        externalBlocks.push(`【前文上下文（仅AI）】\n${externalRecentContext}`);
    }
    const externalContextBlock = externalBlocks.length
        ? `\n外部上下文:\n${externalBlocks.join('\n\n')}\n`
        : '';


// V10.0 Prompt：GPS定位 + 基调纠正 + 严格顺序
    return BACKEND_SAFE_PASS_PROMPT + `
指令: 剧情定位与基调纠正 V10.0

任务: 判断当前节拍位置，检测基调偏离

剧本流程:
  节拍列表:
${JSON.stringify(beats.map((b, i) => ({
    index: i,
    event: b.physical_event || b.description,
    exit_condition: b.exit_condition,
    emotional_direction: b.state_change || "无"
})), null, 2)}

最新对话:
${lastExchange}

${externalContextBlock}
定位规则_严格顺序:
  禁止跳跃: 节拍推进必须逐级进行，从0开始逐个验证

  节拍完成标准_三个条件同时满足:
    条件1: 核心事件已被详细描写，不是一笔带过
    条件2: 有exit_condition时，玩家已做实质性回应
    条件3: 情感基调符合预期，无偏离

  伪完成判定_以下情况等于未完成:
    情况1: AI只是提到该事件，未展开描写
    情况2: AI刚开场，核心互动未发生
    情况3: 玩家未回应，Dialogue Scene必需
    情况4: 情感基调偏离

  设置current_beat_idx: 第一个未完成的节拍。有疑问时保持当前，不前进

基调纠正检查:
  检查对象: 针对current_beat_idx节拍，对比剧本预期vs实际执行

  偏离类型1_玩家抵触:
    现象: 剧本预期玩家接受、原谅或同意，实际拒绝、冷淡或抵触
    输出: 提供2个方案 - A让NPC更低姿态再次请求; B让AI通过玩家非语言信号暗示松动

  偏离类型2_NPC基调错误:
    现象: 剧本要求脆弱、温柔或试探，实际威胁、强势或命令
    输出: 指出错误，要求重新演绎该节拍

  偏离类型3_情节跳跃:
    现象: 当前节拍未完成，AI已描写下一节拍
    输出: 要求回退，继续填充当前节拍

  tone_correction格式:
    结构: 检测到偏离类型，简述现象，纠正方案A，纠正方案B（如适用）

冲突滑坡预防_V10.1新增:
  核心问题: 节拍中的小矛盾容易被正文AI扩大化导致失控

  高风险场景识别:
    场景1: 涉及路人背景角色或非核心NPC的冲突
    场景2: 轻微情感矛盾如小误会小争执小吃醋
    场景3: 次要竞争或玩笑性质的对抗
    场景4: 过场性质的外部干扰或插曲

  滑坡风险评估:
    问题1: 这个矛盾是否为本章核心议题？
    问题2: 正文AI是否可能将其扩大为主要冲突？
    问题3: 是否会喧宾夺主影响主线节奏？

  禁令生成策略:
    如识别为高风险，在narrative_hold中生成明确禁令
    禁令模板:
      类型A_次要角色: [角色名]的冲突必须快速带过，禁止展开对话细节或升级矛盾
      类型B_轻微矛盾: 此误会/争执仅为小插曲，用1-2句话点到即止，立即回归主线
      类型C_控制篇幅: 此段落不超过[X]句话，禁止占用过多篇幅
      类型D_禁止升级: 禁止将[小吃醋]升级为[敌对]，保持冲突强度在合理范围

  核心原则: 保护主线节奏，严防次要内容滑坡失控

章节转换判定:
  触发条件: current_beat_idx 已进入最后一个节拍（索引 = plot_beats.length - 1）

  判定规则:
    步骤1: 正常完成节拍定位流程，产出 current_beat_idx
    步骤2: 若 current_beat_idx 为最后节拍，输出 status 为 触发切换
    步骤3: 否则输出 status 为 继续

  重要说明: 进入最后节拍即触发章节转换（本次回复完成后切换）

  示例:
    plot_beats长度: 5（索引 0-4）
    current_beat_idx = 4 → 触发切换
    current_beat_idx = 3 → 继续

${navigationContextBlock}

输出格式_JSON:
  重要：只返回一个 JSON 对象，不要输出代码块或额外文字。
  结构:
    navigation_decision: 停留 | 切换
    reasoning: 解释用户意图与选择
    logic_safety_warning: 无 | 警告内容
    status: 继续 | 触发切换
    current_beat_idx: 数值，表示当前节拍索引
    narrative_hold: 描述严格禁止的后续内容
    tone_correction: 纠正指令或null
    beat_completion_analysis: 节拍完成度分析
    realtime_context_ids: 实体编号数组${isEntityRecallEnabled ? '，需要填写规划外实体' : ''}

${isEntityRecallEnabled ? `实体召回_规划外实体检索:
  任务: 识别本回合涉及的规划外实体，不在chapter_context_ids中的实体

  世界实体清单:
${entityManifestContent}

  本章规划内实体_无需标记:
${JSON.stringify(chapterContextIds, null, 2)}

  检索规则:
    步骤1: 从对话中提取所有实体关键词
    步骤2: 与世界实体清单匹配编号
    步骤3: 过滤掉已在chapter_context_ids中的实体
    步骤4: 将规划外的实体编号输出到realtime_context_ids
    步骤5: 如果本回合只涉及规划内实体，输出空数组
` : ''}
`;
}


/**
 * V2.0: 生成轻量级实体清单 (Manifest)
 * @param {object} staticMatrices - 静态实体数据库
 * @returns {object} 包含 content 和 totalCount 的清单对象
 */
_generateEntityManifest(staticMatrices) {
    if (!staticMatrices) {
        this.diagnose('[V2.0-MANIFEST] staticMatrices 为空，返回空清单');
        return { content: '（当前世界无已注册实体）', totalCount: 0 };
    }

    let manifestLines = [];
    let count = 0;

    // 探针：开始生成清单
    sbtConsole.group('[CONDUCTOR-V2-PROBE] 实体清单生成');

    // 角色清单
    if (staticMatrices.characters) {
        manifestLines.push('**角色 (Characters):**');
        Object.entries(staticMatrices.characters).forEach(([id, data]) => {
            const name = data?.core?.name || data?.name || '未命名';
            manifestLines.push(`  - ${name} (编号: ${id})`);
            count++;
        });
        logger.debug(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
    }

    // 地点清单
    if (staticMatrices.worldview?.locations) {
        manifestLines.push('\n**地点 (Locations):**');
        Object.entries(staticMatrices.worldview.locations).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (编号: ${id})`);
            count++;
        });
        logger.debug(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
    }

    // 物品清单
    if (staticMatrices.worldview?.items && Object.keys(staticMatrices.worldview.items).length > 0) {
        manifestLines.push('\n**物品 (Items):**');
        Object.entries(staticMatrices.worldview.items).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (编号: ${id})`);
            count++;
        });
        logger.debug(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
    }

    // 故事线清单
    if (staticMatrices.storylines) {
        manifestLines.push('\n**故事线 (Storylines):**');
        Object.entries(staticMatrices.storylines).forEach(([category, quests]) => {
            if (quests && Object.keys(quests).length > 0) {
                Object.entries(quests).forEach(([id, data]) => {
                    const title = data?.title || '未命名';
                    manifestLines.push(`  - ${title} (编号: ${id}, 分类: ${category})`);
                    count++;
                });
            }
        });
        logger.debug(`✓ 故事线数量: ${count - manifestLines.filter(l => l.startsWith('**')).length + 1}`);
    }

    const content = manifestLines.length > 0
        ? manifestLines.join('\n')
        : '（当前世界无已注册实体）';

    logger.debug(`✓ 清单生成完成，共 ${count} 条实体`);
    sbtConsole.groupEnd();

    return { content, totalCount: count };
}

/**
 * V2.0: 提取文体档案摘要
 * @param {object} stylisticArchive - 文体档案对象
 * @returns {string} 格式化的摘要文本
 */
_extractStylisticSummary(stylisticArchive) {
    if (!stylisticArchive || Object.keys(stylisticArchive).length === 0) {
        this.diagnose('[V2.0-STYLISTIC] 文体档案为空');
        return '（暂无文体档案数据）';
    }

    // 探针：开始提取摘要
    sbtConsole.group('[CONDUCTOR-V2-PROBE] 文体档案摘要提取');

    let summary = [];

    // 高频形容词
    const overusedAdj = stylisticArchive?.frequent_descriptors?.adjectives
        ?.filter(item => item.count >= 3)
        .map(item => `"${item.word}"(${item.count}次)`) || [];

    if (overusedAdj.length > 0) {
        summary.push(`**高频形容词（建议避免）：** ${overusedAdj.join(', ')}`);
        logger.debug(`✓ 高频形容词: ${overusedAdj.length} 个`);
    }

    // 高频副词
    const overusedAdv = stylisticArchive?.frequent_descriptors?.adverbs
        ?.filter(item => item.count >= 3)
        .map(item => `"${item.word}"(${item.count}次)`) || [];

    if (overusedAdv.length > 0) {
        summary.push(`**高频副词（建议避免）：** ${overusedAdv.join(', ')}`);
        logger.debug(`✓ 高频副词: ${overusedAdv.length} 个`);
    }

    // 常用意象
    const recentImagery = stylisticArchive?.imagery_and_metaphors?.slice(-5) || [];
    if (recentImagery.length > 0) {
        summary.push(`**近期意象：** ${recentImagery.join(', ')}`);
        logger.debug(`✓ 近期意象: ${recentImagery.length} 个`);
    }

    const result = summary.length > 0 ? summary.join('\n') : '（暂无显著的文体模式）';
    logger.debug(`✓ 摘要生成完成`);
    sbtConsole.groupEnd();

    return result;
}

/**
 * 生成完整的实体数据（用于非召回模式）
 * @param {object} staticMatrices - 静态实体数据库
 * @returns {string} 格式化的完整实体数据文本
 */
_generateFullEntityData(staticMatrices) {
    if (!staticMatrices) {
        this.diagnose('[完整注入] staticMatrices 为空，返回空数据');
        return '（当前世界无实体数据）';
    }

    let sections = [];

    sbtConsole.group('[CONDUCTOR-FULL-INJECT] 完整实体数据注入');

    // 角色数据
    if (staticMatrices.characters && Object.keys(staticMatrices.characters).length > 0) {
        sections.push('**=== 角色档案 (Characters) ===**\n');
        Object.entries(staticMatrices.characters).forEach(([id, data]) => {
            sections.push(`### ${data?.core?.name || data?.name || '未命名'} (编号: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
    }

    // 地点数据
    if (staticMatrices.worldview?.locations && Object.keys(staticMatrices.worldview.locations).length > 0) {
        sections.push('**=== 地点档案 (Locations) ===**\n');
        Object.entries(staticMatrices.worldview.locations).forEach(([id, data]) => {
            sections.push(`### ${data?.name || '未命名'} (编号: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
    }

    // 物品数据
    if (staticMatrices.worldview?.items && Object.keys(staticMatrices.worldview.items).length > 0) {
        sections.push('**=== 物品档案 (Items) ===**\n');
        Object.entries(staticMatrices.worldview.items).forEach(([id, data]) => {
            sections.push(`### ${data?.name || '未命名'} (编号: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
    }

    // 故事线数据
    if (staticMatrices.storylines) {
        let hasStorylines = false;
        for (const category in staticMatrices.storylines) {
            if (staticMatrices.storylines[category] && Object.keys(staticMatrices.storylines[category]).length > 0) {
                hasStorylines = true;
                break;
            }
        }

        if (hasStorylines) {
            sections.push('**=== 故事线档案 (Storylines) ===**\n');
            for (const [category, quests] of Object.entries(staticMatrices.storylines)) {
                if (quests && Object.keys(quests).length > 0) {
                    sections.push(`#### 分类: ${category}\n`);
                    Object.entries(quests).forEach(([id, data]) => {
                        sections.push(`##### ${data?.title || '未命名'} (编号: ${id})`);
                        sections.push('```json');
                        sections.push(JSON.stringify(data, null, 2));
                        sections.push('```\n');
                    });
                }
            }
            logger.debug(`✓ 故事线数据已注入`);
        }
    }

    const result = sections.length > 0 ? sections.join('\n') : '（当前世界无实体数据）';
    logger.debug(`✓ 完整实体数据注入完成`);
    sbtConsole.groupEnd();

    return result;
}

}
