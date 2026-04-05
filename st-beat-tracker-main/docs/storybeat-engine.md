# 叙事流引擎（SBT / st-beat-tracker）工作原理总览

本文件面向后续长期维护，目标是统一解释插件的工作流、数据模型与核心机制，确保未来优化时不偏离原设计初衷。文中描述基于当前代码结构（manifest.json、index.js、StoryBeatEngine.js、src/**、ai/**、ui/**）。

---

## 1. 插件定位与目标

SBT 是一个面向 SillyTavern 的剧情优化与章节化叙事引擎。它通过“导演团队式”的多 Agent 管线，将传统一次性对话变成可持续、可推进、可记忆的长篇叙事。核心目标：

- 持久记忆：把剧情状态持久化到聊天记录与本地静态数据库中。
- 节奏可控：用“叙事控制塔 + 节奏环”驱动长线节奏与高潮安排。
- 剧情可规划：以章节蓝图（chapter blueprint）为结构化“剧本”，避免跑偏。
- 互动增强：把玩家意图作为最高优先级，引导 AI 在互动中推进剧情。

---

## 2. 总体架构（模块级视角）

### 2.1 入口与生命周期

- manifest.json：注册插件入口 index.js 与 UI 资源。
- index.js：SillyTavern APP_READY 后启动引擎与 UI。
- StoryBeatEngine.js：引擎核心，负责事件监听、Prompt 注入、章节转换、任务协调。

### 2.2 核心引擎与子系统

- StoryBeatEngine
  - 监听聊天事件，注入提示词。
  - 管理“创世纪 / 章节转换 / 热重载”等流程。
  - 维护当前章节状态与锁机制。
- TransitionManager
  - 负责创世纪与章节切换的完整流程（含可断点恢复）。
- StateUpdateManager
  - 将史官输出的 Delta 事务写入 Chapter（强校验与防污染）。
- NarrativeControlTowerManager
  - 节奏控制塔（节奏环、冷却、故事线进度与指令生成）。
- EntityContextManager
  - 召回实体数据（按需 or 全量），并进行缓存。

### 2.3 AI 代理团队

- IntelligenceAgent（情报官）
  - 创世纪时解析世界书与主角信息，生成 staticMatrices（静态数据库）。
- ArchitectAgent（建筑师）
  - 生成章节蓝图（plot beats、设计笔记）。
- HistorianAgent（史官）
  - 复盘本章文本，输出状态增量（creations / updates / summaries / rhythm）。
- TurnConductorAgent（回合裁判）
  - 每回合判断“当前节拍位置 + 基调纠正 + 转章触发”。

### 2.4 UI 层

- ui/uiManager.js：抽屉面板与交互。
- ui/renderers.js：渲染故事摘要、角色档案、故事线进度、关系图谱等。
- UI 支持编辑章节蓝图、故事线、摘要并回写状态。

---

## 3. 数据模型（Chapter 为核心）

Chapter 是整个系统的“世界快照”，每章为一份完整状态树。

### 3.1 Chapter 顶层结构

- uid：章节唯一 ID
- characterId：绑定角色 ID
- staticMatrices：静态设定（世界书解析结果 + 人工编辑）
  - characters / worldview / storylines / relationship_graph
- dynamicState：动态状态（随章节推进不断变化）
  - characters / worldview / storylines
  - chronology：时段与天数推进
  - stylistic_archive：文体消耗记录（避免重复意象）
- meta：全局叙事控制层
  - longTermStorySummary：累积故事摘要
  - narrative_control_tower：节奏控制塔数据
  - freeRoamMode：自由章模式开关
- chapter_blueprint：建筑师生成的本章“剧本蓝图”
- activeChapterDesignNotes：建筑师设计笔记
- playerNarrativeFocus：玩家设定的本章焦点

### 3.2 静态 vs 动态数据边界

- 静态：世界书推导结果，原则上不随剧情自然变化（除非玩家或史官显式更新）。
- 动态：章节内的进度推进、关系好感变化、时间流逝等。

### 3.3 叙事控制塔（Narrative Control Tower）

控制塔是“节奏中枢”，包括：

- 节奏环（Inhale / Hold / Exhale / Pause）相位与循环计数
- 最近章节强度记录
- 故事线进度量化追踪
- 叙事手法冷却（如 spotlight_protocol）
- Rhythm Directive（节奏指令）
  - 强制冷却 / 强度范围 / 章节类型建议 / 即将触发阈值

---

## 4. 持久化与缓存策略

### 4.1 聊天记录锚定（Leader）

引擎将 Chapter 序列化后写入最近的 AI 消息：

- onCommitState 在消息渲染后执行锚定。
- 这使得剧情状态随聊天记录保存，实现跨会话持久记忆。
- 章节规划时，建筑师读取最近一条带 leader 的消息正文作为衔接参考。

### 4.2 全局临时状态（LEADER）

通过 chatMetadata.leader 保存：

- pendingTransition（章节转换断点恢复）
- earlyPlayerInput（提前规划焦点）

### 4.3 静态数据库缓存

StaticDataManager 使用 localStorage 保存：

- sbt-static-character-database：角色静态设定缓存
- 作用：即使聊天未开始，也能预览与编辑世界设定

### 4.4 设置与提示词配置

- API 设置优先保存到 extension_settings（云端），否则降级到 localStorage。
- 自定义 Prompt 保存在 localStorage：
  - sbt-architect-prompt-custom
  - sbt-conductor-prompt-custom
- 叙事模式保存到角色卡 extensions（角色专属）。

---

## 5. API 与双轨服务

引擎默认采用双轨制服务：

- 主服务：负责 Intelligence / Architect / Historian
- 回合裁判服务：负责 TurnConductor

LLMApiService 支持三种策略：

1) direct_openai：前端直接调用
2) sillytavern_proxy_openai：通过 ST 后端代理
3) sillytavern_preset：使用 ST 预设配置

模型列表由 modelManager 在设置面板中按策略获取并缓存。

---

## 6. 核心运行流程（回合级）

触发点：SillyTavern CHAT_COMPLETION_PROMPT_READY

### 6.1 输入守卫与锁

- isConductorActive 与 watchdog 防止事件风暴。
- 引擎总开关 sbt-engine-enabled 可直接停机。

### 6.2 五层 Prompt 注入（从高到低优先级）

注入基于占位符系统实现，最终进入 ST 的 prompt 序列。

1) 剧透封锁 / 基调纠正层
   - 来自 TurnConductor 的 narrative_hold 与 tone_correction
2) 回合执导指令层
   - 系统硬编码的导演指令（PromptBuilder.buildHardcodedDirectorInstructions）
3) 实体召回层
   - 按需召回模式：章节级 + 回合级动态实体
   - 全量注入模式：一次性注入全部世界设定
4) 章节蓝图层（带信息迷雾）
   - _applyBlueprintMask 屏蔽未来节拍，避免剧透
   - 玩家补充意见（player_supplement）置顶优先
5) 通用法则层
   - DIRECTOR_RULEBOOK_PROMPT + 好感度行为矩阵

### 6.3 回合裁判（TurnConductor）

TurnConductorAgent 的输出关键字段：

- current_beat_idx：当前节拍定位
- tone_correction：基调纠正指令（如偏离剧情）
- narrative_hold：禁止剧透与推进禁令
- realtime_context_ids：本回合需额外召回的实体
- status：若 current_beat_idx 为最后节拍 → 触发章节转换

---

## 7. 创世纪流程（Genesis）

入口：UI 触发 startGenesisProcess

### 7.1 数据来源优先级（三级降级）

1) 静态数据库缓存（StaticDataManager）
2) 内存中的 Chapter
3) 实时 AI 分析（IntelligenceAgent）

### 7.2 世界书条目来源

通过 genesis-worldbook 支持两种模式：

- 自动模式：角色绑定世界书
- 手动精选：用户挑选世界书条目

### 7.3 生成流程

1) IntelligenceAgent 生成 staticMatrices
2) 玩家输入叙事焦点（可选择 Free Roam / ABC 沉浸）
3) ArchitectAgent 生成第一章蓝图
4) 若无开场白：系统生成“纯环境描写”开场
5) 状态锚定到第一条 AI 消息

---

## 8. 章节转换流程（Chapter Transition）

触发来源：

- TurnConductor 检测最后节拍
- UI 手动触发（叙事罗盘按钮）

### 8.1 史官复盘（Historian）

1) 从上一锚点到终点索引抽取章节对话（{{user}} / {{char}} 标记）
2) HistorianAgent 输出 Delta（creations / updates / summaries / rhythm）
3) Delta 经 StateUpdateManager 应用到新 Chapter

### 8.2 玩家焦点输入

支持“提前规划”按钮并行输入，减少等待。

### 8.3 建筑师规划新章

ArchitectAgent 输出：

- chapter_blueprint
- design_notes

### 8.4 断点恢复与安全机制

- pendingTransition 记录进度，可恢复中断阶段
- AbortController 支持强制中止
- 停止按钮会立即终止所有 AI 请求

---

## 9. 状态更新与防污染机制

StateUpdateManager 负责 Delta 应用，具备多层防线：

- 故事线分类校验：防止 ID 落错分类
- 禁止 AI 创建 personal/relationship arcs
- 关系双向同步（防止关系孤岛）
- 历史记录简化：避免 UI 过长
- 关系图谱更新兼容（支持扁平/嵌套结构）
- 文体档案合并（避免重复意象）

同时自动更新：

- longTermStorySummary（按章条状摘要，每行一条，单条不超过40字）
- chronology（时间推进）

---

## 10. 叙事控制塔（节奏驱动）

史官输出的 rhythm_assessment 进入控制塔：

- 更新节奏相位与周期
- 记录章节强度曲线
- 生成下一章节奏指令（rhythm_directive）
- 检测故事线进度失衡与阈值事件

---

## 11. 实体召回系统

两种模式：

1) 按需召回（默认）
   - Architect 在蓝图中生成 chapter_context_ids
   - TurnConductor 输出 realtime_context_ids（回合级）
2) 全量注入
   - 直接注入全部世界设定

EntityContextManager 负责实体检索与缓存：

- 缓存命中可显著减少重复注入
- 支持 NEW: 前缀的新实体规划

---

## 12. UI 交互与编辑体系

抽屉式 UI 提供三类能力：

- 监控面板
  - 故事摘要、章节剧本、设计笔记、故事线进度、关系图谱
- 叙事罗盘
  - 开关引擎 / 回合裁判 / 章节转换
  - 章节重 roll / 叙事焦点调整
- 设置与管理
  - API 设置、模型列表、Prompt 管理
  - 静态数据库浏览 / 删除 / 清空

UI 支持直接编辑：

- 蓝图节拍内容
- 故事线历史记录
- 章节摘要
- 角色档案与世界观条目

---

## 13. 运行开关与常用标记

- sbt-engine-enabled：引擎总开关
- sbt-conductor-enabled：回合裁判开关
- sbt-entity-recall-enabled：实体按需召回开关
- sbt-focus-popup-enabled：章节转换时焦点弹窗开关

---

## 14. 可扩展点（未来优化方向）

建议后续扩展沿以下方向保持一致性：

- 新增 Agent：遵循 Agent 抽象，注入 LLM 服务后统一执行。
- 新增状态字段：优先挂载到 Chapter.meta 或 dynamicState。
- 新增 UI 面板：统一走 eventBus + updateDashboard 刷新机制。
- 新增节奏策略：优先在 NarrativeControlTowerManager 扩展。

---

## 15. 小结

SBT 的核心价值在于：
用结构化“章节蓝图 + 史官审计 + 节奏控制塔”将 AI 互动小说从“即时对话”升级为“连续叙事”。
这套体系保证了记忆持久、剧情推进、互动可控、节奏有序，并且允许玩家始终以导演身份参与叙事走向。

本文件应作为长期传承文档，若有架构变动，请同步更新对应章节。
