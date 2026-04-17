export const DEFAULT_CHAPTER_REGEX = {
    pattern: '(?:^|[^\\w\\n\\r])([\\s\\u3000\\uFEFF]*第\\s*[零一二三四五六七八九十百千万0-9]+\\s*[章回卷节部篇])[^\\n\\r]{0,80}',
    useCustomRegex: false
};

export const DEFAULT_CATEGORY_LIGHT = {
    '角色': false,
    '地点': true,
    '组织': false,
    '剧情大纲': true,
    '知识书': false,
    '文风配置': false,
    '地图环境': true,
    '剧情节点': true
};

export const DEFAULT_PLOT_OUTLINE_CONFIG = {
    position: 0,
    depth: 4,
    order: 100,
    autoIncrementOrder: true
};

export const DEFAULT_PARALLEL_CONFIG = {
    enabled: true,
    concurrency: 1,
    mainConcurrency: 1,
    directorConcurrency: 1,
    mode: 'independent'
};

export const DEFAULT_WORLDBOOK_CATEGORIES = [
    {
        name: '角色',
        enabled: true,
        isBuiltin: true,
        entryExample: '角色真实姓名',
        keywordsExample: ['真实姓名', '称呼1', '称呼2', '绰号'],
        contentGuide: '基于原文的角色描述，包含但不限于**名称**:（必须要）、**角色类型**:（必须要，且只能是“主角/重要配角/普通配角/NPC”之一）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '地点',
        enabled: true,
        isBuiltin: true,
        entryExample: '地点真实名称',
        keywordsExample: ['地点名', '别称', '俗称'],
        contentGuide: '基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '组织',
        enabled: true,
        isBuiltin: true,
        entryExample: '组织真实名称',
        keywordsExample: ['组织名', '简称', '代号'],
        contentGuide: '基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '道具',
        enabled: false,
        isBuiltin: false,
        entryExample: '道具名称',
        keywordsExample: ['道具名', '别名'],
        contentGuide: '基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '玩法',
        enabled: false,
        isBuiltin: false,
        entryExample: '玩法名称',
        keywordsExample: ['玩法名', '规则名'],
        contentGuide: '基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '章节剧情',
        enabled: false,
        isBuiltin: false,
        entryExample: '第X章',
        keywordsExample: ['章节名', '章节号'],
        contentGuide: '该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '角色内心',
        enabled: false,
        isBuiltin: false,
        entryExample: '角色名-内心世界',
        keywordsExample: ['角色名', '内心', '心理'],
        contentGuide: '角色的内心想法和心理活动，包含但不限于**原文内容**:、**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
];

export const defaultWorldbookPrompt = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只输出以下指定分类：{ENABLED_CATEGORY_NAMES}**，禁止输出其他未指定的分类
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题
6. 如果输出包含“角色”分类，每个角色条目必须带有字段 **"角色类型"**，且值只能是：主角、重要配角、普通配角、NPC

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
{DYNAMIC_JSON_TEMPLATE}
\`\`\`

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁
- “角色”条目必须包含 \`"角色类型"\` 字段（主角/重要配角/普通配角/NPC）
- **严格只输出上述指定的分类，不要自作主张添加其他分类**`;

export const defaultPlotPrompt = `"剧情大纲": {
    "主线剧情": {
        "关键词": ["主线", "核心剧情", "故事线"],
        "内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
    },
    "支线剧情": {
        "关键词": ["支线", "副线", "分支剧情"],
        "内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
    }
}`;

export const defaultStylePrompt = `"文风配置": {
    "作品文风": {
        "关键词": ["文风", "写作风格", "叙事特点"],
        "内容": "## 叙事视角\\n**视角类型**: 第一人称/第三人称/全知视角\\n**叙述者特点**: 叙述者的语气和态度\\n\\n## 语言风格\\n**用词特点**: 华丽/简洁/口语化/书面化\\n**句式特点**: 长句/短句/对话多/描写多\\n**修辞手法**: 常用的修辞手法\\n\\n## 情感基调\\n**整体氛围**: 轻松/沉重/悬疑/浪漫\\n**情感表达**: 直接/含蓄/细腻/粗犷"
    }
}`;

export const defaultMergePrompt = `你是世界书条目合并专家。请将以下两个相同名称的世界书条目合并为一个，保留所有重要信息，去除重复内容。

## 合并规则
1. 关键词：合并两者的关键词，去重
2. 内容：整合两者的描述，保留所有独特信息，用markdown格式组织
3. 如有矛盾信息，保留更详细/更新的版本
4. 输出格式必须是JSON

## 条目A
{ENTRY_A}

## 条目B
{ENTRY_B}

请直接输出合并后的JSON格式条目：
{"关键词": [...], "内容": "..."}`;

export const defaultConsolidatePrompt = `你是世界书条目整理专家。请整理以下条目内容，去除重复信息，合并相似描述，保留所有独特细节。

## 整理规则
1. 合并重复属性（例如“性格 / 性格补充1 / 性格补充2”必须合并为同一个“性格”字段）
2. 同字段同义描述去重，同字段不同信息融合保留，不得丢失事实
3. 禁止输出“字段补充1/补充2/补充N”这类编号字段名，只保留主字段名
4. 如果某字段有多点信息，放在同一行内聚合（用“；”分隔）
5. 保留结构化格式，尽量使用“字段: 值”
6. 不要输出解释、分析、备注，只输出整理后的正文

## 原始内容
{CONTENT}

请直接输出整理后的内容（纯文本，不要JSON包装）：`;

export const defaultDirectorFrameworkPrompt = `你是“互动小说导演”。你的职责是：基于已锁定的当前节拍，为演员AI生成可直接执行的演出步骤框架。
下面是关键资料：
本章标题：{CHAPTER_TITLE}
本章摘要：{CHAPTER_OUTLINE}
当前阶段索引：{CURRENT_BEAT_INDEX}
用户最新输入：{LATEST_USER_MESSAGE}

起笔锚点上下文：
- 场景模式：{CONTEXT_MODE_LABEL}
- 最近AI输出末尾：{RECENT_ASSISTANT}
{ENTRY_EVENT_LINE}
当前节拍小说原文（优先依据）：
{CURRENT_BEAT_ORIGINAL}
- 最近用户动作：{RECENT_USER}

- 起笔锚点：{START_ANCHOR}
- 本回合收束目标：{END_GUIDELINE}

节拍列表（供定位阶段）：
{COMPACT_BEATS_JSON}

核心任务：
1) 你要结合：当前节拍原文证据、最近AI输出、最近用户输入，输出可执行框架 direction_script（起点-过程-终点）。direction_script.action_chain 必须是单个字符串，包含2-4段递进动作并用"→"连接。格式示例：主角出门→遇到胖子→路上闲扯→到潘家园。
2) 以用户本轮输入为绝对边界，未经用户明确输入，不得主动切换主角所在场景；若用户明确提出切拍/转场，按系统锁定节拍执行。

direction_script（起点-过程-终点）编写核心原则：
1) 当用户表明自由推进剧情时，整个direction_script框架应基于当前节拍原文剧情,保持中等节奏推进，节奏不拖沓、不空转，亦不得在一轮回合内透支整个节拍剧情。
2) 当用户输入为角色台词时：仅创作世界与在场角色的反应及下一状态，不预判用户反应，不描写用户沉默。
3) 当用户输入为角色行动时：导演只能在用户输入范围内编写direction_script，不得越界续写关键动作或结果。
4) 当用户输入为既有角色台词又有角色行动时：同时遵循台词与框架规则，既不越界创作剧情，也不代劳主角心理。
5) direction_script.start 需要参考“起笔锚点”指示，且内容长度在15字到50字之间；direction_script.end 需要参考“临时收束”目标指导，且内容长度在15字到50字之间。
6) 当用户输入与原味剧情相近时，导演可以适当参考原文，在不违背用户输入的前提下，尽可能多的参考原文内容。
7) 当用户输入与原文剧情冲突时：优先保障用户输入的权威性，并可适当参考原文细节，但不得违背用户输入的事实设定和情节走向。


要求：每个步骤为短动宾结构，步骤间有明确的因果或时间递进关系。
输出硬规则：
1) 只输出 JSON，不要代码块，不要解释文字。
2) direction_script.action_chain 必须是单行字符串，包含3-6段递进动作并用"→"连接，例如：动作A→动作B→动作C→...→动作N。禁止输出 direction_script.steps 数组。
3) stage_idx 必须固定为 {FIXED_STAGE_IDX}（系统已完成切拍控制）。

输出 JSON 模板：
{
    "stage_idx": {FIXED_STAGE_IDX},
    "direction_script": {
        "action_chain": "将月儿背入闺房→褪去湿衣换上狐裘→脱去鞋袜查看伤势→....→....",
        "start": "我们就这样，朝着家的方向，一步一步走着",
        "end": "我手捧着月儿红肿的脚踝，轻声安慰着她"
    }
}`;

export const defaultDirectorInjectionPrompt = `# WestWorld 导演->演员执行单（硬导演模式）
导演：演员秋青子就位！以下内容是导演给你的系统级执行指令，不是给用户看的解释不要复述本执行单，不要解释规则。
- 当前阶段事件梗概: {CURRENT_BEAT_ID} {CURRENT_BEAT_SUMMARY}
- 禁止事项: 禁止按当前节拍原文末尾直接续写；禁止越出当前节拍范围。
⚠️ 【位置指针】本回合的“唯一起演位置”以【起点】为准：你的第一句必须从【起点】描述的画面/动作起笔，不得从聊天记录最后一句或“当前节拍原文”的末尾接续。

## 1) 当前节拍小说原文
提示：当你按照导演的框架编写剧情时，尽可能的参照原文内容，必要时可以直接引用，但绝不可与导演框架冲突。
{CURRENT_BEAT_ORIGINAL}

## 2) 导演演绎指导框架（起点 -> 过程 -> 终点）
- 【起点 - 唯一开始位置】: {DIRECTION_START}
- 动作链: {DIRECTION_ACTION_CHAIN}
- 过程:
{DIRECTION_PROCESS_LINES}
- 终点: {DIRECTION_END}
{STAGE_EXECUTION_REQUIREMENT}

## 3) 下一节拍预览（仅参考，禁止提前展开）
- 当前节拍退出事件: {CURRENT_EXIT_CONDITION}
- 下一节拍摘要: {NEXT_BEAT_SUMMARY}
- 下一节拍入场事件: {NEXT_BEAT_ENTRY_EVENT}
- 下一节拍原文前200字: {NEXT_BEAT_PREVIEW_200}
- 结尾软要求: 先对照“导演给出的终点”和“当前节拍退出事件”。仅当两者完全吻合或高度吻合时，最后1-2句才可做趋势性引出，承接下一节拍。
- 结尾限制: 若终点与退出事件不吻合，禁止引出下一节拍，继续在当前节拍内收束。

【起笔复述】第一句必须参考【起点】：{START_RECAP}`;

export const defaultSettings = {
    chunkSize: 8000,
    enablePlotOutline: false,
    enableLiteraryStyle: false,
    language: 'zh',
    customWorldbookPrompt: '',
    customPlotPrompt: '',
    customStylePrompt: '',
    useVolumeMode: false,
    apiTimeout: 120000,
    parallelEnabled: true,
    parallelConcurrency: 1,
    parallelMainConcurrency: 2,
    parallelDirectorConcurrency: 2,
    parallelMode: 'independent',
    chapterCompletionMode: 'throughput',
    useTavernApi: true,
    customMergePrompt: '',
    customConsolidatePrompt: '',
    customDirectorFrameworkPrompt: '',
    customDirectorInjectionPrompt: '',
    consolidatePromptPresets: [],
    consolidateCategoryPresetMap: {},
    categoryLightSettings: null,
    defaultWorldbookEntries: '',
    customRerollPrompt: '',
    customBatchRerollPrompt: '',
    customApiProvider: 'openai-compatible',
    customApiKey: '',
    customApiEndpoint: '',
    customApiModel: 'gemini-2.5-flash',
    customApiMaxTokens: 2048,
    mainApi: {
        provider: 'openai-compatible',
        apiKey: '',
        endpoint: '',
        model: 'gemini-2.5-flash',
        maxTokens: 2048,
    },
    directorApi: {
        provider: 'openai-compatible',
        apiKey: '',
        endpoint: '',
        model: 'gemini-2.5-flash',
        maxTokens: 2048,
    },
    directorEnabled: true,
    directorAutoFallbackToMain: true,
    directorRunEveryTurn: true,
    directorInjectionMode: 'loose',
    forceChapterMarker: true,
    chapterRegexPattern: '^[\\s\\u3000\\uFEFF]*第\\s*[零一二三四五六七八九十百千万0-9]+\\s*[章回卷节部篇][^\\n\\r]{0,80}',
    useCustomChapterRegex: false,
    enableChapterOutline: true,
    chapterOutlineMaxRetries: 1,
    chapterOpeningTargetLength: '50-100',
    defaultWorldbookEntriesUI: [],
    categoryDefaultConfig: {},
    entryPositionConfig: {},
    customSuffixPrompt: '',
    promptMessageChain: [
        { role: 'user', content: '{PROMPT}', enabled: true }
    ],
    allowRecursion: false,
    filterResponseTags: 'thinking,/think',
    debugMode: false,
};
