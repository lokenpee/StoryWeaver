# StoryWeaver 渐进式迁移架构

`src/` 承载逐步接管旧实现的新架构。迁移期间，`txtToWorldbook/` 仍然是可运行系统的一部分；每迁移一条功能路径，旧入口必须直接调用 `src/` 中的新实现，避免长期维护两套逻辑。

## 分层边界

- `domain/`：纯领域规则和数据变换，不访问 DOM、网络、存储或 SillyTavern 运行时。
- `application/`：业务用例与流程编排，只通过显式端口调用外部能力。
- `infrastructure/`：API、SillyTavern、IndexedDB、文件与设置持久化适配器。
- `presentation/`：页面、弹窗、事件绑定和渲染。
- `compatibility/`：旧设置键、旧任务数据和公共 API 的兼容转换。
- `bootstrap.js`：最终的唯一装配入口；在实际迁移装配逻辑前不创建占位实现。

## 迁移规则

1. 先记录旧行为，再迁移实现。
2. 新模块接管后，旧路径只保留必要的入口适配，不保留重复业务规则。
3. `domain/` 禁止引用 `document`、`window`、存储和网络 API。
4. SillyTavern 兼容行为迁移前必须查阅 `docs/sillytavern-technical-reference.md`。
5. 每次迁移都应当可以单独验证和单独回撤。

## 已接管路径

- 章节切分类型规范化：`src/domain/chapter/splitTypes.js`
