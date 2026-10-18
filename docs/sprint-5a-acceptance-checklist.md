# Sprint 5A：Settings 页面职责拆分与验收清单

日期：2026-10-17；CSV 安全性修复、清单复核及浏览器故障注入：2026-10-18。分支：`refactor/v0.1.1`。Sprint 5A 开始时 Git 工作区干净；本轮未切换分支、提交或推送。以下 `[x]` 仅代表实际完成或已执行验证；CSV 修复后的 4.18 秒构建结果来自此前收到的验收记录，本轮实际重跑了新增定向 E2E 与完整 E2E，未重跑构建。

## A. 代码改造清单

- [x] 新增 `src/features/settings/StorageStatusPanel.tsx`：查询和申请浏览器持久化存储，显示当前来源的浏览器总存储估算与可见记录数。
- [x] 新增 `src/features/settings/BackupRestorePanel.tsx`：JSON 导出、30 MB 上传限制、Repository 预览校验、合并/游客替换、二次确认及安全快照列表。
- [x] 新增 `src/features/settings/StatisticsExportPanel.tsx` 与 `csvExport.ts`：保留两个 CSV 的列名、顺序、文件名及现有 `exportCsv()` 编码/转义入口。
- [x] 新增 `src/features/settings/ClearGuestDataPanel.tsx`：仅在游客空间且确认文字完全匹配时，经 Service 清空当前空间。
- [x] 新增 `src/features/settings/useBackupDownload.ts`：两个备份按钮共用原 `flushAllSaves()`，没有第二个保存协调器实例。
- [x] 新增 `src/features/settings/index.ts`：按现有 Feature 命名规范提供组合入口。
- [x] 修改 `src/pages/Settings.tsx`：页面保留标题、布局、Feature 组合、云账户/冲突面板、阅读主题和隐私说明；通过页面级信号协调安全快照刷新。
- [x] 新增 `src/features/settings/csvExport.test.ts`、`settings-workflow.test.tsx`，修改 `e2e/local-first.spec.ts`。
- [x] 本轮在 `e2e/local-first.spec.ts` 增加真实 Chromium IndexedDB 写入故障注入用例，仅修改测试，不重构业务代码。
- [x] 修改 `src/utils/files.ts` 的 `csvCell()`：真实有限数值（包括负数）不再被误加单引号；以 `= + - @` 等公式前缀开头的不可信字符串仍受防护。
- [x] 在 `src/features/settings/csvExport.test.ts` 补充字符串公式前缀、前导空格/制表符、真实负数及引号/逗号/换行断言；该文件现有 12 项针对性测试。
- [x] 保持 `src/data/repository.ts`、`src/services/saveCoordinator.ts`、数据库 Schema、云端与同步实现原样。

## B. 功能验收清单

- [x] JSON 导出前先等待未完成保存；实际 E2E 下载后解析并核对私有记录。
- [x] 上传超过 30 MB 或无效 JSON 时不导入；Repository 原有 Schema、重复 ID、业务字段校验仍由 Service 路径调用。
- [x] 游客合并保留当前日志和备份差异副本；游客替换保留备份记录 ID 与完整私有内容。
- [x] 替换需要浏览器二次确认；账号空间的替换选项禁用，Repository 仍拒绝账号替换。
- [x] 清空前要求输入完全等于「清空」并成功执行 `flushAllSaves()`；账号空间禁用清空。
- [x] 导入或清空成功后安全快照列表刷新，快照可下载；普通记录变化也继续触发列表重读。
- [x] 两种 CSV 均实际下载；列头、映射、BOM、CRLF、中文和私人日志隔离通过 Sprint 5A E2E 验证。后续单元测试确认真实有限负数保留数值形式，不可信字符串仍接受公式前缀防护。
- [x] 阅读主题仍可保存；云账户和冲突面板仍在原页面位置，既有云端 E2E 通过。
- [x] 课程、训练、日志、自评数据的备份恢复及页面刷新恢复通过既有 E2E。

## C. 自动化测试清单

- [x] `npm run typecheck`：本轮对新增 E2E 复验通过，0 个类型错误。
- [x] `npm run lint`：本轮对新增 E2E 复验通过，0 个 ESLint 错误。Sprint 5A 实施中发现的 Feature 直接导入云 Context 边界错误，已由页面传入账号状态解决。
- [x] `npm test`：2026-10-18 复核，13 个测试文件、135 项测试全部通过。新增 CSV 行映射及上传/权限/保存失败/快照刷新测试；沿用现有 Repository 备份校验和事务回滚测试。
- [x] `npm test -- src/features/settings/csvExport.test.ts`：CSV 修复后 12/12 通过，覆盖字符串公式前缀、前导空白、真实负数与原有转义。
- [x] `npm test -- src/utils/files.test.ts`：CSV 修复后 10/10 通过。
- [x] `npm run test:e2e -- --grep "浏览器 IndexedDB 保存失败"`：本轮定向 Chromium E2E 1/1 通过。在真实浏览器中临时拦截 IndexedDB `records` Store 的 `put`，抛出 `QuotaExceededError`；日志显示保存失败后，JSON 导出、替换恢复和游客清空均被未保存编辑拦住，未发生下载、替换确认或安全快照创建。测试结束在 `finally` 恢复原始接口，并用同一浏览器上下文的新页面核对原日志与完整备份记录未变化。
- [x] `npm run test:e2e`：本轮完整 Chromium E2E 12/12 通过（26.3 秒），包含上述故障注入及实际 CSV 下载与私人日志隔离验证；之前 CSV 数值修复后的完整验收记录为 11/11。
- [x] `.\node_modules\.bin\prettier.cmd --check src/pages/Settings.tsx src/features/settings src/tests e2e`：Sprint 5A 当时通过；CSV 修复后对 `src/utils/files.ts` 和 `csvExport.test.ts` 的检查也通过。
- [x] `.\node_modules\.bin\prettier.cmd --check e2e/local-first.spec.ts`：本轮新增 E2E 的格式检查通过。
- [x] `npm run build`：CSV 数值修复后的既有验收记录为构建通过，耗时 4.18 秒；PWA 构建成功并生成 9 个预缓存条目。本轮故障注入未重跑。
- [x] 构建警告已记录且尚未解决：主 JavaScript 文件为 1,384.65 KB，超过 500 KB 警告阈值，Gzip 后为 422.18 KB；`node_modules/zod` 存在 Rollup 注释相关警告。构建成功不代表这些警告已解决。
- [x] `git diff --check`：最终通过，无空白错误；Windows Git 提示 LF 将按本地配置转为 CRLF。
- [x] 在真实浏览器中注入 IndexedDB 保存失败并运行 E2E：本轮已执行。故障只拦截当前测试页面的 `records.put`，不删除数据库；断言三项操作被 `flushAllSaves()` 阻止、错误反馈可见、原有记录保持不变，并在测试结束后恢复原接口。

## D. 数据安全回归

- [x] JSON 备份 Schema 版本、字段和 Repository 校验代码未修改；无效导入和失败回滚由现有测试覆盖。
- [x] CSV 原有列头、顺序、量表、文件名规则及 `utils/files.ts` 的引号转义、UTF-8 BOM、CRLF 未修改；`csvCell()` 仅调整真实有限数值的前缀判断，字符串公式防护继续由单元测试覆盖，下载内容由修复后的 E2E 回归验证。
- [x] 游客与账号作用域隔离不变；Feature 只接收账号布尔状态，不直接接入云 Context 或 Dexie。
- [x] 账号空间不开放清空或替换；Repository 层原有拒绝规则仍在且已有测试通过。
- [x] 未修改 Outbox、Dexie 事务、删除标记或全局保存协调器；三个危险操作均保留保存前等待。
- [x] 清空和导入前由原 Repository 创建安全快照；成功后列表刷新，E2E 验证两次操作均新增快照。
- [x] 两种统计 CSV 只读取训练/测评记录；单元及实际下载均验证不含私人日志正文。

## E. 最终交付记录

实际修改：`src/pages/Settings.tsx`、`e2e/local-first.spec.ts`、`src/utils/files.ts`（CSV 数值兼容性修复）；已暂存的本清单在本次文档复核中继续修正。

实际新增：`src/features/settings/{StorageStatusPanel,BackupRestorePanel,StatisticsExportPanel,ClearGuestDataPanel}.tsx`、`csvExport.ts`、`useBackupDownload.ts`、`index.ts`、`csvExport.test.ts`（现有 12 项针对性测试）、`settings-workflow.test.tsx`，以及本清单。

Sprint 5A 原验收曾执行：`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`（为生产预览准备资源）、`npm run test:e2e`、本地 Prettier 检查、`npm run build`、`git diff --check`。CSV 数值修复后执行：`npm test -- src/features/settings/csvExport.test.ts`（12/12）、`npm run typecheck`、`npm run lint`、`npm test -- src/utils/files.test.ts`（10/10）、两个改动文件的 Prettier 检查与 `git diff --check`，均通过。2026-10-18 再执行 `npm test`，13 个文件、135 项全部通过；此前提供的记录确认 CSV 修复后的完整 E2E 为 11/11，生产构建通过（4.18 秒）。本轮新增浏览器存储故障注入用例，定向 E2E 1/1、完整 E2E 12/12、`npm run typecheck`、`npm run lint` 与新增 E2E 的 Prettier 检查均实际通过；本轮未重跑单元测试或生产构建。

未完成：没有配置真实 Supabase 项目，云端生产联调不属于 Sprint 5A。已知非致命构建警告：主 JavaScript 文件 1,384.65 KB（Gzip 后 422.18 KB）超过 500 KB 阈值，且 `node_modules/zod` 有 Rollup 注释相关警告。安全快照保存在同一浏览器，不能替代独立 JSON 备份。故障注入覆盖当前页面的 IndexedDB `records.put` 失败与三个危险操作的拦截；其他存储故障类型及账号空间未在本轮故障注入 E2E 中覆盖。

最终 Git 状态（2026-10-18 暂存复核）：分支为 `refactor/v0.1.1`；Sprint 5A 的 Settings 页面与 Feature 文件、`src/utils/files.ts`、E2E 测试及本验收清单均已暂存。当前共暂存 13 个文件；`git diff --cached --check` 检查通过。尚未执行 `git commit` 或 `git push`；`src/data`、`src/services/saveCoordinator.ts`、数据库、同步及认证相关文件未改动。

后续状态说明：上段是 Sprint 5A 当时的验收快照，并非当前 Git 状态。随后 Sprint 5A 已形成本地提交 `900e532`；Sprint 6 的发布标识、读取状态与文档改动另见当轮 Git 差异和验收结果，不计入本清单原有 135/135、12/12 的历史测试数字。
