# Charisma Lab 数据库设计文档

> Personal Growth Operating System Database Design  
> 个人魅力成长实验室数据架构设计

版本：v0.1  
状态：当前实现说明 + 后续设计蓝图

对应版本：v0.1 → v1.0

---

## v0.1.1 当前本地实现（以代码为准）

应用 IndexedDB 名称为 `charisma-lab-v2`（历史磁盘身份，不能因发布号变化而改名）；Dexie Schema 版本为 `1`（`src/data/local/schema.ts` 与 `src/data/local/migrations/index.ts`）；JSON 备份 `schemaVersion` 也为 `1`（`src/domain/validation.ts`），但它是独立的**备份格式版本**。三者与 npm 版本 `0.1.1`、备份 `appVersion: "v0.1.1"` 不是同一概念，不能互相替换。

| 实际 Store | 主键与索引（Dexie v1） | 数据类型与用途 |
| --- | --- | --- |
| `records` | `[ownerScope+id]`, `ownerScope`, `[ownerScope+kind]`, `[ownerScope+updatedAt]` | `BusinessRecord`：私有业务记录 |
| `outbox` | `mutationId`, `ownerScope`, `[ownerScope+entityId]`, `[ownerScope+status]`, `nextRetryAt` | `OutboxMutation`：待同步操作 |
| `syncMetadata` | `[ownerScope+key]`, `ownerScope` | `SyncMetadata`：作用域内同步状态及导入凭据 |
| `conflicts` | `id`, `ownerScope`, `[ownerScope+entityId]` | `ConflictRecord`：待处理的本地／云端版本 |
| `safetyBackups` | `id`, `ownerScope`, `[ownerScope+createdAt]` | `SafetyBackup`：危险操作前的本机快照 |

`records` 的通用字段实际为 `id: string`、`ownerScope: string`、`kind: RecordKind`、`payload: RecordPayloads[kind]`、`createdAt/updatedAt: string`（ISO 时间）、`serverVersion: number`、`localRevision: number`、`syncStatus: 'local' | 'pending' | 'synced'`；可选 `deletedAt`、`serverUpdatedAt` 和 `importedCopyOf`。当前 `RecordKind` 共 12 种：`profile`、`courseProgress`、`lessonNote`、`trainingTask`、`trainingRecord`、`scenarioAttempt`、`assessmentResult`、`selfEvaluation`、`journalEntry`、`growthGoal`、`userInterest`、`appSettings`。各 `payload` 的确切字段和 TypeScript 类型见 `src/domain/types.ts`，运行时校验见 `src/domain/validation.ts`。

当前并不存在下文概念示例中的 `user_profiles`、`growth_goals` 等独立 IndexedDB Store；这些章节是未来设计蓝图，不能用作现有数据库迁移依据。业务写入经 Repository 事务同时更新 `records` 与 `outbox`，身份按 `ownerScope` 分区。更改数据库名、Store 或 Schema 版本需要单独设计兼容迁移，本次发布未执行此类变更。

---

# 一、数据库设计目标

## 1.1 数据库定位

Charisma Lab 的数据库不是简单保存网页状态，而是保存用户长期成长过程中的：

- 学习记录
- 行为训练
- 思考过程
- 自我反馈
- 能力变化
- 人生经验


核心理念：

> 用户的成长数据，是 Charisma Lab 最重要的长期资产。

---

# 二、数据架构总览

## 2.1 数据分层


```
                 Charisma Lab Data


                      |
        --------------------------------
        |                              |
   Static Content                 User Data
   静态内容                       用户数据

        |                              |
        |                              |
 Courses                        Profile
 Lessons                        Learning
 Questions                      Training
 Scenarios                      Journal
 Tasks                          Assessment


                      |
                      |

              Analytics Layer

              Growth Analysis

              AI Recommendation
```


---

# 三、数据库存储策略


## v0.1 本地模式


技术：

```
IndexedDB
+
Dexie.js
```


保存：

- 用户设置
- 学习进度
- 训练记录
- 日志
- 测评


特点：

- 离线可用
- 快速响应
- 无需账号


---

## v0.2 云同步模式


技术：

```
Supabase

PostgreSQL

+
Row Level Security
```


保存：

- 用户账号
- 云端成长数据
- 同步状态


---

# 四、数据分类设计


## 4.1 Content Data（内容数据）


特点：

- 不属于用户
- 所有人共享
- 随版本更新


包括：

```
Module

Lesson

Scenario

Question

Task Template
```


存储：

```
content/
```


---

## 4.2 User Data（用户数据）


特点：

私人数据。

包括：

```
Profile

Goal

Learning Progress

Training Record

Journal

Assessment

Interest
```


需要：

- 本地保存
- 云端同步
- 权限控制


---

## 4.3 System Data（系统数据）


用于：

```
Sync

Migration

Settings

Analytics
```


---

# 五、核心实体模型


整体关系：

```
User

 |
 |
 +---- Profile

 |
 +---- Goal

 |
 +---- LearningProgress

 |
 +---- TrainingRecord

 |
 +---- JournalEntry

 |
 +---- AssessmentResult

 |
 +---- Interest

 |
 +---- SyncRecord
```

---

# 六、UserProfile 用户资料表


## 用途

保存用户基础信息和成长偏好。


## IndexedDB

表：

```
user_profiles
```


## Schema


```typescript
interface UserProfile {

 id: string;

 nickname?: string;


 avatar?: string;


 growthVision: string;


 preferredStyle?: string;


 focusDimensions: string[];


 dailyTrainingMinutes: number;


 createdAt: Date;


 updatedAt: Date;

}
```


---

## 字段说明


|字段|说明|
|-|-|
|id|用户唯一ID|
|nickname|昵称|
|growthVision|未来想成为的人|
|preferredStyle|个人风格偏好|
|focusDimensions|重点提升维度|
|dailyTrainingMinutes|每日训练时间|


---

# 七、GrowthGoal 成长目标表


## 用途

记录用户阶段目标。


例如：

```
三个月提升表达能力

一年建立技术能力
```


Schema：


```typescript
interface GrowthGoal {

 id:string;


 title:string;


 description:string;


 category:
 "appearance"
 |
 "communication"
 |
 "knowledge"
 |
 "career";


 priority:number;


 startDate:Date;


 endDate?:Date;


 status:
 "active"
 |
 "completed";


 createdAt:Date;


 updatedAt:Date;

}
```


---

# 八、LearningProgress 学习进度表


## 用途

记录课程学习。


关系：


```
User

 |

LearningProgress

 |

Lesson
```


Schema：


```typescript
interface LearningProgress {


 id:string;


 lessonId:string;


 status:

 "not_started"

 |

 "learning"

 |

 "completed";


 progress:number;


 lastPosition?:string;


 notes?:string;


 completedAt?:Date;


 createdAt:Date;


 updatedAt:Date;

}
```


---

## 设计原因


不直接保存课程内容。

课程：

属于Content。

用户：

只保存学习状态。


避免：

大量重复数据。


---

# 九、TrainingTask 训练任务模板


## 用途

保存系统提供的训练任务。


例如：

```
练习60秒表达

观察一天中的三个有趣细节
```


Schema：


```typescript
interface TrainingTask {


 id:string;


 title:string;


 description:string;


 dimensionId:string;


 difficulty:

 "easy"

 |

 "medium"

 |

 "hard";


 estimatedMinutes:number;


}
```


---

# 十、TrainingRecord 训练记录表


## 用途

保存用户实际完成情况。


Schema：


```typescript
interface TrainingRecord {


 id:string;


 taskId:string;


 completed:boolean;


 reflection:string;


 difficulty:number;


 confidence:number;


 completedAt:Date;


 createdAt:Date;


}
```


---

## 示例


用户完成：

任务：

```
主动和陌生同学交流
```


记录：

```
今天尝试主动聊天

开始有些紧张

但后来交流顺畅
```


---

# 十一、JournalEntry 成长日志表


## 用途

这是最高价值数据。


记录：

- 思考
- 经历
- 复盘


Schema：


```typescript
interface JournalEntry {


 id:string;


 type:

 "daily"

 |

 "social_review"

 |

 "thought";


 title:string;


 content:string;


 tags:string[];


 mood?:string;


 relatedDimension?:string;


 createdAt:Date;


 updatedAt:Date;


}
```


---

## 日志类型


### Daily

每日成长记录。


### Social Review

社交事件复盘。


例如：

```
发生：

今天课堂发言紧张


原因：

准备不足


改进：

提前整理观点
```


### Thought

思想笔记。


例如：

```
关于自信的理解
```


---

# 十二、AssessmentResult 测评结果表


## 用途

保存成长评估。


Schema：


```typescript
interface AssessmentResult {


 id:string;


 type:

 "self"

 |

 "knowledge"

 |

 "scenario";


 dimensionId:string;


 score:number;


 answers:object;


 analysis?:string;


 createdAt:Date;

}
```


---

# 十三、SelfEvaluation 自我评价表


## 用途

记录长期变化。


例如：

每30天：

重新评价：

```
表达能力

3 → 4
```


Schema：


```typescript
interface SelfEvaluation {


id:string;


dimensionId:string;


score:number;


reason:string;


createdAt:Date;

}
```


---

# 十四、Interest 兴趣成长表


## 用途

记录个人兴趣。


因为：

魅力不仅来自训练。

也来自丰富生活。


Schema：

```typescript
interface Interest {


id:string;


category:

"music"

|

"book"

|

"movie"

|

"sport"

|

"hobby";


name:string;


description:string;


progress:string;


createdAt:Date;

}
```


---

# 十五、同步相关数据模型


## 15.1 SyncQueue


用途：

保存等待上传的修改。


Schema：

```typescript
interface SyncQueue {


id:string;


entityType:string;


entityId:string;


operation:

"create"

|

"update"

|

"delete";


payload:any;


status:

"pending"

|

"syncing"

|

"success"

|

"failed";


retryCount:number;


createdAt:Date;

}
```


---

# 15.2 ConflictRecord


用途：

保存同步冲突。


Schema：


```typescript
interface ConflictRecord {


id:string;


entityType:string;


entityId:string;


localVersion:any;


cloudVersion:any;


status:

"pending"

|

"resolved";


createdAt:Date;

}
```


---

# 十六、数据库版本迁移设计


目录：

```
data/local/migrations
```


结构：

```
001-init.ts

002-add-journal.ts

003-add-sync.ts

004-add-assessment.ts
```


---

## 原则


禁止：

直接修改已有表结构。


例如：

错误：

```
给Journal增加字段

直接修改
```


正确：

创建：

```
005-update-journal-schema
```


执行迁移。


---

# 十七、索引设计


## IndexedDB索引


重点索引：

### LearningProgress

```
lessonId

updatedAt
```


---

### JournalEntry

```
type

createdAt

tags
```


---

### TrainingRecord

```
taskId

completedAt
```


---

### SyncQueue

```
status

createdAt
```


---

# 十八、数据生命周期设计


## 创建

用户产生行为：

↓

保存本地


---

## 修改


修改：

↓

更新updatedAt

↓

加入同步队列


---

## 删除


采用：

Soft Delete


字段：

```
deletedAt
```


原因：

防止：

离线设备恢复旧数据。


---

# 十九、AI时代数据设计


未来AI Agent需要读取：

```
User Growth History

+

Journal

+

Training

+

Assessment
```


形成：

用户成长画像。


例如：


AI输入：

```
最近30天：

表达训练8次

社交复盘5次

自评提升

3→4
```


输出：

```
建议：

继续训练公开表达

增加深度阅读
```


---

# 二十、数据安全原则


## 1.

私人日志默认私密。


## 2.

不收集：

- 身份敏感信息
- 不必要个人数据


## 3.

云端：

必须启用：

```
Row Level Security
```


保证：

用户只能访问自己的数据。


---

# 二十一、数据库演进路线


## v0.1


实现：

```
Profile

Learning

Training

Journal
```


---

## v0.2


增加：

```
User

SyncQueue

Conflict

Cloud Record
```


---

## v0.3


增加：

```
ScenarioAttempt

Assessment

Analytics
```


---

## v0.4


增加：

```
AI Insight

AI Recommendation

Vector Knowledge
```


---

## v1.0


形成：

```
Personal Growth Database
```


支持：

多年成长记录。


---

# 二十二、核心数据库原则总结


## 原则1

用户数据 > 页面数据。


## 原则2

先设计数据，再设计功能。


## 原则3

本地优先，云端增强。


## 原则4

数据结构必须支持未来AI分析。


## 原则5

任何用户成长记录都不能轻易丢失。


---

# Final Vision

Charisma Lab最终数据库目标：

不是保存：

“用户点击了什么按钮”。

而是保存：

“一个人在几年时间里如何成长。”

数据库最终成为：

> 用户个人成长历史档案库。

---

End.
