# Charisma Lab 离线优先与云同步设计文档

> Offline First + Cloud Sync Architecture  
> 个人魅力成长实验室同步系统设计

版本：v0.1  
状态：Architecture Blueprint  
目标版本：v0.2 Cloud Sync Edition

---

# 一、同步系统概述

## 1.1 设计目标

Charisma Lab 是一个长期个人成长系统。

用户产生的数据包括：

- 成长日志
- 社交复盘
- 学习记录
- 训练记录
- 测评结果
- 个人目标


这些数据具有：

- 高频产生
- 长期积累
- 高个人价值
- 不希望丢失


因此同步系统必须优先保证：

1. 数据可靠保存。
2. 离线情况下仍可使用。
3. 网络恢复后自动同步。
4. 多设备之间保持一致。
5. 冲突时保护用户数据。

---

# 二、核心同步理念

## Local First（本地优先）


系统采用：

```text
Local First Architecture

用户操作

↓

本地数据库

↓

同步队列

↓

云端数据库

↓

其他设备
```


---

## 为什么不是 Cloud First？

传统方式：

```text
用户操作

↓

API请求

↓

服务器

↓

返回结果

↓

更新页面
```


问题：

- 无网络无法使用。
- 网络延迟影响体验。
- 请求失败导致数据丢失风险。


---

Charisma Lab采用：

```text
用户操作

↓

立即保存本地

↓

立即更新UI

↓

后台同步云端
```


优势：

- 快速响应。
- 支持离线。
- 降低网络依赖。
- 用户始终拥有数据控制权。

---

# 三、整体同步架构


```text
                    User

                     |
                     |

              React Application

                     |

          ----------------------

          |                    |

    Local Data Layer      Cloud Layer


          |                    |

      IndexedDB           Supabase

          |

      Sync Engine

          |

      Sync Queue

          |

      Network Request

          |

      PostgreSQL

```


---

# 四、技术组成


## 4.1 本地存储


技术：

```text
IndexedDB

+

Dexie.js
```


职责：

保存：

- 用户数据
- 学习状态
- 日志
- 训练记录
- 待同步任务


---

## 4.2 云端服务


技术：

```text
Supabase

Auth

+

PostgreSQL

+

Row Level Security
```


职责：

- 用户认证
- 数据备份
- 多设备同步
- 数据恢复


---

## 4.3 同步引擎


负责：

连接：

```text
Local Database

↓

Cloud Database
```


处理：

- 上传
- 下载
- 合并
- 冲突


---

# 五、数据同步流程


## 5.1 创建数据


案例：

用户写成长日志。


流程：

```text
用户输入内容

↓

Journal Service

↓

IndexedDB保存

↓

生成SyncQueue任务

↓

UI显示保存成功

↓

后台同步

↓

Supabase保存

↓

更新同步状态
```


---

## 5.2 修改数据


流程：


```text
修改记录

↓

更新本地数据

↓

updatedAt变化

↓

创建update任务

↓

加入SyncQueue

↓

等待同步
```


---

## 5.3 删除数据


不直接删除。


采用：

Soft Delete。


数据：

```typescript
{
 deletedAt:"2026-10-15"
}
```


原因：

防止：

离线设备重新上传旧数据。


---

# 六、Sync Queue设计


## 6.1 作用


Sync Queue（同步队列）

是连接：

本地世界

和

云端世界

的桥梁。


---

## 6.2 数据结构


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


baseVersion:number;


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

# 七、同步状态设计


每条用户数据拥有：

```text
syncStatus
```


状态：

|状态|含义|
|-|-|
|local|只存在本地|
|pending|等待上传|
|syncing|正在同步|
|synced|已同步|
|failed|同步失败|
|conflict|存在冲突|


---

界面展示：

例如：

```text
✓ 已同步

3条记录等待同步

⚠ 存在1个冲突
```


禁止：

只显示：

“保存成功”

因为：

保存成功 ≠ 云端同步成功。


---

# 八、同步触发机制


同步不是只有一种触发。


## 8.1 用户主动触发

设置：

“立即同步”按钮。


---

## 8.2 网络恢复触发


监听：

```text
online event
```


网络恢复：

自动同步。


---

## 8.3 应用启动触发


打开应用：

检查：

- 未同步任务。
- 云端最新数据。


---

## 8.4 定时同步


后台：

定期检查。

例如：

15分钟一次。


注意：

定时同步不是唯一机制。


---

# 九、同步算法设计


## 9.1 上传流程


```text
读取SyncQueue

↓

按照创建时间排序

↓

检查网络

↓

发送请求

↓

服务器验证版本

↓

成功:

删除队列任务


失败:

增加retryCount
```


---

# 十、版本控制机制


## 10.1 为什么需要版本？


场景：

电脑：

修改日志。


手机：

也修改日志。


如果没有版本：

后上传的数据覆盖前面的。


导致：

用户成长记录丢失。


---

## 10.2 数据版本字段


每条同步数据：

增加：


```typescript
{
version:number,

updatedAt:Date
}
```


---

# 十一、冲突处理机制


## 11.1 冲突产生


条件：

```text
Local version

!=

Server version
```


例如：

服务器：

version=5


本地：

version=4


说明：

本地基于旧数据修改。


---

# 11.2 冲突流程


```text
发现冲突

↓

停止覆盖

↓

保存两个版本

↓

创建ConflictRecord

↓

通知用户选择

```


---

# 11.3 ConflictRecord


结构：

```typescript
interface ConflictRecord {


id:string;


entityType:string;


entityId:string;


localData:any;


cloudData:any;


status:

"pending"

|

"resolved";


createdAt:Date;

}
```


---

# 十二、冲突解决策略


## 日志类数据


例如：

Journal。


策略：

人工合并。


原因：

日志具有：

- 情感价值
- 长文本
- 主观内容


不能自动覆盖。


---

## 简单状态数据


例如：

任务完成状态。


可以采用：

合并策略。


例如：

电脑：

完成=true


手机：

完成=true


结果：

true。


---

# 十三、Supabase数据库设计


## 13.1 用户表


Supabase Auth管理：

```text
auth.users
```


---

## 13.2 用户数据表


推荐：


```text
user_records
```


结构：

```sql
id

owner_id

entity_type

payload

version

created_at

updated_at

deleted_at
```


---

## 13.3 RLS安全策略


必须保证：


用户A：

只能读取：

```text
owner_id=A
```


不能访问：

```text
owner_id=B
```


---

# 十四、游客模式同步设计


## 游客状态


默认：

```text
Guest Scope
```


数据：

只存在本机。


---

## 登录后


提供：

数据迁移选择。


选项：

### 方案1

合并游客数据。


### 方案2

保留游客数据。


### 方案3

放弃迁移。


---

禁止：

登录自动清空游客数据。


---

# 十五、多设备同步场景


## 场景1：电脑新增


电脑：

创建日志。


↓

同步云端。


↓

手机：

读取。


结果：

一致。


---

## 场景2：断网新增


电脑：

离线写日志。


↓

保存本地。


↓

恢复网络。


↓

上传。


结果：

成功同步。


---

## 场景3：同时修改


电脑：

修改A。


手机：

修改A。


↓

检测版本冲突。


↓

用户选择。


---

# 十六、失败恢复设计


## 网络失败


处理：

- 保留本地数据。
- 保留同步队列。
- 自动重试。


---

## 云端错误


处理：

- 标记failed。
- 保存错误原因。
- 支持重新同步。


---

## 应用关闭


要求：

任何用户操作：

必须先写入IndexedDB。


不能：

等待云端返回。


---

# 十七、数据一致性策略


采用：

## Eventual Consistency（最终一致性）


含义：

短时间内：

设备之间可能不同。


最终：

所有设备达到一致。


---

为什么：

个人成长数据不是金融交易。

相比实时一致：

更重要：

- 不丢数据。
- 可恢复。
- 用户体验流畅。


---

# 十八、未来AI数据接口


同步系统为AI Agent提供：

稳定数据来源。


AI读取：

```text
Journal

+

Training

+

Assessment

+

Learning History
```


生成：

- 成长建议。
- 训练计划。
- 复盘反馈。


---

# 十九、开发路线


## v0.1

完成：

```text
IndexedDB

基础数据保存
```


---

## v0.2


完成：

```text
Supabase

Auth

Sync Engine

Conflict Handling
```


---

## v0.3


优化：

```text
增量同步

同步性能

数据分析
```


---

## v0.4


增加：

```text
AI Agent Data Pipeline
```


---

# 二十、同步系统开发原则


## 原则1

本地数据永远优先。

---

## 原则2

同步失败不能影响用户继续使用。

---

## 原则3

任何同步覆盖行为必须可解释。

---

## 原则4

用户私人数据不能静默丢失。

---

## 原则5

同步系统必须支持未来AI读取。


---

# 最终目标


建立一个：

```text
可靠的本地成长数据库

+

安全的云端备份

+

跨设备同步能力

+

AI成长数据基础
```


最终形成：

**Charisma Lab Personal Growth Data Infrastructure**

个人成长数据基础设施。

---

End.