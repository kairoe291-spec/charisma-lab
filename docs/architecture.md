# Charisma Lab 系统架构设计文档

> Personal Growth Operating System Architecture  
> 个人魅力成长实验室系统架构

版本：v0.1  
状态：Architecture Blueprint  
最后更新：2026-10

---

# 一、项目概述

## 1.1 项目定位

Charisma Lab（个人魅力成长实验室）是一套面向长期个人成长的数字化系统。

它不是简单的信息展示网站，而是一个：

> 集知识学习、行为训练、成长记录、数据分析、AI辅助于一体的个人成长操作系统。

---

## 1.2 核心目标

帮助用户完成：

```
认识自己
    ↓
学习能力
    ↓
训练行为
    ↓
记录经历
    ↓
分析反馈
    ↓
持续优化
```

形成长期成长闭环。

---

## 1.3 核心设计理念

### Local First（本地优先）

用户数据首先保存到本地。

优势：

- 离线可用
- 操作响应快
- 降低云服务依赖
- 数据掌控权更高


---

### Privacy First（隐私优先）

个人成长记录属于私人数据。

包括：

- 日志
- 社交复盘
- 自我评价
- 成长目标

默认：

私密存储。

---

### Progressive Enhancement（渐进增强）

系统能力逐步增强：

```
基础离线应用

↓

账号系统

↓

云同步

↓

AI能力
```


即使高级功能不可用，基础功能仍然正常。

---

# 二、整体系统架构

## 2.1 总体架构图


```
                  User
                   |
                   |
        -----------------------
        |                     |
    Web Browser           Mobile Browser
        |                     |
        -----------------------
                   |
              React Application
                   |
        -----------------------
        |
        |
     Application Layer
        |
        |
 -----------------------------
 |             |               |
Feature     Service        AI Layer
Modules     Layer         (Future)
 |
 |
 -----------------------------
 |
Data Access Layer
 |
 -----------------------------
 |                           |
IndexedDB                 Supabase
(Local Storage)           (Cloud)
 |
 |
Sync Engine
 |
 |
Cloud Database
(PostgreSQL)
```

---

# 三、技术栈设计

## 3.1 前端技术

### 核心框架

```
React
+
TypeScript
+
Vite
```


负责：

- 页面渲染
- 状态管理
- 用户交互
- 业务逻辑


---

## 3.2 样式系统


采用：

```
Tailwind CSS
```

负责：

- 响应式布局
- 主题系统
- 快速组件开发


---

## 3.3 数据可视化

采用：

```
Recharts
```

用于：

- 成长雷达图
- 趋势分析
- 学习统计


---

## 3.4 本地数据库

采用：

```
IndexedDB

+
Dexie.js
```

原因：

LocalStorage不足以支持：

- 结构化数据
- 大量日志
- 查询操作
- 数据版本迁移


---

## 3.5 云端服务

采用：

```
Supabase

Auth
+
PostgreSQL
+
RLS
```

提供：

- 用户认证
- 云端数据库
- 数据安全隔离


---

# 四、前端工程结构

推荐目录：

```
src/

├── app/
│
├── pages/
│
├── features/
│
├── data/
│
├── content/
│
├── services/
│
├── cloud/
│
├── shared/
│
├── hooks/
│
├── types/
│
└── utils/
```


---

# 五、模块架构设计

## 5.1 页面层 Pages

职责：

负责页面组合。

例如：

```
pages/

Dashboard

Academy

Training

Journal

Assessment

Settings
```


页面层：

不负责复杂业务。

---

## 5.2 功能模块 Features

核心业务区域。


结构：

```
features/

├── learning

├── training

├── journal

├── assessment

├── growth

├── sync

└── profile
```


每个Feature独立维护：

- UI
- 状态
- 服务
- 类型


---

# 六、核心业务模块设计


# 6.1 Learning 学习系统


职责：

管理：

- 课程
- 学习进度
- 笔记
- 收藏


数据流：

```
Lesson Content

↓

Learning Service

↓

Repository

↓

IndexedDB

↓

UI
```


---

# 6.2 Training 训练系统


负责：

- 每日任务
- 实践记录
- 完成状态


例如：

```
任务：

练习60秒表达


↓

完成记录


↓

成长统计
```

---

# 6.3 Journal 成长日志


这是核心资产。


记录：

- 每日成长
- 社交复盘
- 思考笔记


特点：

高隐私。

必须：

可靠保存。

---

# 6.4 Assessment 测评系统


负责：

- 初始评估
- 阶段测试
- 成长趋势


注意：

系统不评价人格价值。

只记录：

行为变化和学习情况。


---

# 6.5 Growth 成长分析


整合：

- 学习数据
- 训练数据
- 测试数据


生成：

成长趋势。


---

# 七、数据架构


## 7.1 数据分层


```
Content Data

↓

User Data

↓

Analytics Data
```


---

## Content Data

静态内容：

例如：

课程、题库、案例。


存储：

```
content/
```


特点：

- 不属于用户
- 随版本更新


---

## User Data

用户数据：

例如：

日志、训练记录。


存储：

```
IndexedDB

+

Supabase
```


---

## Analytics Data

统计数据：

例如：

- 完成率
- 趋势
- 历史变化


由用户数据计算。


---

# 八、本地数据架构


## 8.1 IndexedDB设计


数据库：

```
CharismaDB
```


核心表：

---

## UserProfile

用户基本信息。

字段：

```
id

nickname

goals

preferences

createdAt

updatedAt
```

---

## LessonProgress

学习进度。


```
id

lessonId

status

progress

updatedAt
```


---

## TrainingRecord


训练记录。


```
id

taskId

completed

reflection

createdAt
```


---

## JournalEntry


成长日志。


```
id

type

content

tags

createdAt
```


---

## AssessmentResult


测评结果。


```
id

type

score

answers

createdAt
```


---

# 九、Repository数据访问层


禁止：

组件直接操作数据库。


错误：

```
Component

↓

Dexie
```


正确：

```
Component

↓

Service

↓

Repository

↓

Database
```


优势：

未来切换：

IndexedDB

↓

Supabase

无需修改页面。


---

# 十、云同步架构


## 10.1 同步模型


采用：

```
Local First + Sync Queue
```


流程：

```
用户操作

↓

写入IndexedDB

↓

创建Sync Queue

↓

联网

↓

上传Supabase

↓

更新同步状态
```


---

# 10.2 Sync Queue


记录：

```
mutationId

entityType

entityId

operation

payload

status

retryCount
```


支持：

- 重试
- 失败恢复
- 冲突处理


---

# 十一、冲突解决策略


问题：

两个设备同时修改。


例如：

电脑：

修改日志A


手机：

修改日志A


---

解决：

版本控制。


记录：

```
version

updatedAt
```


发生冲突：

保存：

```
Local Version

Cloud Version
```


用户选择：

- 使用本地
- 使用云端
- 手动合并


---

# 十二、AI扩展架构（未来）


## AI Layer


未来新增：

```
src/ai/

├── agents

├── prompts

├── analyzers

└── recommendations
```


---

# AI Agent方向


## Growth Coach Agent


输入：

用户成长数据


输出：

- 今日建议
- 训练计划
- 复盘反馈


---

## Communication Coach Agent


分析：

- 表达
- 对话
- 逻辑


---

## Knowledge Agent


连接：

个人知识库。


---

# 十三、安全架构


## 用户数据隔离


Supabase：

启用：

```
Row Level Security
```


保证：

用户A无法访问用户B数据。


---

## 密钥管理


禁止：

前端保存：

```
service_role key
```


只使用：

公开匿名key。


---

# 十四、版本演进架构


## v0.1

基础：

```
React

+

IndexedDB
```


---

## v0.2

增加：

```
Supabase

+

Sync Engine
```


---

## v0.3

增加：

```
Content Engine

+

Assessment
```


---

## v0.4

增加：

```
AI Agent Layer
```


---

## v1.0

形成：

```
Personal Growth OS
```


---

# 十五、技术决策原则


## 决策1

为什么选择IndexedDB？

原因：

用户数据需要：

- 离线
- 大容量
- 查询能力


---

## 决策2

为什么不用纯云端？

原因：

成长记录属于高频个人输入。

离线优先体验更好。


---

## 决策3

为什么内容和代码分离？

原因：

未来课程持续增加。

避免修改代码。


---

## 决策4

为什么提前设计Repository？

原因：

未来替换数据来源时降低成本。


---

# 十六、未来扩展方向


可能增加：

## 个人知识库

连接：

- 阅读
- 笔记
- 思考


---

## 语音训练

支持：

- 表达录音
- 语速分析
- AI反馈


---

## 多模态成长档案

支持：

- 图片
- 音频
- 视频记录


---

## 社区模式

未来可探索：

- 学习分享
- 成长挑战

但默认保持：

个人隐私优先。

---

# 十七、架构目标


最终目标：

打造一个：

```
稳定的数据底座

+

系统化成长课程

+

AI智能反馈

+

长期个人档案

```

组成的：

**个人成长操作系统。**

---

End.