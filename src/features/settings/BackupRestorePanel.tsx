import { useEffect, useState, type ReactNode } from 'react';
import { Database, Download, RefreshCw, Upload } from 'lucide-react';
import { useDataManagementService } from '../../hooks/useFeatureServices';
import { useRecords } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import { Card, Dialog, SectionTitle, Tag } from '../../shared/ui';
import { flushAllSaves } from '../../services/saveCoordinator';
import { downloadFile } from '../../utils/files';
import type { Backup, SafetyBackup } from '../../domain/types';
import { useBackupDownload } from './useBackupDownload';

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function BackupRestorePanel({
  children,
  isAccount,
  snapshotRevision,
  onDataChanged,
}: {
  children: ReactNode;
  isAccount: boolean;
  snapshotRevision: number;
  onDataChanged: () => void;
}) {
  const dataService = useDataManagementService();
  const records = useRecords();
  const { perform, notify } = useFeedback();
  const exportJSON = useBackupDownload();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [snapshots, setSnapshots] = useState<SafetyBackup[]>([]);

  useEffect(() => {
    let active = true;
    dataService
      .listSafetyBackups()
      .then((items) => {
        if (active) setSnapshots(items);
      })
      .catch(() => {
        if (active) notify('无法读取本机安全快照，请检查浏览器存储权限。', true);
      });
    return () => {
      active = false;
    };
  }, [dataService, notify, records, snapshotRevision]);

  useEffect(() => {
    if (isAccount) setMode('merge');
  }, [isAccount]);

  async function selectBackup(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      notify('备份文件超过 30 MB，请拆分或检查文件。', true);
      return;
    }
    try {
      setBackup(dataService.previewBackup(await file.text()));
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法解析备份', true);
    }
  }

  async function restore() {
    if (!backup || importing) return;
    if (!(await flushAllSaves())) {
      notify('还有未保存的编辑，请先重试保存。', true);
      return;
    }
    if (mode === 'replace') {
      if (isAccount) {
        notify('账号空间仅允许合并恢复，请切换游客空间后使用替换。', true);
        return;
      }
      if (!confirm('替换当前记录？导入前会保留安全快照。')) return;
    }
    setImporting(true);
    try {
      if (
        await perform(
          () => dataService.importBackup(backup, mode),
          '备份已恢复到本机，安全快照已保留。',
        )
      ) {
        setBackup(null);
        onDataChanged();
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
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
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await selectBackup(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {children}
      </Card>
      {snapshots.length > 0 && (
        <Card className="safety-backups">
          <SectionTitle title="恢复用安全快照" />
          <p className="small muted">
            清空与导入前自动保留的本机副本，包含私人内容。建议下载到独立位置。
          </p>
          {snapshots.slice(0, 5).map((snapshot) => (
            <div className="settings-row" key={snapshot.id}>
              <span>
                {new Date(snapshot.createdAt).toLocaleString('zh-CN')} ·{' '}
                {snapshot.backup.records.length} 条记录
              </span>
              <button
                className="text-button"
                onClick={() =>
                  downloadFile(
                    `恢复快照-${snapshot.id}.json`,
                    JSON.stringify(snapshot.backup, null, 2),
                  )
                }
              >
                下载快照
              </button>
            </div>
          ))}
        </Card>
      )}
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
                (counts, record) => ({
                  ...counts,
                  [record.kind]: (counts[record.kind] ?? 0) + 1,
                }),
                {},
              ),
            ).map(([kind, count]) => (
              <Tag key={kind}>
                {kind}: {count}
              </Tag>
            ))}
          </div>
          <label>
            恢复方式
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="merge">合并：保留原记录，不同内容创建副本</option>
              <option value="replace" disabled={isAccount}>
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
            <button className="button" disabled={importing} onClick={() => void restore()}>
              <RefreshCw size={16} />
              {importing ? '正在恢复…' : '确认恢复'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
