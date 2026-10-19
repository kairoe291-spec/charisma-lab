# Charisma Lab 版本更新日志

> Changelog  
> Personal Growth Operating System

项目名称：

**Charisma Lab｜个人魅力成长实验室**

版本记录规则：

采用 Semantic Versioning：

```text
Major.Minor.Patch

例如：

1.0.0

0.3.0

0.1.1
```

---

# 版本说明规则

## Major（主版本）

重大产品升级。

例如：

```text
0.x.x

↓

1.0.0
```

代表：

产品从实验阶段进入正式版本。


---

## Minor（次版本）

新增主要功能。

例如：

```text
0.2.0

新增云同步系统
```


---

## Patch（修订版本）

修复问题和小优化。

例如：

```text
0.1.1

修复数据保存问题
```


---

# Change Type 类型说明


每次更新使用以下分类：

|类型|含义|
|-|-|
|Added|新增功能|
|Changed|功能调整|
|Improved|体验优化|
|Fixed|Bug修复|
|Removed|删除功能|
|Security|安全相关|
|Architecture|架构调整|

---

# v0.1.1（2026-10-19，已正式发布）

> 正式发布基线：标签 `v0.1.1` 指向提交 `5aeda83d25ee7b98bc4f48bdecdb119c55bd443e`；[GitHub Release](https://github.com/kairoe291-spec/charisma-lab/releases/tag/v0.1.1)。以下 Sprint 验收记录均为发布前历史，本次归档未重新运行测试。

## v0.1.1 / Sprint 6（发布前历史记录）

- 统一 npm 包版本 `0.1.1`、新备份 `appVersion: v0.1.1`；JSON Schema v1、IndexedDB 名称和 Dexie Schema v1 保持原样，旧版应用标识的备份继续可导入。
- 区分响应式查询的“尚未读取”与“已读取且为空”，避免日志、训练及其他记录页面误报空状态；课程笔记读取完成前不提供编辑。
- 更新 README、路线图、版本及数据库文档，区分已有代码、本地测试与尚未验收的真实托管 Supabase 环境。
- Sprint 6 当时重新执行 TypeScript、ESLint、`npm test`（14 个测试文件、139/139 项）和生产构建均通过；`npm run test:e2e` 为本地 Chromium 12/12 通过。Prettier 代码文件通过，历史 Markdown 格式仍待统一。构建仍有主包体积及 Zod/Rollup 注释警告；当时尚未创建提交或发布标签。
- Sprint 6.1 此前执行 `npm test`（16 个测试文件、144/144 项）与 `npm run test:e2e`（本地 Chromium 12/12）均通过；此前的 `typecheck`、`lint` 和 `build` 也均通过。以上均为各阶段此前的实际执行记录，本次仅修正文档，未重新运行测试；本地 E2E 不代表真实托管 Supabase 生产验收。

## v0.1.1 / Sprint 5A（2026-10-18，本地提交 `900e532`）

- 拆分 Settings 数据设置面板，修复 CSV 公式注入防护中的真实负数兼容性；验收清单保留当时执行的测试与 Git 状态。

## Architecture — v0.1.1 / Sprint 1（2026-10-16，未发布）

- 将 Dashboard、学习、训练、日志、测评及个人设置的已有实现归入六个 Feature；八个页面入口只负责组合。
- 将通用 UI、反馈、跨功能保存协调器与内容类型归位，保留兼容导出；增加 Feature/Page/Shared 导入边界检查。
- 数据库、Repository、同步及认证实现保持原样；没有 Schema 升级、依赖安装、发布或新业务功能。
- 当时的 Lint、备份恢复单元测试和离线用例文案断言仍待处理，因此 Sprint 1 当时未标记整个 v0.1.1 完成；后续已修复，本轮全量测试结果见上文。详情及当时验证见 [Sprint 1 记录](sprints/v0.1.1-sprint-1.md)。

---

## 发布前计划（历史记录）

### v0.1.1 Architecture Upgrade（原计划）

计划：

- 优化项目目录结构
- 引入Feature模块化
- 建立Repository数据访问层
- 完善数据库Migration机制
- 建立Content内容管理系统
- 增加项目开发文档


---

# v0.1.0 - Foundation MVP

发布日期：

2026-10


状态：

Completed


版本目标：

> 建立个人成长系统最小可用版本。


---

# Added 新增功能


## 产品功能

### Dashboard成长驾驶舱

新增：

- 用户成长首页
- 当前目标展示
- 学习状态展示
- 基础成长数据统计


---

### 学习系统基础框架

新增：

- 魅力成长模块目录
- 课程展示结构
- 学习进度记录


---

### 日常训练系统

新增：

- 训练任务列表
- 完成状态记录
- 训练历史


---

### 成长日志系统

新增：

- 每日日志
- 思考记录
- 成长复盘


---

## 技术功能


新增：

- React + TypeScript项目基础
- Vite开发环境
- Tailwind CSS样式系统
- IndexedDB本地数据库
- Dexie数据管理


---

# Changed 调整


无。


---

# Improved 优化


完成：

- 基础响应式布局
- 页面组件拆分
- 基础用户体验优化


---

# Fixed 修复


完成：

- 页面刷新导致状态丢失问题
- 本地数据保存问题


---

# Architecture 架构记录


完成：

建立：

```text
docs/

├── roadmap.md

├── architecture.md

├── database.md

├── sync-design.md

└── decisions.md
```


形成完整项目设计体系。


---

# Known Issues 当前已知问题


## 1.

暂无云端同步。

原因：

计划在v0.2实现。


---

## 2.

课程内容仍处于基础阶段。

原因：

优先完成数据架构。


---

## 3.

暂无AI能力。

原因：

等待用户数据体系稳定。


---

# v0.1.1 - Architecture Upgrade（发布前原始规划）

计划发布日期：

2026-10


原规划状态：

Planning（历史记录；当前版本已发布）


目标：

> 将MVP升级为可长期维护的软件架构。


---

# Added


## 项目结构升级


新增：

```text
src/

├── features

├── data

├── content

├── services

└── types
```


---

## 数据访问层


新增：

Repository Pattern。


实现：

```text
Component

↓

Service

↓

Repository

↓

Database
```


---

## 内容驱动系统


新增：

```text
content/

├── modules

├── lessons

├── tasks

├── scenarios

└── questions
```


---

# Improved


优化：

- 数据模型
- 类型定义
- 组件复用
- 错误处理


---

# Architecture


建立：

数据库迁移机制：

```text
migrations/

001-init

002-update
```


---

# v0.2.0 - Cloud Sync Edition

下一开发目标，尚未发布。账号、同步引擎和 SQL 迁移已有代码及本地测试，但不能据此宣称真实托管 Supabase 已验收；也没有本轮新执行的测试结果。范围与验收标准见 [v0.2 版本文档](versions/v0.2.md)，独立发布门槛见 [CLOUD-ACCEPTANCE-01](cloud-acceptance-checklist.md)。以下为规划能力，不是完成记录。


目标：

> 实现跨设备个人成长数据同步。


---

# Planned / 待验收


## 用户系统

新增：

- 注册登录
- 用户身份管理
- 游客模式


---

## 云端数据库


新增：

Supabase：

- PostgreSQL
- Auth
- RLS


---

## 同步系统


新增：

Sync Engine：

支持：

- 上传同步
- 下载同步
- 自动重试
- 状态管理


---

## 冲突处理


新增：

Conflict Manager。


支持：

- 版本检测
- 冲突展示
- 手动合并


---

# Security


增加：

- 用户数据隔离
- 权限控制
- 云端安全策略


---

# v0.3.0 - Charisma Academy

计划版本。


目标：

> 从工具升级为系统学习平台。


---

# Added


## 完整课程体系


新增：

12大成长模块：


1. 仪容管理与个人风格

2. 体态与身体表现力

3. 自信气场与存在感

4. 谈吐与高级表达

5. 幽默感与机智反应

6. 社交情商

7. 知识广度与思想深度

8. 稳定人格

9. 现实能力

10. 自然吸引力

11. 深度交流

12. 生活情趣


---

## 情景模拟系统


新增：

- 对话模拟
- 分支选择
- 行为反馈
- 复盘记录


---

## 测评系统


新增：

- 初始评估
- 阶段测评
- 成长趋势


---

# v0.4.0 - AI Coach Edition

计划版本。


目标：

> 引入AI成为个人成长助手。


---

# Added


## AI成长复盘


支持：

分析：

- 成长日志
- 社交经历
- 学习记录


输出：

- 改进建议
- 下一步训练


---

## AI表达训练


支持：

- 观点分析
- 表达优化
- 逻辑反馈


---

## AI Agent系统


新增：

```text
AI Layer

├── Agent

├── Prompt

├── Analyzer

└── Recommendation
```


---

# v1.0.0 - Personal Growth OS


目标：

> 成为完整个人成长操作系统。


---

# Added


## 完整成长生态


包含：

- 学习系统
- 训练系统
- 数据分析
- AI助手
- 个人知识库


---

## 成长数据中心


展示：

长期变化：

- 表达能力
- 知识积累
- 执行能力
- 情绪管理
- 社交能力
- 职业成长


---

# Future Roadmap


未来探索：

## 多模态成长记录

支持：

- 图片
- 音频
- 视频


---

## AI长期伙伴

支持：

- 长期记忆
- 个性化建议
- 主动提醒


---

## 个人第二大脑

连接：

- 阅读
- 笔记
- 思考
- 经验


---

# Git版本对应关系


推荐：

|Git Tag|版本|说明|
|-|-|-|
|v0.1.0|Foundation MVP|基础离线版本|
|v0.1.1|Architecture Upgrade|架构升级|
|v0.2.0|Cloud Sync|云同步|
|v0.3.0|Academy|课程系统|
|v0.4.0|AI Coach|AI能力|
|v1.0.0|Growth OS|正式产品|

---

# Release Checklist

每次发布版本前检查：

## 功能

- [ ] 新功能完成
- [ ] 核心流程测试通过
- [ ] 无明显Bug


---

## 数据

- [ ] 数据迁移正常
- [ ] 用户数据不会丢失
- [ ] 备份功能正常


---

## 工程

- [ ] TypeScript检查通过
- [ ] 构建成功
- [ ] Git提交完成
- [ ] 更新Changelog


---

# Commit规范


推荐格式：

```text
feat:

新增功能


fix:

修复问题


refactor:

代码重构


docs:

文档修改


test:

测试相关


chore:

工程配置
```


示例：

```bash
git commit -m "feat: add journal system"

git commit -m "fix: solve indexedDB persistence bug"

git commit -m "docs: update architecture design"
```


---

# Final Vision

Charisma Lab 的版本演进：

```text
v0.1

个人成长记录工具


↓

v0.2

个人成长云端系统


↓

v0.3

个人魅力学习平台


↓

v0.4

AI成长助手


↓

v1.0

个人成长操作系统
```

每一次版本迭代，

不是简单增加功能，

而是在构建一个：

**能够陪伴用户长期成长的数据化人生系统。**

---

End.
