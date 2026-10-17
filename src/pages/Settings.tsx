import { useEffect, useState } from 'react';
import { Database, Download, HardDrive, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useDataManagementService } from '../hooks/useFeatureServices';
import { useCloud } from '../cloud/context';
import { CloudAccountPanel } from '../components/CloudAccountPanel';
import { ConflictPanel } from '../components/ConflictPanel';
import { useRecords } from '../hooks/useRecords';
import { useFeedback } from '../app/context';
import { Card, Dialog, PageHeading, SectionTitle, Tag } from '../components/ui';
import { downloadFile, exportCsv, today } from '../utils/files';
import type { Backup, SafetyBackup } from '../domain/types';
import type { TrainingRecord } from '../app/types';
import { flushAllSaves } from '../app/saveCoordinator';
export default function SettingsPage() {
  const dataService = useDataManagementService();
  const cloud = useCloud();
  const records = useRecords();
  const settings = useRecords('appSettings');
  const { perform, notify } = useFeedback();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [persistent, setPersistent] = useState<string>('尚未申请');
  const [usage, setUsage] = useState('');
  const [snapshots, setSnapshots] = useState<SafetyBackup[]>([]);
  const [danger, setDanger] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const theme = (settings[0]?.payload as { theme: string } | undefined)?.theme ?? 'light';
  useEffect(() => {
    dataService
      .listSafetyBackups()
      .then(setSnapshots)
      .catch(() => notify('无法读取本机安全快照，请检查浏览器存储权限。', true));
    if (navigator.storage) {
      navigator.storage
        .persisted?.()
        .then((p) => setPersistent(p ? '已获得持久化存储' : '当前为尽力保留存储'))
        .catch(() => setPersistent('无法读取浏览器存储状态'));
      navigator.storage
        .estimate?.()
        .then((e) => setUsage(`约 ${((e.usage ?? 0) / 1024 / 1024).toFixed(2)} MB`))
        .catch(() => setUsage('无法读取存储用量'));
    }
  }, [records, dataService, notify]);
  async function exportJSON() {
    if (!(await flushAllSaves())) {
      notify('存在尚未保存的编辑，请重试保存后再备份。', true);
      return;
    }
    await perform(async () => {
      const b = await dataService.exportBackup();
      downloadFile(`charisma-lab-${today()}.json`, JSON.stringify(b, null, 2));
    }, '备份已生成，请保存到独立的位置。');
  }
  function csv(kind: 'trainingRecord' | 'assessmentResult') {
    if (kind === 'trainingRecord') {
      exportCsv(`训练记录-${today()}.csv`, [
        ['日期', '任务', '模块', '分钟', '难度', '心得'],
        ...records
          .filter((r) => r.kind === kind)
          .map((r) => {
            const p = r.payload as TrainingRecord;
            return [p.date, p.title, p.moduleId, p.minutes, p.difficulty, p.reflection];
          }),
      ]);
    } else {
      exportCsv(`阶段自评-${today()}.csv`, [
        ['时间', '类型', '维度', '分值', '量表'],
        ...records
          .filter((r) => r.kind === kind)
          .flatMap((r) => {
            const p = r.payload as { type: string; scores: Record<string, number> };
            return Object.entries(p.scores).map(([dimension, value]) => [
              r.createdAt,
              p.type,
              dimension,
              value,
              p.type === 'initial-self' ? '行为自评 1—5' : '知识/理解 0—100',
            ]);
          }),
      ]);
    }
    notify('CSV 已生成；不包含个人日志。');
  }
  return (
    <>
      <PageHeading
        eyebrow="DATA, PRIVACY & PREFERENCES"
        title="数据与同步设置"
        description="你的记录由你掌握。查看保存位置，定期备份，再选择适合自己的体验。"
      />
      <div className="settings-grid">
        <Card>
          <SectionTitle title="数据保存位置" />
          <div className="storage-status">
            <span>
              <HardDrive size={26} />
            </span>
            <div>
              <strong>此设备 · 浏览器 IndexedDB</strong>
              <p>{location.origin}</p>
              <Tag color="green">
                {cloud.user ? '当前账号空间' : '本地游客空间'} · {records.length} 条可见记录
              </Tag>
            </div>
          </div>
          <p className="small muted">
            浏览器按网址来源隔离数据库。不同域名、端口、协议和设备不会共享这份本地记录。
          </p>
          <div className="settings-row">
            <span>存储策略</span>
            <strong>{persistent}</strong>
          </div>
          <div className="settings-row">
            <span>本站浏览器总存储估算</span>
            <strong>{usage || '浏览器未提供'}</strong>
          </div>
          <button
            className="button secondary"
            onClick={async () => {
              if (!navigator.storage?.persist) {
                notify('当前浏览器不支持申请持久化存储。');
                return;
              }
              try {
                const granted = await navigator.storage.persist();
                setPersistent(granted ? '已获得持久化存储' : '浏览器未授予持久化存储');
                notify(
                  granted
                    ? '持久化存储已获准，仍请独立备份。'
                    : '浏览器未授予持久化存储，请定期导出备份。',
                );
              } catch {
                notify('存储申请失败，请检查浏览器设置。', true);
              }
            }}
          >
            <ShieldCheck size={16} />
            申请持久化存储
          </button>
        </Card>
        <CloudAccountPanel />
      </div>
      <ConflictPanel />
      <SectionTitle title="备份与恢复" />
      <Card className="backup-card">
        <div className="backup-actions">
          <div>
            <Database size={25} />
            <h3>独立备份，让成长有底</h3>
            <p>完整 JSON 包含私人日志、进度、训练、自评与设置。请妥善保管。</p>
          </div>
          <button className="button" onClick={() => void exportJSON()}>
            <Download size={16} />
            一键导出 JSON
          </button>
        </div>
        <div className="import-area">
          <Upload size={21} />
          <div>
            <strong>从 JSON 备份恢复</strong>
            <p>先校验并预览。导入前会保留当前数据的安全快照。</p>
          </div>
          <label className="button secondary file-label">
            选择备份文件
            <input
              type="file"
              accept=".json,application/json"
              aria-label="上传 JSON 备份"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 30 * 1024 * 1024) {
                  notify('备份文件超过 30 MB，请拆分或检查文件。', true);
                  e.target.value = '';
                  return;
                }
                try {
                  setBackup(dataService.previewBackup(await file.text()));
                } catch (err) {
                  notify(err instanceof Error ? err.message : '无法解析备份', true);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="csv-actions">
          <span>普通统计不包含私人日志</span>
          <button className="text-button" onClick={() => csv('trainingRecord')}>
            导出训练 CSV
            <Download size={14} />
          </button>
          <button className="text-button" onClick={() => csv('assessmentResult')}>
            导出自评 CSV
            <Download size={14} />
          </button>
        </div>
      </Card>
      {snapshots.length > 0 && (
        <Card className="safety-backups">
          <SectionTitle title="恢复用安全快照" />
          <p className="small muted">
            清空与导入前自动保留的本机副本，包含私人内容。建议下载到独立位置。
          </p>
          {snapshots.slice(0, 5).map((s) => (
            <div className="settings-row" key={s.id}>
              <span>
                {new Date(s.createdAt).toLocaleString('zh-CN')} · {s.backup.records.length} 条记录
              </span>
              <button
                className="text-button"
                onClick={() =>
                  downloadFile(`恢复快照-${s.id}.json`, JSON.stringify(s.backup, null, 2))
                }
              >
                下载快照
              </button>
            </div>
          ))}
        </Card>
      )}
      <SectionTitle title="阅读主题" />
      <div className="theme-grid">
        {[
          { id: 'light', name: 'Minimal Light', description: '米白 · 石墨 · 沉静绿' },
          { id: 'dark', name: 'Dark Executive', description: '炭黑 · 深灰 · 低饱和金' },
          { id: 'warm', name: 'Warm Literary', description: '暖白 · 咖啡 · 绿色' },
        ].map((t) => (
          <button
            className={`theme-option theme-${t.id} ${theme === t.id ? 'selected' : ''}`}
            key={t.id}
            onClick={() =>
              void perform(() =>
                dataService.saveTheme(t.id as 'light' | 'dark' | 'warm', settings[0]?.id),
              )
            }
          >
            <span className="theme-swatch">
              <i />
              <i />
              <i />
            </span>
            <strong>{t.name}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
      <Card className="privacy-notes">
        <SectionTitle title="保存前，了解这些事" />
        <ul>
          <li>浏览器本地存储不能替代独立备份；清除网站数据可能丢失未备份记录。</li>
          <li>无痕模式不适合长期保存私人笔记。建议定期导出 JSON 到其他位置。</li>
          <li>本机数据和 JSON 备份没有端到端加密，使用共享设备时请留意浏览器及设备访问权限。</li>
          <li>
            离线访问需要先在线成功缓存应用。开发服务器不提供正式离线缓存，请使用生产预览或 HTTPS
            部署。
          </li>
          <li>
            本应用不包含广告追踪，也不上传照片或录音。登录并完成配置后，当前账号空间内的私人文字记录会同步到你配置的
            Supabase 项目；游客数据需要明确选择迁移。
          </li>
        </ul>
      </Card>
      <Card className="danger-zone">
        <div>
          <h3>清空当前记录</h3>
          <p>
            {cloud.user
              ? '账号空间请使用指定记录的删除操作。清空本机缓存或替换整个账号空间会影响同步基线，当前暂不开放；游客模式仍可清空。'
              : '删除此游客空间的业务记录与本地队列，并保留一个恢复快照。不会操作其他来源的数据。'}
          </p>
        </div>
        <button
          className="button danger-button"
          disabled={!!cloud.user}
          onClick={() => {
            setDanger(true);
            setConfirmText('');
          }}
        >
          清空当前记录
        </button>
      </Card>
      {backup && (
        <Dialog
          title="JSON 备份预览"
          onClose={() => {
            if (!importing) setBackup(null);
          }}
        >
          <p>备份日期：{new Date(backup.exportedAt).toLocaleString('zh-CN')}</p>
          <p>
            结构版本 {backup.schemaVersion} · 应用 {backup.appVersion} · 共 {backup.records.length}{' '}
            条记录（含删除标记）
          </p>
          <div className="backup-counts">
            {Object.entries(
              backup.records.reduce<Record<string, number>>(
                (a, r) => ({ ...a, [r.kind]: (a[r.kind] ?? 0) + 1 }),
                {},
              ),
            ).map(([k, n]) => (
              <Tag key={k}>
                {k}: {n}
              </Tag>
            ))}
          </div>
          <label>
            恢复方式
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="merge">合并：保留原记录，不同内容创建副本</option>
              <option value="replace" disabled={!!cloud.user}>
                替换：用备份替换当前游客空间的记录
              </option>
            </select>
          </label>
          <p className="small muted">
            不会接续原备份的账号或上传授权。数据写入当前空间，导入失败时原有记录保留。账号空间仅支持合并，新增内容作为本机修改等待同步。
            合并时已有计划、主题、课程进度与笔记继续优先显示，不同内容保留为导入副本。
          </p>
          <div className="form-row">
            <button className="button secondary" onClick={() => void exportJSON()}>
              先下载当前备份
            </button>
            <button
              className="button"
              disabled={importing}
              onClick={async () => {
                if (!(await flushAllSaves())) {
                  notify('还有未保存的编辑，请先重试保存。', true);
                  return;
                }
                if (mode === 'replace' && !confirm('替换当前记录？导入前会保留安全快照。')) return;
                setImporting(true);
                if (
                  await perform(
                    () => dataService.importBackup(backup, mode),
                    '备份已恢复到本机，安全快照已保留。',
                  )
                )
                  setBackup(null);
                setImporting(false);
              }}
            >
              <RefreshCw size={16} />
              {importing ? '正在恢复…' : '确认恢复'}
            </button>
          </div>
        </Dialog>
      )}
      {danger && (
        <Dialog
          title="确认清空当前记录"
          onClose={() => {
            if (!clearing) setDanger(false);
          }}
        >
          <p>
            请先导出备份。这会清空当前业务记录并保留恢复快照；快照仍包含私人内容，不等于完整隐私擦除。
          </p>
          <button className="button secondary" onClick={() => void exportJSON()}>
            先导出备份
          </button>
          <label>
            输入「清空」确认
            <input
              aria-label="清空确认文字"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </label>
          <button
            className="button danger-button"
            disabled={confirmText !== '清空' || clearing}
            onClick={async () => {
              if (!(await flushAllSaves())) {
                notify('还有未保存的编辑，请先重试保存。', true);
                return;
              }
              setClearing(true);
              if (
                await perform(() => dataService.clear(), '当前记录已清空，恢复快照仍保留在本机。')
              )
                setDanger(false);
              setClearing(false);
            }}
          >
            确认清空
          </button>
        </Dialog>
      )}
    </>
  );
}
