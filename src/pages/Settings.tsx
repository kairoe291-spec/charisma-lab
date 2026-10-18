import { useState } from 'react';
import { useCloud } from '../cloud/context';
import { CloudAccountPanel } from '../components/CloudAccountPanel';
import { ConflictPanel } from '../components/ConflictPanel';
import {
  BackupRestorePanel,
  ClearGuestDataPanel,
  StatisticsExportPanel,
  StorageStatusPanel,
} from '../features/settings';
import { useDataManagementService } from '../hooks/useFeatureServices';
import { useRecords } from '../hooks/useRecords';
import { useFeedback } from '../shared/feedback';
import { Card, PageHeading, SectionTitle } from '../shared/ui';

export default function SettingsPage() {
  const dataService = useDataManagementService();
  const cloud = useCloud();
  const settings = useRecords('appSettings');
  const { perform } = useFeedback();
  // A page-level signal connects the two data panels without moving their workflows here.
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const refreshSnapshots = () => setSnapshotRevision((revision) => revision + 1);
  const theme = settings[0]?.payload.theme ?? 'light';

  return (
    <>
      <PageHeading
        eyebrow="DATA, PRIVACY & PREFERENCES"
        title="数据与同步设置"
        description="你的记录由你掌握。查看保存位置，定期备份，再选择适合自己的体验。"
      />
      <div className="settings-grid">
        <StorageStatusPanel isAccount={Boolean(cloud.user)} />
        <CloudAccountPanel />
      </div>
      <ConflictPanel />
      <BackupRestorePanel
        isAccount={Boolean(cloud.user)}
        snapshotRevision={snapshotRevision}
        onDataChanged={refreshSnapshots}
      >
        <StatisticsExportPanel />
      </BackupRestorePanel>
      <SectionTitle title="阅读主题" />
      <div className="theme-grid">
        {[
          { id: 'light', name: 'Minimal Light', description: '米白 · 石墨 · 沉静绿' },
          { id: 'dark', name: 'Dark Executive', description: '炭黑 · 深灰 · 低饱和金' },
          { id: 'warm', name: 'Warm Literary', description: '暖白 · 咖啡 · 绿色' },
        ].map((option) => (
          <button
            className={`theme-option theme-${option.id} ${theme === option.id ? 'selected' : ''}`}
            key={option.id}
            onClick={() =>
              void perform(() =>
                dataService.saveTheme(option.id as 'light' | 'dark' | 'warm', settings[0]?.id),
              )
            }
          >
            <span className="theme-swatch">
              <i />
              <i />
              <i />
            </span>
            <strong>{option.name}</strong>
            <span>{option.description}</span>
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
      <ClearGuestDataPanel
        key={cloud.scope}
        isAccount={Boolean(cloud.user)}
        onCleared={refreshSnapshots}
      />
    </>
  );
}
