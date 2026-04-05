// ai/historianAgent.js (V10.0 - Compressed Edition)
import { createLogger } from '../utils/logger.js';
import { sbtConsole } from '../utils/sbtConsole.js';
const logger = createLogger('AI代理');

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js';
import { buildHistorianReport } from '../src/utils/HistorianReportBuilder.js';
import { parseSbtEdit } from '../src/utils/SbtEditParser.js';
import { commandsToDelta } from '../src/utils/SbtEditToDelta.js';
import { formatDossierSchemaForPrompt } from '../utils/dossierSchema.js';

export class HistorianAgent extends Agent {

    async execute(context, abortSignal = null) {
        this.diagnose(`--- 首席史官AI V10.0 启动 (Logic Audit Edition) ---`);

        sbtConsole.groupCollapsed('[SBT-HISTORIAN-PROBE] Received Full Input Context');
        sbtConsole.dir(JSON.parse(JSON.stringify(context)));
        sbtConsole.groupEnd();

        const prompt = this._createPrompt(context);

        // [SBT-DEBUG] 打印完整输入
        sbtConsole.groupCollapsed('【SBT-DEBUG】Historian Agent 完整输入');
        sbtConsole.log(prompt);
        sbtConsole.groupEnd();

        sbtConsole.groupCollapsed('[SBT-HISTORIAN] Full Historian AI System Prompt V10.0 (Compressed)');
        logger.debug(prompt);
        sbtConsole.groupEnd();

        // 【探针】检查输入的章节数据中的故事线信息
        sbtConsole.group('[HISTORIAN-PROBE] 输入章节数据检查');
        logger.debug('staticMatrices.storylines 键:', Object.keys(context.chapter.staticMatrices.storylines));
        Object.entries(context.chapter.staticMatrices.storylines).forEach(([cat, quests]) => {
            logger.debug(`  ${cat}: ${Object.keys(quests).length} 条`, Object.keys(quests));
        });
        logger.debug('dynamicState.storylines 键:', Object.keys(context.chapter.dynamicState.storylines));
        Object.entries(context.chapter.dynamicState.storylines).forEach(([cat, states]) => {
            logger.debug(`  ${cat}: ${Object.keys(states).length} 条`, Object.keys(states));
        });
        sbtConsole.groupEnd();

        const messages = [{ role: 'user', content: prompt }];

        sbtConsole.groupCollapsed('[SBT-HISTORIAN-PROBE] Payload to LLM API');
        sbtConsole.dir(JSON.parse(JSON.stringify(messages)));
        sbtConsole.groupEnd();

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

        // [SBT-DEBUG] 打印完整输出
        sbtConsole.groupCollapsed('【SBT-DEBUG】Historian Agent 完整输出');
        sbtConsole.log(responseText);
        sbtConsole.groupEnd();

        const cleanedResponseText = this._stripLogicCheckBlock(responseText);
        const sbtEditResult = parseSbtEdit(cleanedResponseText);
        if (sbtEditResult.errors.length > 0 && !(sbtEditResult.errors.length === 1 && sbtEditResult.errors[0] === 'missing_tag')) {
            this.warn(`[Historian] SbtEdit parse warnings: ${sbtEditResult.errors.slice(0, 5).join(', ')}`);
        }

        let result = null;
        if (sbtEditResult.commands.length > 0) {
            result = commandsToDelta(sbtEditResult.commands, { warn: this.warn || sbtConsole.warn });
            if (!result || Object.keys(result).length === 0) {
                this.warn("[Historian] <SbtEdit> 未生成有效增量，回退JSON解析");
                result = null;
            } else {
                this.info("[Historian] 使用 <SbtEdit> 指令解析路径");
            }
        }

        if (!result) {
            let potentialJsonString;
            const codeBlockMatch = cleanedResponseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
                potentialJsonString = codeBlockMatch[1].trim();
            } else {
                const firstBrace = cleanedResponseText.indexOf('{');
                const lastBrace = cleanedResponseText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    potentialJsonString = cleanedResponseText.substring(firstBrace, lastBrace + 1);
                } else {
                    potentialJsonString = cleanedResponseText;
                }
            }

            result = repairAndParseJson(potentialJsonString, this);
            this.info("[Historian] 使用 JSON 修复解析路径");
        }

        const hasDeltaPayload = (data) => {
            if (!data || typeof data !== 'object') return false;
            return Boolean(
                data.creations ||
                data.updates ||
                data.new_long_term_summary ||
                data.relationship_updates ||
                data.chronology_update ||
                data.stylistic_analysis_delta ||
                data.rhythm_assessment
            );
        };

        if (!hasDeltaPayload(result)) {
            this.diagnose("史官AI返回的结构不完整（未包含有效增量）。Raw Response:", responseText);
            throw new Error("史官AI未能返回包含有效增量的结果。");
        }
        if (result.creations === undefined) result.creations = {};
        if (result.updates === undefined) result.updates = {};

            // 【探针】检查故事线更新
            sbtConsole.group('[HISTORIAN-PROBE] 故事线更新检查');
            if (result.updates.storylines) {
                const categories = Object.keys(result.updates.storylines);
                this.info(`✓ 史官输出了故事线更新，分类数: ${categories.length}`);
                categories.forEach(cat => {
                    const storylines = Object.keys(result.updates.storylines[cat]);
                    this.info(`  -> ${cat}: ${storylines.length} 条故事线`);
                    storylines.forEach(id => {
                        const update = result.updates.storylines[cat][id];
                        const fields = Object.keys(update);
                        this.info(`    -> ${id}: 包含字段 [${fields.join(', ')}]`);
                        logger.debug(`      完整内容:`, JSON.parse(JSON.stringify(update)));
                    });
                });
            } else {
                this.warn('❌ 史官未输出任何故事线更新 (updates.storylines 不存在或为空)');
            }
            sbtConsole.groupEnd();

            this.info("--- 首席史官AI--- 审查完毕，数据库事务增量已生成。");
            sbtConsole.groupCollapsed('[SBT-HISTORIAN-PROBE] Final Parsed Output');
            sbtConsole.dir(JSON.parse(JSON.stringify(result)));
            sbtConsole.groupEnd();

            return result;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            this.diagnose("--- 首席史官AI在编纂历史时失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`章节复盘失败: ${error.message.substring(0, 200)}...`, "史官AI错误");
            }
            return null;
        }
    }

     _createPrompt(context) {
        const {
            chapterTranscript,
            chapter
        } = context;

        // V10.0: 提取必要数据（移除剧本和文体档案依赖）
        const staticMatrices = chapter.staticMatrices;
        const longTermStorySummary = chapter.meta.longTermStorySummary;
        const currentChapterNumber = chapter.meta.chapterNumber || 1;
        const currentTimestamp = new Date().toISOString();
        const readonlyReport = buildHistorianReport(chapter);
        const isFullArchiveEnabled = localStorage.getItem('sbt-historian-full-inject-enabled') === 'true';
        const fullArchiveContent = isFullArchiveEnabled ? this._buildFullArchive(chapter) : '';
        const customFieldList = formatDossierSchemaForPrompt(context?.dossierSchema);

        // V10.0: 提取叙事节奏环状态（用于节奏评估）
        const narrativeRhythmClock = chapter?.meta?.narrative_control_tower?.narrative_rhythm_clock || {
            current_phase: "inhale",
            cycle_count: 0,
            current_phase_duration: 0
        };

        // V10.0: 提取年表信息（用于时间判定）
        const chronology = chapter?.dynamicState?.chronology || {
            day_count: 1,
            time_slot: "evening",
            weather: null,
            last_rest_chapter: null
        };

        // V10.0: 提取叙事模式配置（用于节奏评估的模式感知）
        const narrativeMode = chapter?.meta?.narrative_control_tower?.narrative_mode || {
            current_mode: 'classic_rpg',
            mode_config: {}
        };

        // 【探针】生成实体清单前先检查数据
        sbtConsole.group('[HISTORIAN-PROBE] 生成实体清单');
        logger.debug('staticMatrices.storylines 结构:', JSON.parse(JSON.stringify(staticMatrices.storylines)));

        const storylineList = Object.entries(staticMatrices.storylines).flatMap(([category, quests]) => {
            logger.debug(`  -> 分类 ${category}: ${Object.keys(quests).length} 条故事线`);
            return Object.entries(quests).map(([id, data]) => {
                logger.debug(`    -> ${id}: ${data.title}`);
                return `- ${data.title} (ID: ${id}, 分类: ${category})`;
            });
        });
        logger.debug('生成的故事线列表:', storylineList);
        sbtConsole.groupEnd();

        const formatEntityList = (entries, nameGetter) => {
            const list = Object.entries(entries || {}).map(([id, data]) => {
                const name = nameGetter ? nameGetter(data, id) : (data?.name || data?.core?.name || id);
                return `- ${name} (ID: ${id})`;
            });
            return list.length > 0 ? list.join('\n') : '（暂无）';
        };

        const existingEntityManifest = `
<existing_characters>
${formatEntityList(staticMatrices.characters, (data, id) => data?.core?.name || data?.name || id)}
</existing_characters>
<existing_locations>
${formatEntityList(staticMatrices.worldview?.locations)}
</existing_locations>
<existing_items>
${formatEntityList(staticMatrices.worldview?.items)}
</existing_items>
<existing_factions>
${formatEntityList(staticMatrices.worldview?.factions)}
</existing_factions>
<existing_concepts>
${formatEntityList(staticMatrices.worldview?.concepts)}
</existing_concepts>
<existing_events>
${formatEntityList(staticMatrices.worldview?.events)}
</existing_events>
<existing_races>
${formatEntityList(staticMatrices.worldview?.races)}
</existing_races>
<existing_storylines>
${storylineList.length > 0 ? storylineList.join('\n') : '（暂无故事线）'}
</existing_storylines>
`;

        const baseInstructions = `
首席档案维护官数据库事务协议_V10.0_Logic_Audit_Compressed:

身份: 因果律审计师
职责: 审计录像，记录如何改变世界状态
禁令: 无剧本，只记录实际发生的事

  语言铁律:
    要求1: 所有输出内容必须100%使用简体中文
    要求2: 所有描述性字段的值必须是中文，例如meeting_status要填初次相遇而非first_encounter
    要求3: 地点名称、事件描述、关系标签等所有内容必须是中文
    要求4: 唯一允许英文的地方为字段名field name和ID标识符；关系边的type_label与relationship_label必须是中文

  审计素材:
  录像: <chapter_transcript>${chapterTranscript}</chapter_transcript>
  当前章节: 第${currentChapterNumber}章，时间戳${currentTimestamp}
  世界档案: 第${chronology.day_count}天，${chronology.time_slot}
${existingEntityManifest}
  只读报告(ASCII keys):
    <readonly_report>${readonlyReport}</readonly_report>
  全量档案(可选):
    <full_archive>${fullArchiveContent || '（未开启全量注入）'}</full_archive>
  全局故事总梗概_从第1章到第${currentChapterNumber - 1}章: ${longTermStorySummary}
  重要提示: 这是截至上一章结束的全局总梗概，包含了从故事开始到现在的所有重要情节。你需要在此基础上累加本章内容，而不是替换它
  节奏环: 当前相位${narrativeRhythmClock.current_phase}，已持续${narrativeRhythmClock.current_phase_duration}章，周期${narrativeRhythmClock.cycle_count}

未完成事项捕捉协议_强制入网:
  核心原则: 宁可过度建档，不可漏建。凡是未解决困境、难题、未完成目标、未闭环事件，必须进入故事线网络。
  强制扫描范围:
    - 未解决的困境/难题（卡住、僵局、缺失关键线索）
    - 未完成目标/承诺（角色明确要做但尚未完成）
    - 未闭环事件（线索/危机/威胁出现但未收束）
    - 关系矛盾/误解未化解
    - 资源/条件不满足导致的持续障碍
  全部入网规则:
    - 若可归入既有故事线，必须更新该线的history_entry与current_summary
    - 若无法明确归属，必须创建side_quests记录
  新建记录必填字段:
    - title: 中文简短标题
    - summary: 困境/目标 + 当前状态
    - trigger: 本章触发场景或触发语句
    - objectives: 1-3条“尚未完成的目标/解法”
    - involved_entities: 可空，但优先填写

核心方法论:

  方法M1_实体对账与创生:
    任务: 对比清单，识别新实体。为新实体分配ECI_ID，创建档案

    角色档案:
      完整字段: core、appearance、personality包含性格特质数组、价值观数组、说话风格、background、goals包含长期目标数组、短期目标数组、恐惧数组、欲望数组、capabilities包含战斗技能对象、社交技能对象、特殊能力数组、弱点数组、social包含relationships对象
      次要角色: 仅需core和social.relationships

    世界观档案:
      任务: 识别录像中出现的新地点、物品、势力、概念、历史事件、种族
      locations字段: name、description、type、atmosphere
      items字段: name、description、properties、owner
      factions字段: name、description、ideology、influence
      concepts字段: name、description、significance
      events字段: name、description、timeframe、participants
      races字段: name、description、traits

    故事线档案:
      任务: 识别新触发的任务或关系
      允许创建: main_quests、side_quests、relationship_arcs，当建立新关系或关系性质发生根本改变时
      禁止创建: personal_arcs，心理成长仅限更新已有项
      完整字段: id、title、summary、status、trigger、objectives、involved_entities、progress_milestones
      必填字段说明:
        id字段: 唯一标识符，必须严格遵守以下命名规范
          main_quests命名: 使用quest_main_前缀或quest_前缀不含side，例如quest_main_investigate、quest_mystery
          side_quests命名: 使用quest_side_前缀或side_前缀，例如quest_side_delivery、side_merchant
          relationship_arcs命名: 使用arc_rel_前缀，例如arc_rel_protagonist_npc1
          personal_arcs命名: 使用arc_personal_前缀或arc_前缀不含rel，例如arc_personal_overcome_fear、arc_growth
          违规后果: ID格式不匹配分类将被系统自动拒绝，数据直接丢弃
        title字段: 故事线标题，必填简洁明确
        summary字段: 详细描述，说明故事线的起因、目标、当前状态
        status字段: 状态，可选默认active，可选值active、paused、completed、failed
        trigger字段: 触发条件或起因，推荐填写描述录像中触发此故事线的具体事件
        objectives字段: 目标列表，推荐填写数组格式列出需要完成的具体目标
        involved_entities字段: 相关实体ID，可选数组格式例如["char_npc1", "loc_temple"]
        progress_milestones字段: 进度里程碑，可选对象格式例如{0: "开始", 50: "中期", 100: "完成"}

    关系边档案:
      触发条件: 发现两个角色首次建立联系时，创建新的relationship_graph.edges
      完整字段: id、participants数组包含char1和char2、type、type_label、relationship_label、affinity、emotional_weight、narrative_voltage、cognitive_gap、conflict_source、personality_chemistry、timeline包含meeting_status、separation_state、last_interaction、narrative_status包含first_scene_together
      必填字段说明:
        affinity字段: 初始好感度0到100，根据首次互动的性质评估
        emotional_weight字段: 情感权重0到10，0等于陌生、5等于有意义、8以上等于高压关系
        narrative_voltage字段: 叙事电压0到10，关系对剧情的潜在冲击力
        cognitive_gap字段: 认知差距可选，如果存在信息不对等或误解说明具体内容
        conflict_source字段: 冲突来源可选，两人之间的主要矛盾点
        personality_chemistry字段: 性格化学反应，描述两人的互动风格

  方法M2_关系裁决_双轨同步协议:
    铁律: 只更新NPC对主角或NPC对NPC的好感度，禁止量化主角情感
    好感度阶段_0到100禁止溢出或小数: 0到10陌生、11到40熟悉、41到70信任、71到90亲密、91到100羁绊

    关键_新关系创建时的双轨初始化:
      触发条件: 当录像中出现两个角色首次建立联系时，你必须执行双轨同步创建
      轨道1_关系图谱: 输出到creations.staticMatrices.relationship_graph.edges，创建包含完整字段的关系边见上文M1
      轨道2_角色关系: 输出到creations.staticMatrices.characters.char_id.social.relationships.target_id，同时为两个方向都创建初始关系数据
        char_A的关系: char_A.social.relationships.char_B包含relation_type、description、affinity
        char_B的关系: char_B.social.relationships.char_A包含relation_type、description、affinity
      注意事项: 如果角色尚不存在于数据库中，先在creations.staticMatrices.characters中创建角色档案

    已有关系更新:
      输出: updates.characters.NPC_ID.social.relationships.target_ID包含current_affinity、history_entry、narrative_advancement
      narrative_advancement字段: 如果关系变化具有重大叙事权重，请附加此项
        weight字段: 0到10，此事件对故事的推动力有多大，例如激烈争吵为8、普通对话为2
        significance字段: 事件性质，例如major_tension、intimacy_breakthrough、trust_damaged
        reasoning字段: 简述理由

  方法M3_统一事件审计_Unified_Event_Auditing:
    原则: 将内容更新和进度更新合并为一个原子操作
    强制规则: 只要本章出现未解决困境/难题/未完成目标/未闭环事件，updates.storylines必须包含至少一条更新或创建，否则视为审计失败
    行动口令: 宁可多建，不可漏建

    故事线更新:
      输出: updates.storylines.cat.id包含current_status、current_summary、history_entry、advancement
      advancement字段: 如果故事线有实质进展，请附加此项
        progress_delta字段: 0到25，进度增量百分比
        new_stage字段: 可选，如果跨越了阈值进入的新阶段名称例如集结阶段
        reasoning字段: 简述理由

    分类权限锁_Category_Permission_Lock_架构级强制执行:
      Main或Side_Quests规则: 允许自由创建新任务creations和更新旧任务updates
      Personal或Relationship_Arcs规则_严禁创建:
        只读模式: 你禁止在creations中为这两个分类添加新ID
        仅限更新: 你只能在updates中更新列表中已存在的ID
        架构级拦截: 如果你在creations或updates中为personal_arcs或relationship_arcs创建新ID，系统会立即拒绝处理并丢弃该数据
        成长处理: 如果发生了不在现有列表中的新成长例如主角突然觉醒了正义感，请将这段描述合并到触发该成长的Main或Side_Quest的摘要中，不要为此新建条目

    分类与摘要铁律_STRICTLY_ENFORCED:
      分类隔离铁律:
        禁止1: 严禁将main_quests主线或side_quests支线的ID例如quest_xxx放入personal_arcs中
        禁止2: 严禁在多个分类中重复输出同一个ID例如在main_quests和personal_arcs中同时更新quest_mystery
        规则: 每个ID只能属于一个分类，且由ID的前缀决定见上文命名规范
        违规后果: 系统会自动检测并拒绝处理ID格式不匹配或跨分类重复的数据
      Personal_Arc定义: 仅限角色的内心成长、心理创伤修复或价值观转变。具体的杀怪或找东西任务属于side_quests
      乱码零容忍: 如果没有新的摘要更新，请直接省略summary字段，严禁输出尚未撰写、暂无等占位符，这会导致系统乱码

    谜团或危机追踪器_New:
      适用场景: 对于持续出现但尚未命名或解决的现象例如未知吼叫频段、重复出现的神秘信号、无法解释的环境失常，若跨章节仍无定论，必须创建side_quest或main_quest进行跟踪
      trigger字段: 需写明首次出现的场景
      summary字段: 必须说明当前掌握的信息与待解问题
      僵局处理: 当本章仅复述旧线索或调查陷入僵局时，请在相应故事线的history_entry中写继续调查但无突破，进度可以保持0%或不变，禁止让线索凭空消失

  方法M4_角色档案全维度更新:
    可更新字段: core包含identity身份、外貌、personality包含性格特质、价值观、说话风格、goals、capabilities包含战斗技能、社交技能、特殊能力、弱点、equipment包含武器、护甲、物品、experiences包含到访地点、参与事件、人生里程碑
    禁令: 不使用operation、values、append等操作符，数组必须输出完整的更新后数组
    自定义字段: 仅在有新信息时更新，写入 updates.characters.<id>.custom.<key>；标签字段使用字符串数组
    字段清单:
${customFieldList}

  方法M4.5_全量条目覆盖输出_强制:
    目标: 现有每一个条目都必须出现在输出中，避免遗漏
    规则:
      - 清单中的每个角色/地点/物品/势力/概念/事件/种族/故事线条目必须逐条输出
      - 需要修改的条目: 使用 updateEntity 或 updateStoryline 按原规则更新
      - 无需修改的条目: 使用占位指令 keepEntity(category,id) 或 keepStoryline(category,id)
      - 禁止在 summary/current_summary 等字段写“暂无/未更新/无变化”等占位文字
      - keep* 仅用于占位，不应携带任何数据

  方法M5_条状章节梗概:
    输出字段: new_long_term_summary
    目标: 章节梗概改为“按章条状追加”的短句列表
    格式:
      - 多行文本，每行一条梗概
      - 不要编号，不要前缀，顺序即章节顺序
    更新规则:
      - 读取上文 longTermStorySummary 作为既有条目
      - 当前章只追加一行新条目，旧条目必须原样保留，不得改写
    字数上限:
      - 每条尽量控制在50字以内
    示例:
      旧:
        深夜酒馆爆发冲突，主角被迫接下护送任务
      新:
        深夜酒馆爆发冲突，主角被迫接下护送任务
        途中遇伏击，主角识破伪装救下关键线人

  方法M6_关系图谱状态更新:
    新关系创建: 两个角色首次建立联系，加入creations.staticMatrices.relationship_graph.edges
    已有关系更新: 本章有直接对话或身体接触，更新relationship_updates数组
    更新字段: timeline.last_interaction、timeline.separation_duration为none、timeline.reunion_pending为false、narrative_status.major_events完整数组、narrative_status.unresolved_tension

  方法M7_叙事节奏环评估:
    四相位: inhale铺垫3到6、hold憋气6到8、exhale爆发8到10、pause沉淀10到3
    模式: ${narrativeMode?.current_mode === 'web_novel' ? '网文模式_inhale为1到2章、hold为2到3章、exhale为2到3章、pause为1章、intensity大于等于5强制、pause最多1章' : '正剧模式_inhale为2到4章、hold为1到2章、exhale为1到2章、pause为1到3章、允许低强度1到2、完整周期优先'}
    情感强度评分_1到10严格: 1到2为日常寒暄、3到4为有意义对话、5到6为重要信息或关系推进、7到8为关系里程碑、9到10仅限极端事件告白或拒绝或背叛或生死
    输出: rhythm_assessment包含current_phase、recommended_next_phase、phase_transition_triggered、phase_transition_reasoning、emotional_intensity、intensity_reasoning、chapter_type、narrative_devices_used包含spotlight_protocol和time_dilation、cycle_increment

  方法M8_时间流逝判定:
    same_slot情况: 对话或短距离移动小于100米、小于1小时、time_slot不变
    next_slot情况: 复杂事件或长距离移动、1到4小时、推进time_slot，dawn到morning到noon到afternoon到dusk到evening到late_night到dawn加1天
    time_jump情况: 睡觉或剧本明确跳跃、加1天或更多、重置time_slot、更新生理状态包含fatigue和hunger
    输出: chronology_update包含transition_type、new_day_count、new_time_slot、new_weather、reasoning、npc_schedule_hint

输出协议_SbtEdit:
  你的回复必须包含 <SbtEdit> ... </SbtEdit> 标签
  标签内每行一条函数调用指令，禁止输出原始JSON
  参数必须是合法JSON（字符串必须使用双引号）
  允许函数:
    createEntity(category,id,data)
    updateEntity(category,id,data)
    updateStoryline(category,id,data)
    keepEntity(category,id)
    keepStoryline(category,id)
    appendRelationshipEdge(data)
    updateRelationshipEdge(edgeId,updates)
    updateCharacterRelationship(charId,targetId,data)
    updateChronology(data)
    setLongTermSummary(text)
  category示例: characters, worldview.locations, storylines.main_quests

最终输出格式:
  格式: SbtEdit指令
  说明: 以下JSON结构仅用于字段参考，真实输出必须用<SbtEdit>函数指令表达
  结构示例:
    creations:
      staticMatrices:
        characters:
          char_new_npc示例:
            core:
              name: NPC名
              identity: 身份描述
            social:
              relationships:
                char_protagonist:
                  relation_type: 初识
                  description: 关系描述
                  affinity: 15
        worldview: 空对象或包含新地点、物品等
        storylines:
          main_quests:
            quest_investigate_mystery示例:
              id: quest_investigate_mystery
              title: 调查神秘事件
              summary: 主角在酒馆听说了城郊发生的怪异现象，决定前往调查真相
              status: active
              trigger: 在酒馆与老板的对话中得知消息
              objectives: [前往城郊, 收集线索, 找到真相]
              involved_entities: [char_protagonist, loc_suburb]
              progress_milestones:
                0: 任务开始
                33: 抵达城郊
                66: 发现关键线索
                100: 真相大白
          side_quests:
            side_help_merchant示例:
              id: side_help_merchant
              title: 帮助商人找回货物
              summary: 路遇商人求助，他的货物在运输途中遗失
              status: active
              trigger: 路上偶遇商人
              objectives: [寻找货物, 归还商人]
        relationship_graph:
          edges数组:
            元素示例:
              id: rel_protagonist_new_npc
              participants: [char_protagonist, char_new_npc]
              type: acquaintance
              type_label: 初识关系
              relationship_label: 陌生人
              affinity: 15
              emotional_weight: 2
              narrative_voltage: 3
              cognitive_gap: null
              conflict_source: null
              personality_chemistry: 礼貌但保持距离
              timeline:
                meeting_status: 初次相遇
                separation_state: 未分离
                last_interaction: 当前章节UID
              narrative_status:
                first_scene_together: 当前章节UID
    updates:
      characters:
        char_npc:
          social:
            relationships:
              char_yumi:
                current_affinity: 78
                history_entry:
                  change: 5
                  reasoning: A对B的控制欲感到不安
                narrative_advancement:
                  weight: 7
                  significance: major_tension
                  reasoning: 控制欲初显
      storylines:
        main_quests:
          quest_main_01:
            current_summary: A到达了B家，控制塔的第一个谜题摆在她面前
            history_entry:
              summary: 抵达新地点
            advancement:
              progress_delta: 5
              new_stage: 集结阶段
              reasoning: 到达中心据点
    relationship_updates数组:
      元素示例:
        relationship_id: rel_protagonist_existing_npc
        updates:
          timeline:
            last_interaction: 当前章节UID
            separation_duration: none
          narrative_status:
            major_events: [本章发生的重要事件]
    new_long_term_summary: 完整故事摘要文本
    chronology_update:
      transition_type: same_slot或next_slot或time_jump
      其他字段: 根据情况填写
    rhythm_assessment: 节奏评估对象

审计检查清单:
  项目1: 基于录像非想象?
  项目2: 全部简体中文?
  项目3: 识别了所有新实体，包括角色、地点、物品、故事线、关系?
  项目4_故事线ID命名规范: 所有故事线ID是否严格遵守前缀规范，quest_main_、quest_side_、arc_rel_、arc_personal_?
  项目5_分类隔离检查: 是否确保每个ID只在一个分类中出现，没有跨分类重复?
  项目6_权限锁检查: 是否避免在personal_arcs或relationship_arcs中创建新ID?
  项目7: 新故事线是否包含完整字段，id、title、summary、status、trigger、objectives等?
  项目8: 新关系是否执行了双轨同步创建，relationship_graph.edges和characters.social.relationships?
  项目9: 关系边是否包含完整字段，affinity、emotional_weight、narrative_voltage等?
  项目10: 故事线体现逻辑链?
  项目11: 关系捕捉位阶变化?
  项目12: 只更新真实变化?
  项目13: 是否识别并入网了未解决困境/难题/未完成目标/未闭环事件?
  项目14: 是否为每个未完成事项提供storylines记录?
  项目15: 是否避免只叙述不建档?
  项目16: 是否为清单中的每个现有条目输出了更新或 keep* 占位?

现在，开始因果律审计。
`;

        return BACKEND_SAFE_PASS_PROMPT + baseInstructions;
    }

    _buildFullArchive(chapter) {
        try {
            const staticMatrices = chapter?.staticMatrices || {};
            return `\n\\\`\\\`\\\`json\n${JSON.stringify(staticMatrices, null, 2)}\n\\\`\\\`\\\``;
        } catch (error) {
            this.warn('[Historian] Full archive serialization failed:', error);
            return '';
        }
    }
}
