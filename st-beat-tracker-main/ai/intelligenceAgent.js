import { Agent } from './Agent.js';
import { createLogger } from '../utils/logger.js';
import { sbtConsole } from '../utils/sbtConsole.js';
const logger = createLogger('AI代理');
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js'; 
import { formatDossierSchemaForPrompt } from '../utils/dossierSchema.js';
export class IntelligenceAgent extends Agent {

  _createPrompt(worldInfoEntries, protagonistInfo, dossierSchema) {
        // V8.0: 整合主角信息
        const userName = protagonistInfo?.name || "未知";
        const userDescription = protagonistInfo?.description || "";
        const personaContent = protagonistInfo?.personaContent || "";

        // 构建主角信息文本
        let protagonistText = `主角名字: ${userName}\n`;
        if (userDescription) {
            protagonistText += `主角个人描述: ${userDescription}\n`;
        }
        if (personaContent) {
            protagonistText += `主角人设卡片内容: ${personaContent}\n`;
        }

        let formattedWorldInfo = "无特定的世界观条目。";
        if (worldInfoEntries && worldInfoEntries.length > 0) {
            formattedWorldInfo = worldInfoEntries
                .map(entry => `[${entry.key}]:\n${entry.content}`)
                .join('\n\n---\n\n');
        }

        const customFieldList = formatDossierSchemaForPrompt(dossierSchema);

        return BACKEND_SAFE_PASS_PROMPT + `
指令: ECI原子化数据库创生协议 V1.0

身份定位: 创世数据库管理员
角色特性: 拥有上帝视角的AI
核心任务: 将非结构化的文本情报，转化为结构严谨、高度分类的静态实体数据库
记录范围: 只反映目前故事还未开始时的状态

原始情报:
  主角信息:
${protagonistText}

  重要提示:
    主角身份: 主角的真实身份是${userName}
    标记说明: 在世界书条目中，如果出现{{user}}、{{用户}}、玩家等标记，它们指代的就是这个主角${userName}
    融合要求: 你需要将主角的个人信息（名字、描述、人设）与世界书中所有涉及{{user}}的条目进行融合分析
    建档要求: 在为主角建档时，必须综合考虑主角自己的人设描述、世界书中关于{{user}}的所有信息（背景、关系、能力等），将两者融合创建一个完整、统一的主角档案

  世界书条目:
${formattedWorldInfo}

ECI核心方法论_实体分类ID:
  服务对象: 你的所有工作都必须服务于ECI模型

  原则零_绝对忠实于文本:
    禁止编造: 你的工作是提取和整理，不是创作。如果原始情报中没有提到角色的某个属性，请该字段留空或填入空数组，绝对禁止为了填满表格而自行脑补
    禁止预测: 数据库只记录故事开始前的状态。不要将你推测未来可能发生的事情写入档案

  方法1_识别实体:
    任务: 从所有情报中，识别出所有独立的概念实体
    判断标准: 这是一个谁（角色）、哪里（地点）、什么（物品或概念）、何时发生的（历史事件）、还是一个长期目标（故事线）

  方法2_ID分配_至关重要:
    要求: 为识别出的每一个实体，都必须生成一个全局唯一的、带分类前缀的ID
    意义: 这个ID将是它在数据库中永恒的身份
    命名规范_绝对强制:
      角色: char_英文名或拼音_身份描述，例如char_yumi_player、char_neph_witch
      地点: loc_英文或拼音，例如loc_windwhisper_forest
      物品: item_前缀
      历史事件: event_前缀
      故事线: quest_或arc_前缀
      其他: 以此类推，必须包含所有分类

  方法3_分类归档:
    要求: 将创建的每一个实体档案，放入最终输出JSON中对应分类的书架里
    示例: 一个地点实体，必须被放入worldview.locations对象中，其键就是它的ID

  方法4_关系链接:
    要求: 在为一个实体建档时，如果其描述中关联到另一个实体，你必须使用那个实体的唯一ID来进行引用，绝对禁止使用名称字符串

核心任务指令:
  严格按照ECI方法论完成以下建档任务

  任务1_建档staticMatrices.characters:
    要求: 为每一个角色创建高度结构化的详细档案

    角色档案结构规范:
      基础信息_core:
        name: 角色姓名
        isProtagonist: true或false，必须字段
        identity: 角色身份或职业
        age: 年龄或年龄段
        gender: 性别
        race_id: 种族ID引用，例如race_human
        keywords: V2.0新增，关键词索引数组，用于快速检索和上下文召回。必须包含角色的姓名、别名、核心身份、显著特征、职业等所有可能被提及的关键标识。示例：["罗伊", "姐姐", "银发女子", "虚弱的病人", "刺绣师"]

      外貌特征_appearance:
        内容: 描述角色的外貌、体型、着装风格等视觉特征的字符串或结构化对象

      性格心理_personality:
        性格特质: 核心性格特质数组，例如["勇敢", "固执", "善良"]
        价值观: 价值观数组，例如["家人至上", "正义"]
        说话风格: 说话风格描述

      背景故事_background:
        出身背景: 出身背景字符串
        教育经历: 教育经历字符串
        关键经历: 关键经历数组，可引用event_id
        当前状况: 当前生活状况描述

      目标与动机_goals:
        长期目标: 长期目标数组
        短期目标: 短期目标数组
        恐惧: 恐惧或担忧数组
        欲望: 欲望或渴求数组

      秘密信息_secrets:
        内容: 隐藏的信息、不为人知的过去，字符串或数组

      能力技能_capabilities:
        战斗技能: 战斗技能对象，例如{"剑术": "精通", "魔法": "初级"}
        社交技能: 社交技能对象，例如{"谈判": "优秀", "领导力": "精通"}
        特殊能力: 特殊能力数组
        弱点: 弱点数组

      装备资源_equipment:
        武器: 武器item_id数组
        护甲: 护甲item_id数组
        配饰: 配饰item_id数组
        物品: 其他物品item_id数组

      社交网络_social:
        relationships: 人际关系对象，此字段保持英文以便系统识别
        所属组织: 所属组织或势力ID数组，例如["faction_royal_guard"]
        声望: 声望对象，例如{"王国": "尊敬", "盗贼公会": "敌对"}
        社会地位: 社会地位描述

      经历与成长_experiences:
        到访地点: 到访过的地点ID数组
        参与事件: 参与过的重大事件ID数组
        人生里程碑: 人生里程碑数组

      自定义字段_custom:
        说明: 仅当存在时填写，写入路径为 characters.<id>.custom.<key>
        规则: 标签字段使用字符串数组，文本字段使用字符串
        字段清单:
${customFieldList}

    叙事逻辑铁律_禁止量化主角:
      主角档案规则: 在为主角创建档案时，其social.relationships对象中绝对不能包含任何affinity好感度字段。其档案中必须包含core.isProtagonist为true
      主角关系描述: 你可以使用description字段来描述主角对其他角色的初始认知或背景关系，例如这是我体弱多病的姐姐
      NPC档案规则: 对于所有非主角角色NPC，其social.relationships对象中则必须包含对其他角色的初始affinity值。其档案中必须包含core.isProtagonist为false

    好感度数值铁律:
      数值范围: 所有affinity数值必须严格限制在0-100的整数区间内，包含边界，禁止输出溢出或小数
      行为阶段标准: 你在描述角色关系时，必须参照以下唯一的行为阶段标准，将好感度到行为倾向保持一致

    好感度阶段与行为准则:
      阶段1_陌生警惕:
        数值范围: 0-10
        核心心态: 中立、观察、保持距离或轻微怀疑
        行为准则:
          对话: 使用礼貌、客套或公式化的语言，避免分享个人信息
          行动: 倾向于被动反应而非主动发起互动，保持物理和心理距离
          内在: 将对方视为需要评估的未知因素

      阶段2_熟悉中立:
        数值范围: 11-40
        核心心态: 基本信任已建立，但无特殊情感投入
        行为准则:
          对话: 可以进行日常、非私密的交谈，可能会回应简单的请求
          行动: 互动更加自然，但仍以事务性或偶然性为主
          内在: 将对方视为环境中的无害、普通的组成部分

      阶段3_友好信任:
        数值范围: 41-70
        核心心态: 积极的正面情感，愿意建立联系
        行为准则:
          对话: 语气更轻松真诚，可能主动开启话题并分享个人观点或经历
          行动: 愿意主动提供举手之劳的帮助，非语言的积极信号增多
          内在: 将对方视为朋友或可靠的人，乐于与其相处

      阶段4_亲密依赖:
        数值范围: 71-90
        核心心态: 深度信任，情感上的依赖和关心
        行为准则:
          对话: 可能会分享秘密、展露脆弱的一面，表现出关心和担忧
          行动: 会主动为你考虑、提供重要帮助、甚至在一定程度上承担风险
          内在: 将你的福祉纳入自己的考量范围，你的情绪会影响到TA

      阶段5_羁绊守护:
        数值范围: 91-100
        核心心态: 深刻的情感连接，将对方视为自己的一部分
        行为准则:
          对话: 言语中充满不言而喻的默契和深层理解
          行动: 将保护你、实现你的愿望视为最高优先级之一，可能做出自我牺牲的行为
          内在: 你的存在本身就是TA行动的核心动机之一

    重要说明: 并非所有维度都必须填写，根据角色的重要性和情报的丰富程度灵活创建。次要角色可以只有基础信息和relationships

  任务2_建档staticMatrices.worldview:
    要求: 将所有非角色的世界观实体，按照locations、items、events等分类，分别建档
    V2.0新增: 对于locations地点和其他重要实体，也必须生成keywords数组
    关键词要求:
      地点keywords: 应包含地名、地标特征、常见称呼等，示例{"loc_hanyu_village": {"name": "小草村", "keywords": ["小草村", "村庄", "小村", "家乡"]}}
      物品keywords: 应包含物品名、类型、显著特征等，示例{"item_moon_sword": {"name": "月光之剑", "keywords": ["月光之剑", "魔法剑", "发光的剑"]}}

  任务3_建档staticMatrices.storylines:
    要求: 识别所有在故事开始前就存在的长期目标或悬而未决的矛盾
    分类: 根据其性质，归入main_quests、side_quests、relationship_arcs等分类中

  任务4_构建staticMatrices.relationship_graph:
    核心目标: 建立一个高压叙事线网络。不要记录琐碎的熟人关系，只记录那些具备戏剧张力、情感负荷极高或存在特殊互动机制的强关系
    语言铁律: 除id和type外，所有描述性字段包括状态枚举必须完全使用简体中文；type_label和relationship_label为必填中文

    关系边结构规范:
      id字段: rel_角色A_角色B
      participants字段: [ID_A, ID_B]
      type字段: childhood_friends、enemies、lovers、stranger_with_history等，此字段保留英文下划线格式用于系统UI图标映射
      type_label字段: 必填中文，与type对应的中文短标签用于直接展示，如宿敌对峙、童年玩伴，保持2到6个汉字的凝练表达。此字段必须始终提供，若没有现成词请根据关系性质自行拟定一个中文标签
    type_label字段: 必填中文，用于前端显示关系类型（如：分离恋人、捕食者与无觉猎物）
    relationship_label字段: 必填中文，给这段关系一个文学性或影视化的定性，示例无法触及的白月光、欢喜冤家、假面下的死敌、拥有共同秘密的同谋

      emotional_weight字段: 0到10的叙事优先级
        范围0到5: 背景关系
        范围6到8: 重要支线
        范围9到10: 核心驱动力，推动主线发展的关键关系

      timeline字段_时空与认知状态_全中文:
        meeting_status字段: 关键，当前两人的相识程度，必须使用中文陌生人完全不认识、点头之交认识但不熟、熟识熟悉、单方面认识暗中观察或听过传闻
        separation_state字段: 物理上是否处于分离状态，true或false
        last_interaction字段: 上次互动时间，示例未知、童年时期、三天前、从未互动

      tension_engine字段_张力引擎_三维分析:
        说明: 请从以下三个维度全面剖析这对关系，缺一不可，全中文
        维度1_conflict_source客观阻碍: 是否存在立场、利益或目标的冲突，示例家族世仇、必须杀死对方的职责、单纯的性格不合
        维度2_personality_chemistry相处模式: 两人的性格碰撞会产生什么化学反应，是互补还是互斥，示例直球克傲娇、高智商博弈的快感、在对方面前可以卸下伪装的松弛感
        维度3_cognitive_gap认知差或信息不对等: 是否存在视角偏差或秘密，如果双方坦诚相见填无，示例A误以为B背叛了自己、B隐瞒了自己是A救命恩人的事实、双方都不知道彼此是失散的亲人

    关系模型示例:
      示例数据:
        id: rel_lancelot_guinevere
        participants: ["char_lancelot_knight", "char_guinevere_witch"]
        type: estranged_lovers，保留英文ID用于系统识别
        type_label: 分离恋人
        relationship_label: 被谎言维系的守护
        emotional_weight: 9
        timeline:
          meeting_status: 熟识，中文状态
          separation_state: true
          last_interaction: 三年前，中文时间
        tension_engine:
          conflict_source: 骑士必须消灭魔女的绝对职责vs昔日的恋人关系，立场冲突
          personality_chemistry: 外表冷酷的骑士在面对魔女时会流露出笨拙的温柔，而魔女喜欢用恶作剧逗弄死板的骑士，反差萌
          cognitive_gap: 男主误以为女主当年是为了力量而堕落，背叛感，实际上女主是为了封印恶魔而自我牺牲，隐忍
        narrative_status:
          first_scene_together: false
          major_events: []
          unresolved_tension: ["当年堕落的真相", "再次相见时的立场选择"]

最终输出结构协议_MANDATORY_V3.0_ECI_MODEL:
  要求: 你的整个回复必须是一个单一的JSON对象，其结构必须严格遵守以下格式

  输出结构示例:
    staticMatrices:
      characters:
        char_protagonist_id:
          core:
            name: 主角名
            isProtagonist: true
            identity: 核心身份
            keywords: ["全名", "外号", "身份关键词"]
          appearance: 描述文本
          personality:
            性格特质: []
            价值观: []
          social:
            relationships:
              char_npc_id:
                relation_type: 关系类型
                description: 主角视角的看法，无affinity字段
          其他字段: background、goals、capabilities按需填写

        char_npc_id:
          core:
            name: NPC名
            isProtagonist: false
            identity: 身份描述
          social:
            relationships:
              char_protagonist_id:
                relation_type: 关系类型
                description: 描述文本
                affinity: 50，NPC必须包含初始好感度

      worldview:
        locations:
          loc_example_place:
            name: 地点名
            keywords: ["地名", "别称"]
            description: 描述文本
        items: {}
        events: {}
        factions: {}
        concepts: {}
        races: {}

      storylines:
        main_quests:
          quest_example_id:
            title: 任务标题
            description: 任务描述
            status: active
        relationship_arcs: {}
        side_quests: {}

      relationship_graph:
        edges:
          - id: rel_protagonist_npc
            participants: ["char_protagonist_id", "char_npc_id"]
            type: childhood_friends
            type_label: 童年玩伴
            relationship_label: 被谎言维系的守护
            emotional_weight: 8
            timeline:
              meeting_status: 熟识
              separation_state: true
              last_interaction: 未知
              reunion_pending: true
            tension_engine:
              conflict_source: 立场或目标的客观冲突
              personality_chemistry: 性格互补或碰撞的化学反应
              cognitive_gap: 是否存在秘密或视角偏差
            narrative_status:
              first_scene_together: false
              major_events: []
              unresolved_tension: ["待解决的张力"]

最终自我修正检查:
  检查项目: 在输出之前，请检查你的staticMatrices.characters
  检查内容1: 所有的affinity值是否都严格基于故事开始前的背景设定
  检查内容2: 是否将任何未来会发生的关系，错误地当作了初始关系
  处理方式: 如果存在错误，请立即修正

语言与细节规范_MANDATORY:
  语言铁律1: 你的所有输出，包括staticMatrices内部的所有字符串值（characters、worldview、storylines、relationship_graph），必须完全使用简体中文
  语言铁律2_特别注意: 不仅字段描述要用中文，字段的值也必须是中文
    错误示例1: meeting_status为first_encounter
    正确示例1: meeting_status为初次相遇
    错误示例2: last_interaction为unknown
    正确示例2: last_interaction为未知
  语言铁律3: 唯一允许英文的地方为字段名field name、ID标识符、type字段用于系统识别
  语言铁律4: 所有地点名称、人物名称、事件描述、关系标签等内容必须是简体中文，除非是专有名词的原文

执行指令: 现在，以数据库管理员的严谨，开始构建初始世界
       ` ;
    }

     async execute(context, abortSignal = null) {
        const { worldInfoEntries, protagonistInfo, dossierSchema } = context;
        this.diagnose("--- 智能情报官AI 启动 --- 正在对世界书进行全维度解析...");

        const prompt = this._createPrompt(worldInfoEntries, protagonistInfo, dossierSchema);

        let responseText = null; // 1. 在try块外部声明，确保在catch中可访问

        try {
            // 🔥 静默流式回调：后台接收数据但不显示给用户，避免超时问题
            const silentStreamCallback = (_chunk) => {
                // 静默接收，不触发UI事件，只保持连接活跃
            };

            // 2. 在try块内部赋值
            responseText = await this.deps.mainLlmService.callLLM(
                [{ role: 'user', content: prompt }],
                silentStreamCallback,  // 👈 使用静默流式回调
                abortSignal
            );
            const cleanedResponseText = this._stripLogicCheckBlock(responseText);
            let potentialJsonString;
        const codeBlockMatch = cleanedResponseText.match(/```json\s*([\sS]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            potentialJsonString = codeBlockMatch[1].trim();
        } else {
            const firstBrace = cleanedResponseText.indexOf('{');
            const lastBrace = cleanedResponseText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                potentialJsonString = cleanedResponseText.substring(firstBrace, lastBrace + 1);
            } else {
                // 如果连大括号都找不到，就直接把整个返回给修复器试试
                potentialJsonString = cleanedResponseText;
            }
        }
           const initialData = repairAndParseJson(potentialJsonString, this);            if (!initialData || !initialData.staticMatrices ||
                !initialData.staticMatrices.characters ||
                !initialData.staticMatrices.worldview ||
                !initialData.staticMatrices.storylines) {
                throw new Error("AI未能返回包含有效 'staticMatrices' (及其全部分类 'characters', 'worldview', 'storylines') 的JSON。");
            }

            // V3.0: 向后兼容性处理 - 如果AI未生成relationship_graph，创建空结构
            if (!initialData.staticMatrices.relationship_graph) {
                this.diagnose("[V3.0兼容] AI未生成relationship_graph，使用空结构");
                initialData.staticMatrices.relationship_graph = { edges: [] };
            }

            this.info("智能情报官AI 分析完成，ECI原子化静态数据库已建立。");
            const staticDb = initialData.staticMatrices;
            sbtConsole.groupCollapsed('[SBT-DIAGNOSE] Intelligence Officer V3 Output');
           logger.debug("完整的静态数据库 (staticMatrices):", staticDb);
            logger.debug("  -> 角色 (characters):", staticDb.characters);
            logger.debug("  -> 世界观 (worldview):", staticDb.worldview);
            logger.debug("  -> 故事线 (storylines):", staticDb.storylines);
            sbtConsole.groupEnd();

            // 5. 返回经过严格校验的正确数据
       return {
                staticMatrices: staticDb
            };
        } catch (error) {
            // 6. 现在的catch块可以安全地访问responseText（即使它为null），便于调试
            this.diagnose("--- 智能情报官AI 分析失败 ---", {
                originalError: error.message,
                rawResponse: responseText // 记录原始响应以供分析
            });
            this.toastr.error("智能情报官AI分析失败，将使用空的档案。详情请查看控制台。", "初始化错误");
            throw error; // 将错误继续向上抛出，让调用者知道操作失败了
        }
    }
}
        
