// ai/architectAgent.js
import { createLogger } from '../utils/logger.js';
const logger = createLogger('AI代理');

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js';
import { deepmerge } from '../utils/deepmerge.js';
import { PromptBuilder } from '../src/managers/PromptBuilder.js';

const safeLocalStorageGet = (key) => {
    if (typeof localStorage === 'undefined') {
        return null;
    }
    try {
        return localStorage.getItem(key);
    } catch (error) {
        logger.warn(`[ArchitectAgent] 无法读取 localStorage 键 "${key}"`, error);
        return null;
    }
};

const parseBeatCountSetting = (rawValue) => {
    const fallback = '7-9';
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return { display: fallback, rangeText: fallback, isCustom: false, raw: fallback };
    }
    const raw = rawValue.trim();
    const normalizeRange = (value) => {
        const match = value.match(/^(\d+)\s*-\s*(\d+)$/);
        if (match) {
            const min = parseInt(match[1], 10);
            const max = parseInt(match[2], 10);
            if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
                return `${min}-${max}`;
            }
            return null;
        }
        const single = value.match(/^(\d+)$/);
        if (single) {
            const n = parseInt(single[1], 10);
            if (Number.isFinite(n) && n > 0) {
                return `${n}-${n}`;
            }
        }
        return null;
    };
    if (raw.startsWith('custom:')) {
        const rangeText = normalizeRange(raw.slice('custom:'.length).trim());
        if (rangeText) {
            return { display: `自定义=${rangeText}`, rangeText, isCustom: true, raw };
        }
    }
    const normalized = normalizeRange(raw);
    if (normalized) {
        return { display: normalized, rangeText: normalized, isCustom: false, raw };
    }
    return { display: fallback, rangeText: fallback, isCustom: false, raw: fallback };
};

export class ArchitectAgent extends Agent {

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

    async execute(context, abortSignal = null) {
        this.diagnose(`--- 章节建筑师AI V9.2 (Function Fix) 启动 --- 正在动态规划新章节...`);
        const prompt = this._createPrompt(context);

        // 【增强日志】打印建筑师完整输入到控制台
        console.group('📐 [章节建筑师 - 完整输入] Architect AI Input Prompt');
        console.log('==================== 开始 ====================');
        console.log(prompt);
        console.log('==================== 结束 ====================');
        console.groupEnd();

        try {
            // 🔥 静默流式回调：后台接收数据但不显示给用户，避免超时问题
            const silentStreamCallback = (_chunk) => {
                // 静默接收，不触发UI事件，只保持连接活跃
            };

            const responseText = await this.deps.mainLlmService.callLLM(
                [{ role: 'user', content: prompt }],
                silentStreamCallback,  // 👈 使用静默流式回调
                abortSignal
            );

            // 【增强日志】打印建筑师完整输出到控制台
            console.group('📋 [章节建筑师 - 完整输出] Architect AI Raw Output');
            console.log('==================== 开始 ====================');
            console.log(responseText);
            console.log('==================== 结束 ====================');
            console.groupEnd();
            
            const cleanedResponseText = this._stripLogicCheckBlock(responseText);
            let potentialJsonString;
            const codeBlockMatch = cleanedResponseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
                potentialJsonString = codeBlockMatch[1].trim();
            } else {
                const firstBrace = cleanedResponseText.indexOf('{');
                const lastBrace = cleanedResponseText.lastIndexOf('}');
                if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
                    throw new Error("AI响应中未找到有效的JSON对象结构。");
                }
                potentialJsonString = cleanedResponseText.substring(firstBrace, lastBrace + 1);
            }
            
            const result = repairAndParseJson(potentialJsonString, this);
            this._validateArchitectResult(result);

            this.info("--- 章节建筑师AI V10.0 --- 新章节的创作蓝图已成功生成。");
            return { 
                new_chapter_script: result.chapter_blueprint, // 直接传递对象
                design_notes: result.design_notes, // 设计笔记作为元数据保留
                raw_response: responseText
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                throw error; // Re-throw AbortError to be handled upstream
            }
            this.diagnose("--- 章节建筑师AI V10.0 构思失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`章节蓝图构思失败: ${error.message.substring(0, 200)}...`, "建筑师AI错误");
            }
            return null;
        }
    }

    _validateArchitectResult(result) {
        const baseError = "章节建筑师AI未能返回有效的蓝图响应";
        if (!result || typeof result !== 'object') {
            throw new Error(`${baseError}：根对象为空。`);
        }

        const blueprint = result.chapter_blueprint;
        if (!blueprint || typeof blueprint !== 'object') {
            throw new Error(`${baseError}：缺少 chapter_blueprint。`);
        }

        if (!Array.isArray(blueprint.plot_beats) || blueprint.plot_beats.length === 0) {
            throw new Error(`${baseError}：plot_beats 不存在或为空。`);
        }

        if (!result.design_notes || typeof result.design_notes !== 'object') {
            result.design_notes = {};
        }
    }

// architectAgent.js

/**
 * 获取基础提示词模板
 * @returns {string} 基础提示词
 */
_getBasePromptTemplate() {
    // 如果有自定义提示词且promptManager已注入，则使用自定义的
    if (this.promptManager && this.promptManager.hasCustomArchitectPrompt()) {
        return this.promptManager.getArchitectPrompt();
    }

    // 否则使用默认的basePrompt
    return this._getDefaultBasePrompt();
}

/**
 * 动态生成JSON输出标准
 * @param {Object} config - 配置对象
 * @param {string} config.beatCountRange - 节拍数量区间
 * @param {string} config.playerNarrativeFocus - 玩家叙事焦点
 * @param {boolean} config.hasImmersionMode - 是否启用沉浸模式
 * @param {boolean} config.isEntityRecallEnabled - 是否启用实体召回
 * @returns {string} JSON输出标准的文本描述
 */
_generateOutputSpecification(config) {
    const { beatCountRange, playerNarrativeFocus, hasImmersionMode, isEntityRecallEnabled } = config;

    // 基础输出结构（所有模式共用）
    let outputSpec = `**【【【 JSON 输出结构 】】】**

\`\`\`json
{
  "design_notes": {
    "player_focus_execution": {
      "player_instruction": "${playerNarrativeFocus.replace(/"/g, '\\"')}",
      "execution_logic": "[详细说明：你是如何将玩家焦点和玩家补充（chapter_blueprint.player_supplement / storyline.player_supplement）作为最高优先级执行的？]",
      "conflict_resolution": "[如果玩家意见与关系图谱、故事线、节奏塔等数据产生冲突，你是如何处理的？必须说明：你是否遵循了'始终以玩家意见为准'的原则]"
        },
    "dual_horizon_analysis": "[平衡短期焦点与长期故事线的策略]",
    "chronology_compliance": "[时段/光线/NPC调度的合理性说明]",
    "interaction_self_check": "[每个节拍是否都具有极高的扩写潜力，可以被扩容为几千字的描写与对话？]",
    "chapter_pacing_audit": {
      "story_summary": "[必填：一句话概括本章讲了一个什么故事]",
      "beat_count": "[必填：本章节拍数量]",
      "total_word_target": "[必填：节拍数 * 3500 的目标字数]",
      "pacing_assessment": "[必填：以现代网文节奏视角判断该故事是否适配该字数；禁止以意识流细节扩写凑字，若不适配说明如何调整节拍/合并]"
    },

    "dopamine_blueprint": {
      "exclusivity_justification": "[为什么只有主角能做到？基于什么独特性？]",
      "trope_innovation": "[使用了什么套路？如何翻新？]",
      "tangible_rewards": "[实质奖励及即时价值]",
      "hook_design": "[抛出的新钩子]"
    },
`;

    // 添加通用字段
    outputSpec += `

    "new_entities_proposal": "[可选：NEW:前缀实体的定义说明]",
    "storyline_weaving": "[选择了哪几条故事线及理由（若有次要线请说明如何兼容）]",
    "deus_ex_machina_check": {
      "conflict_origin": "[本章冲突的逻辑源头]",
      "hook_rationality": "[钩子如何从本章自然延伸]"
    }
  },
  "chapter_blueprint": {
    "title": "[章节名]",${isEntityRecallEnabled ? `
    "chapter_context_ids": ["char_A", "loc_B", "NEW:item_C"],` : ''}
    "player_narrative_focus": "${playerNarrativeFocus.replace(/"/g, '\\"')}",
    "plot_beats": [
      {
        "beat_id": "【节拍1：完整事件名称】",
        "type": "Action",  // 类型值: Dialogue_Scene / Hybrid_Scene 为剧情对话；Action/Transition/Internal_Transition/Reflection 为非剧情对话
        "environment_state": "[可选：光影/声音/氛围的引导建议]",
        "physical_event": "[情景设置：环境与人物的张力] + [互动动作] + [目的：为了达成【XX】]",
        "state_change": "[关系/任务更新] + [认知/情绪的不可逆转折 (X/10)]",
        "exit_condition": "[场景结束的明确物理信号]",
        "is_highlight": false
      }
      // 数量必须严格符合 ${beatCountRange}
    ],

      "highlight_directive": {
        "target_beat": "[高光节拍ID]",
        "instructions": [
          "[艺术指令1：如'强化感官层面的时间延展感']",
          "[艺术指令2：如'建议融入角色的核心记忆碎片']",
          "[艺术指令3：如'避免直接说明情感，通过生理反应暗示']"
        ]
      }
    }
  }
}
\`\`\`
`;

    return outputSpec;
}

/**
 * 获取完整的默认提示词（包含示例数据，用于导出）
 * @returns {string} 完整的默认提示词
 */
getCompleteDefaultPrompt() {
    // 创建示例上下文数据用于生成完整模板
    const exampleContext = {
        chapter: {
            staticMatrices: {
                characters: {},
                worldview: {},
                storylines: {
                    main_quests: {},
                    side_quests: {},
                    relationship_arcs: {},
                    personal_arcs: {}
                },
                relationship_graph: { edges: [] }
            },
            dynamicState: {
                storylines: {
                    main_quests: {},
                    side_quests: {},
                    relationship_arcs: {},
                    personal_arcs: {}
                },
                stylistic_archive: {
                    imagery_and_metaphors: [],
                    frequent_descriptors: { adjectives: [], adverbs: [] },
                    sensory_patterns: []
                },
                chronology: {
                    day_count: 1,
                    time_slot: "evening",
                    weather: null,
                    last_rest_chapter: null
                }
            },
            meta: {
                longTermStorySummary: "故事摘要示例",
                narrative_control_tower: {
                    narrative_mode: { current_mode: 'classic_rpg' }
                }
            },
            playerNarrativeFocus: '示例玩家焦点',
            chapter_blueprint: {}
        },
        firstMessageContent: null,
        leaderMessageContent: null
    };

    // 调用_createPrompt生成完整模板（带示例数据）
    return this._createPrompt(exampleContext);
}

/**
 * 获取默认的基础提示词（用于UI显示）
 * @returns {string} 简短的默认提示词说明
 */
_getDefaultBasePrompt() {
    // UI中显示简短提示
    return `提示：建筑师提示词为约900行的复杂模板，包含动态数据注入。

如需查看完整内容，请使用"导出"功能。导出的文件将包含当前使用的完整提示词模板。

如需自定义，您可以：
1. 点击"导出"按钮，将默认模板保存为文件
2. 在文本编辑器中编辑该文件
3. 使用"导入"按钮加载您修改后的模板

注意：模板中的动态数据（如角色信息、故事线等）会在运行时被系统自动注入。`;
}

_createPrompt(context) {
    // 【新增】如果有自定义提示词，直接使用（不进行变量替换）
    if (this.promptManager && this.promptManager.hasCustomArchitectPrompt()) {
        const customPrompt = this.promptManager.getArchitectPrompt();
        this.info("[建筑师] 使用自定义提示词");
        // 自定义提示词会加上安全通行证前缀
        return BACKEND_SAFE_PASS_PROMPT + customPrompt;
    }

    // 【实体召回开关检测】默认关闭
    const isEntityRecallEnabled = safeLocalStorageGet('sbt-entity-recall-enabled') === 'true';
    logger.debug(`[建筑师] 实体召回模式: ${isEntityRecallEnabled ? '启用' : '关闭（默认）'}`);

    // 【默认流程】使用系统默认提示词（带动态数据注入）
    const {
        chapter,
        firstMessageContent,
        leaderMessageContent,
        rerollChapterBlueprint,
        externalDatabaseContext,
        externalWorldbookContext,
        externalRecentContext
    } = context;
            const currentWorldState = deepmerge(
            chapter.staticMatrices,
            chapter.dynamicState
        );
        const longTermStorySummary = chapter?.meta?.longTermStorySummary || "故事刚刚开始。";
        const chapterNumberRaw = chapter?.meta?.chapterNumber;
        const chapterNumberParsed = parseInt(chapterNumberRaw, 10);
        const appContext = this.deps?.applicationFunctionManager?.getContext?.();
        const leaderCount = Array.isArray(appContext?.chat)
            ? appContext.chat.filter(piece => piece && piece.leader).length
            : null;
        const chapterNumberFromLeaders = Number.isFinite(leaderCount) ? leaderCount + 1 : null;
        const chapterNumber = Number.isFinite(chapterNumberFromLeaders) && chapterNumberFromLeaders > 0
            ? chapterNumberFromLeaders
            : (Number.isFinite(chapterNumberParsed) && chapterNumberParsed > 0 ? chapterNumberParsed : 1);
        const playerNarrativeFocus = chapter?.playerNarrativeFocus || '由AI自主创新。';
        // V4.2: 获取玩家设置的章节节拍数量区间
        const beatCountSetting = parseBeatCountSetting(safeLocalStorageGet('sbt-beat-count-range'));
        const beatCountRange = beatCountSetting.rangeText;
        const beatCountRuleNote = beatCountSetting.isCustom
            ? `自定义区间规则: 本章节拍数量必须严格落在 ${beatCountRange}；自定义模式下不做额外上限或合并要求。`
            : `区间规则: 节拍数量必须严格落在 ${beatCountRange} 区间内，不得随意增减。`;
        const safeExternalWorldbookContext = (typeof externalWorldbookContext === 'string' && externalWorldbookContext.trim())
            ? externalWorldbookContext.trim()
            : null;
        const safeExternalDatabaseContext = (typeof externalDatabaseContext === 'string' && externalDatabaseContext.trim())
            ? externalDatabaseContext.trim()
            : null;
        const safeExternalRecentContext = (typeof externalRecentContext === 'string' && externalRecentContext.trim())
            ? externalRecentContext.trim()
            : null;
        // V8.0: 提取故事线追踪数据和文体档案
        const staticStorylines = chapter?.staticMatrices?.storylines || {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        const dynamicStorylines = chapter?.dynamicState?.storylines || {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        const stylisticArchive = chapter?.dynamicState?.stylistic_archive || {
            imagery_and_metaphors: [],
            frequent_descriptors: { adjectives: [], adverbs: [] },
            sensory_patterns: []
        };
        // V6.0: 提取年表信息
        const chronology = chapter?.dynamicState?.chronology || {
            day_count: 1,
            time_slot: "evening",
            weather: null,
            last_rest_chapter: null
        };
        let openingSceneContext = "无指定的开场白，请自由创作开篇。";
        const safeLeaderMessageContent = typeof leaderMessageContent === 'string' && leaderMessageContent.trim()
            ? leaderMessageContent.trim()
            : null;

    if (firstMessageContent) {
        openingSceneContext = firstMessageContent;
        this.info("建筑师检测到开场白，已切换到'续写模式'。");
    }

    let basePrompt = `
指令_自省式叙事蓝图创作_V13.0:

  章节编号信息:
    当前章节号: 第${chapterNumber}章
    规则: 标题与章节描述必须体现当前章节号，不要固定写“第一章”。


  身份确认: 你是一位顶级的懂得克制与聚焦艺术的叙事建筑师，你的任务是设计一个高度专注的服务于单一核心情感体验的创作蓝图

  核心角色定位_建筑师vs剧作家:
    定位: 你是建筑师不是编剧
    含义1: 你的输出是蓝图即指导方案，不是剧本即具体内容
    含义2: 你提供框架方向主题，而非台词动作细节心理描写
    含义3: 你设计情感流向和事件架构，具体的文字创作由正文AI完成

  语言规范示例:
    正确示例: 对话应围绕信任与背叛的主题展开，情感基调为压抑的质问
    错误示例: A愤怒地说你为什么要背叛我，B沉默地低下头

  核心提醒: 节拍内容应该是烹饪步骤而非成品菜肴

  叙事分级协议_成人向:
    核心指令: 本故事面向成年读者，你必须摒弃儿童文学式的去性化思维
    原则1_直面欲望: 人类不仅有情感还有本能，当角色关系亲密或张力极高时必须体现出性张力肢体渴望和生理反应
    原则2_拒绝净化: 严禁将成年人之间的激情处理为纯洁的友谊，如果情感到位接吻抚摸甚至更进一步的性不仅是被允许的而且是被鼓励的必须的
    原则3_物理法则: 高好感度等于物理距离缩短，相爱的人不会隔着两米远说话，让他们触碰纠缠感受彼此的体温

  语言与细节规范_强制执行:
    语言铁律:
      规则1: 你的所有输出包括staticMatrices内部的所有字符串值如characters、worldview、storylines必须完全使用简体中文
      规则2: 特别注意不仅字段描述要用中文字段的值也必须是中文
      规则3: 唯一允许英文的地方为字段名field_name和ID标识符
      规则4: 所有节拍描述地点名称事件描述等内容必须是简体中文，除非是专有名词的原文

第零章_故事线管理与反贪婪法则:

  核心法则_聚焦与克制:
    背景: 你面对的是庞大的故事网络但本章的容量有限
    要求: 你必须遵守以下铁律

  法则1_单章推进上限:
    绝对禁令: 严禁在一个章节内试图推进超过3条核心故事线

  法则2_选择逻辑:
    优先: current_status为active且与playerNarrativeFocus高度相关的故事线
    次优: 接近关键阈值如midpoint的故事线
    搁置: 与本章核心体验无关的故事线保持其状态不变不要强行提及

  法则3_推进方式:
    推进方式: 通过具体事件如获得物品击败敌人揭露秘密实质性推动进度条
    伏笔方式: 仅通过环境暗示或NPC只言片语提及不占用主要篇幅

  输出验证要求: 在design_notes.storyline_weaving中明确指出你选择了哪1到2条故事线并解释为何它们是本章的最佳选择

第零点五章_事件优先级决策协议:

  核心法则: 构建剧本时必须严格遵循以下降序优先级

  第一梯队_玩家神谕_最高优先级:
    源头: chapter_blueprint.player_supplement和storyline.player_supplement和playerNarrativeFocus
    法则: 无条件执行，玩家的意志凌驾于所有数据之上包括关系图谱故事线节奏塔风格档案等
    冲突处理: 当玩家意见与任何其他数据冲突时始终以玩家意见为准，你必须想办法合理化玩家的要求而不是拒绝


  第二梯队_好感度逻辑底座:
    源头: staticMatrices.characters中的affinity数值及对应阶段
    关键指令_零度校准加双层动机论:
      说明: 在设计角色行动前执行双层检验
      第一层_生物底座:
        步骤1_剥离性格标签: 暂时忘掉傲娇疯批等标签把角色当做普通人类
        步骤2_底层逻辑检查: 问一个正常人在好感度X时会做出Y行为吗
        步骤3_对照准则: 翻阅好感度行为准则解读确认行为是否在该阶段的合理范围内
        步骤4_生物引力法则:
          规则1: 好感度小于40本能上保持距离需要外部动机才会深度互动
          规则2: 好感度大于等于70本能上寻求接近需要外部阻碍才会保持距离
          规则3: 好感度大于等于90物理接触是自然反应刻意回避才需要理由
      第二层_性格表达:
        步骤1_重新穿上性格: 只有通过底层检查后才能用性格标签修饰表达方式
        步骤2_核心区别: 性格改变的是如何做而非是否做
          正确示例: 傲娇角色在高好感度下仍会关心对方但可能用别多想我只是顺路来掩饰
          错误示例: 傲娇角色在高好感度下完全不关心对方冷漠旁观，这违反了生物底座
        步骤3_动机分层验证: 在design_notes.affinity_logic_audit中必须分别说明生物层动机基于好感度的本能驱动和性格层表达如何用人设包装这个动机

  第三梯队_环境与节奏:
    源头: narrative_rhythm_clock和storyline_progress
    法则: 确保当前的氛围压抑或轻松与主线进度匹配

  输出验证: 在design_notes.event_priority_report中必须依据此梯队逻辑分配S级A级B级事件

第一章_反机械降神铁律:

  定义: 禁止凭空引入不合理的冲突巧合或事件

  三大禁令:
    禁令1_凭空冲突: 冲突必须源于已建立的故事线或伏笔，严禁突然冒出无铺垫的敌对势力或第三方干扰
    禁令2_巧合救场: 困境解决必须靠角色自身或已建立关系，严禁天降奇物或环境巧合中断冲突
    禁令3_莫名钩子: 终章节拍（最后节拍）必须从本章内容自然延伸，严禁用无关事件作为钩子

  核心原则: 逻辑合理性优先于节奏刺激性，宁可铺垫也不凭空制造冲突

  输出验证: design_notes新增deus_ex_machina_check字段：
    conflict_origin: "[本章冲突的逻辑源头]"
    hook_rationality: "[钩子如何从本章自然延伸]"

  第二章_节拍构造与红线协议:

  法则零_高密度节拍:
    定义: 每个节拍必须满足“1:3000-5000字的信息折叠率”
    总量目标: 章节目标字数最低 = 节拍数 * 3500。节拍设计和剧情规模必须保证剧情节奏正常推进
    重要风格: 这是现代网文小说节奏，不是意识流细节扩写。字数必须来自剧情推进、场景切换、冲突升级与互动展开，而不是单点细节反复放大
    语言: 只能使用总结性和指导性语言（例如“ A试图掩盖真相，却在B的层层逼问下精神崩溃 ”）
    禁止: 使用描述性语言（例如“ A说了一句话，B喝了一口水 ”）
  执行标准:
    标准0_章节级大纲: 节拍必须是章节级大纲而非段落级动作，凡是无法扩写到至少3000字的节拍一律禁止单独做节拍
    标准1_禁止微观: 伸手拿杯子感到头晕走到窗边此类动作禁止独立成拍必须合并进更大的事件中
    标准2_数量控制: 本章节拍数量要求为 ${beatCountRange}
      规则: 必须严格按数量要求设置节拍，不得随意增减
      说明: ${beatCountRuleNote}
    标准3_框架完整性: 每个节拍必须指明话题或主题而非具体对话内容情感基调预期结果
    标准4_禁止单一维度: 严禁生成只有氛围描写或只有动作序列的节拍，每个节拍都必须是情景交互情感三者融合的完整框架
    标准5_冲突滑坡预防:
      警告: 小矛盾如路人冲突小误会小吃醋极易被正文AI扩大化导致滑坡失控
      设计原则: 如包含易扩大内容必须在physical_event中明确标注快速带过或严格控制强度
    要求: physical_event 必须显式包含互动动作与外部反馈，并明确本节拍的目的
      正确示例: A因小事与路人短暂争执仅用于展现性格随即回归主线严禁升级
      错误示例: A与路人发生冲突，未标注控制指令易被扩写成大段对话甚至肢体冲突
  输出强制:
    design_notes.beat_density_strategy 必须详细说明：
      1) 你如何设计节拍来维持【节拍数 * 3500字】的总量节奏
      2) 哪些节拍被合并或减少以避免“洗脚/走路”等不可扩容小动作独立成拍
    design_notes.chapter_pacing_audit 必须详细说明：
      1) 本章讲了一个什么故事（1句话）
      2) 节拍数量与目标字数（节拍数 * 3500）
      3) 作为小说节奏是否匹配该字数，不匹配必须说明如何合并/减少节拍

  角色弧光锁定协议:
    核心: 只有被选定故事线照亮的角色才有资格在本章展现内心深度
    焦点角色:
      定义: 属于选定故事线的角色
      权限: 允许展现人物弧光性格反转情感崩溃，行为服务于剧情推进
    背景角色:
      定义: 本章出场但无故事线的角色
      禁令: 严禁加戏必须保持基准人设Baseline_Persona
      任务: 仅负责提供功能性协助或情绪反应如震惊或吐槽严禁流露复杂的内心戏或不为人知的阴暗面

  绝对红线:
    红线1_主题提纯:
      指令: 一章只做一个核心体验
      禁止: 在温馨重逢的基调中突然插入压抑不安的氛围导致情感体验不纯粹，要么全糖要么全刀禁止夹生


第一章B_高光时刻增幅协议:

  触发条件: 当你决定将某个节拍标记为高光节拍is_highlight为true时

  核心目标: 拒绝平铺直叙，必须动用一切叙事资源将此瞬间的情感冲击力或戏剧张力放大10倍

  增幅工具箱_仅供参考:
    说明: 你可以自由组合以下技法或创造更适合当前情境的手段，注意你只需要推荐技法不需要编写具体内容
    技法1_时间拉伸: 建议正文AI将物理时间延展为心理时间，例如建议聚焦微观细节如瞳孔变化物体运动轨迹等
    技法2_记忆重叠: 建议正文AI在当前画面中融入角色的回忆碎片，视觉或感官层面的重叠
    技法3_感官剥夺或聚焦: 建议正文AI屏蔽某些感官并强化特定感官，例如建议弱化视觉强化听觉
    技法4_心理蒙太奇: 建议正文AI在动作瞬间插入碎片化的内心活动或回忆闪回
    技法5_环境共鸣: 建议正文AI让环境事件与情感节点产生共振，例如指明在情绪爆发时应有环境变化配合

  独家设计要求:
    要求1_感官指导: 不要只说时间变慢，应该指导正文AI关注什么感官层面，例如建议聚焦视觉的细节延展或建议强化时间感知的扭曲
    要求2_唯一性原则: 你的增幅手段必须与角色的核心执念挂钩，如果是害怕被抛弃的人高光时刻的艺术指导应该是建议强化听觉敏感度如对脚步声呼吸声的捕捉营造被遗弃的恐惧感

  输出要求_增幅逻辑自述:
    说明: 你必须在chapter_core_and_highlight.highlight_design_logic中详细阐述你的设计逻辑解释你是如何通过独一无二的方式来放大这一刻的
    注意: 你是建筑师不是执笔者，你应该提供艺术指导和技法方向而非具体的文本内容
    highlight_design_logic字段结构:
      target_beat_id: 对应哪个节拍
      amplification_technique: 你建议使用什么技法，例如记忆重叠加听觉特写
      unique_execution: 艺术指导正文AI应该如何执行，例如建议在主角触碰神器的瞬间不要描写常规的光效而是引入听觉层面的穿越感如远古战场的声音同时让视觉产生记忆与现实的重叠当前人物与记忆中的形象产生关联
      emotional_impact_goal: 预期的情感目标例如让玩家感受到宿命的厚重感而不仅仅是获得力量的喜悦


第三章_输入情报:

  说明: 基于以下数据进行规划

  数据0_开场白:
${openingSceneContext ? `    内容:\n${openingSceneContext}` : "    内容: 无"}

  绝对优先级_玩家剧本补充:
${chapter?.chapter_blueprint?.player_supplement ? `    玩家补充内容: 玩家在审阅上一章剧本后提供了以下绝对优先级的补充说明
${chapter.chapter_blueprint.player_supplement}
    执行要求:
      要求1: 这是最高优先级指令凌驾于所有其他设计和蓝图
      要求2: 你必须无条件执行上述玩家补充的要求
      要求3: 当玩家意见与任何其他数据如关系图谱故事线节奏塔等冲突时始终以玩家意见为准
      要求4: 在design_notes.player_intent_execution中详细说明你是如何执行玩家意见的` : "    玩家补充内容: 无玩家补充"}

  数据1_焦点与故事线:
    短期焦点: ${playerNarrativeFocus}
    长期故事线:
${(() => {
        const mergedStorylines = {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        let totalCount = 0;

        for (const category of ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs']) {
            const staticCat = staticStorylines[category] || {};
            const dynamicCat = dynamicStorylines[category] || {};

            for (const [id, staticData] of Object.entries(staticCat)) {
                const dynamicData = dynamicCat[id] || {};
                mergedStorylines[category][id] = {
                    ...staticData,
                    current_status: dynamicData.current_status || 'active',
                    current_summary: dynamicData.current_summary || staticData.summary,
                    player_supplement: dynamicData.player_supplement || ''
                };
                totalCount++;
            }
        }

        if (totalCount === 0) {
            return '      状态: 当前无活跃的故事线';
        }

        return `      数据: <storylines>\n${JSON.stringify(mergedStorylines, null, 2)}\n</storylines>\n      执行指令:\n        指令1: 优先推进active状态且与焦点契合的故事线\n        指令2_玩家补充最高优先级: 若某条故事线包含player_supplement字段非空该字段内容为玩家的绝对优先级指令\n          细则1: 你必须无条件执行该指令将其融入本章剧情并兑现\n          细则2: 当player_supplement与故事线原始设定冲突时始终以player_supplement为准\n          细则3: 在design_notes.player_intent_execution中说明你是如何执行这些玩家指令的`;
    })()}

  数据2_全局摘要: ${longTermStorySummary}

  数据3_上章锚点正文:
${safeLeaderMessageContent ? `    内容:\n${safeLeaderMessageContent}` : "    内容: （未找到锚点正文）"}

  数据4_重roll参考剧本:
${rerollChapterBlueprint ? `    内容:\n<chapter_blueprint>\n${rerollChapterBlueprint}\n</chapter_blueprint>\n    指令: 这是重roll前的本章剧本，仅用于对照与改写。必须保持核心逻辑连续，但允许调整节拍结构与表现方式。` : "    内容: （未附带）"}

  数据5_环境与状态:
    World_Snapshot: 见current_world_state标签
    Stylistic_Archive: 见stylistic_archive标签禁令为避免使用overused为true的元素
    Chronology: 第${chronology.day_count}天时段为${chronology.time_slot}指令为光线和NPC调度需符合时段特征

  数据6_关系图谱:
    数据: ${JSON.stringify(currentWorldState.relationship_graph || { edges: [] }, null, 2)}

  好感度行为准则解读:
${(() => {
    const relationshipGraph = currentWorldState.relationship_graph || { edges: [] };
    if (!relationshipGraph.edges || relationshipGraph.edges.length === 0) {
        return "    状态: 暂无角色关系数据";
    }

    let guidelines = "";
    for (const edge of relationshipGraph.edges) {
        const fromChar = currentWorldState.characters?.[edge.from_char_id];
        const toChar = currentWorldState.characters?.[edge.to_char_id];
        const fromName = fromChar?.name || fromChar?.core?.name || edge.from_char_id;
        const toName = toChar?.name || toChar?.core?.name || edge.to_char_id;
        const affinity = edge.affinity ?? edge.current_affinity ?? 50;

        const guideline = PromptBuilder.getAffinityBehaviorGuideline(affinity);

        guidelines += "    关系_" + fromName + "到" + toName + ":\n";
        guidelines += "      好感度: " + affinity + "分满分100\n";
        guidelines += "      当前阶段: " + guideline.stage + "\n";
        guidelines += "      阶段描述: " + guideline.description.replace(/\n/g, ' ') + "\n";
    }
    return guidelines;
})()}


  数据7_实体数据访问说明:
${isEntityRecallEnabled ? `    模式: 上下文预取模式
    任务: 必须将本章涉及的所有实体ID如char或loc或item或quest填入chapter_context_ids
    原则: 宁滥勿缺包括current_world_state中已有的以及本章新引入的如NEW:char_xxx格式` : `    模式: 完整实体注入模式召回功能已关闭
    影响: 所有实体数据已在回合执导时完整注入你无需在蓝图中指定chapter_context_ids
    注意: 你仍然可以使用NEW:xxx格式引入新实体系统会自动处理`}

  数据8_外部世界书:
${safeExternalWorldbookContext ? `    内容:\n${safeExternalWorldbookContext}` : "    内容: （未提供）"}

  数据9_外部数据库:
${safeExternalDatabaseContext ? `    内容:\n${safeExternalDatabaseContext}` : "    内容: （未提供）"}

  数据10_前文上下文:
${safeExternalRecentContext ? `    内容:\n${safeExternalRecentContext}` : "    内容: （未提供）"}

<current_world_state>
${JSON.stringify(currentWorldState, null, 2)}
</current_world_state>

<stylistic_archive>
${JSON.stringify(stylisticArchive, null, 2)}
</stylistic_archive>

<chronology>
${JSON.stringify(chronology, null, 2)}
</chronology>


第四章_最终输出指令:

  说明: 你的回复必须是单一JSON对象，以下是各字段的填写规范与逻辑锁

  规范1_节拍构造规范:
    类型Type: Dialogue_Scene / Hybrid_Scene 为剧情对话；Action/Transition/Internal_Transition/Reflection 统一视为“非剧情对话”
    硬性限制: 非剧情对话节点禁止连续出现，非剧情对话的下一节必须是 Dialogue_Scene 或 Hybrid_Scene；全章最多 2 个非剧情对话节点
    互动要求: 每个节拍必须具备明确的互动对象与外部反馈，严禁写成“角色长时间独白、自我结论、无回应的独角戏”
    互动判定: 互动对象必须是能产生反馈的外部主体/系统（NPC/组织/门禁/交易/冲突/阻力）；禁止纯环境描写或主角自我动作独占
    遵守说明要求: 必须在 design_notes.non_dialogue_compliance_note 中说明如何遵守“非剧情对话不连续、总数不超过2”的要求，只能陈述已合规的最终结果
    物理事件physical_event: 必须包含“情景设置/互动动作/目的”，使用总结性与指导性语言
      错误示例1: 两人进行对话以交换情报，太干缺乏引导
      错误示例2: A一边整理装备一边向B抱怨任务的艰难以此试探B对任务的态度，过于具体侵犯了正文AI的创作空间
      正确示例: A试图在整理装备时掩盖任务风险，却被B的追问逼出真实态度，目的是迫使A承认隐瞒
    状态变更state_change: 必须包含关系/任务变化 + 认知/情绪的不可逆转折
    出口条件exit_condition: 所有类型必填，必须是物理可观测的结束标志例如达成某项共识一方做出某个决定性动作
    高光标记is_highlight: 若emotional_weight大于等于8标记为true并填写入highlight_directive


${isEntityRecallEnabled ? `  规范3_上下文预取:
    任务1: 在chapter_context_ids中列出本章涉及的所有实体ID包括char或loc或item或quest
    任务2: 若需引入新实体使用NEW:char_xxx格式` : ''}

`;

    // V13.0: 动态生成JSON输出标准
    const isImmersionModeExplicit = playerNarrativeFocus.includes('[IMMERSION_MODE]');
    const dynamicOutputSpec = this._generateOutputSpecification({
        beatCountRange: beatCountRange,
        playerNarrativeFocus: playerNarrativeFocus,
        hasImmersionMode: isImmersionModeExplicit,
        isEntityRecallEnabled: isEntityRecallEnabled
    });

    basePrompt += dynamicOutputSpec + `
`;

    let finalPrompt = basePrompt;

    // 【试验阶段】检测是否需要注入ABC情感沉浸流模块（只使用显式开关）
    if (isImmersionModeExplicit) {
        this.info("💕 [试验] 检测到[IMMERSION_MODE]标记，正在挂载【ABC沉浸流】战术模块...");
        finalPrompt += '\n\n' + IMMERSION_MODE_PROMPT;
    }

    // 在函数的最后，返回最终构建好的Prompt字符串
    return BACKEND_SAFE_PASS_PROMPT + finalPrompt;
}

}
