import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCloud } from '../cloud/context';
import { useRepository } from '../hooks/useRepository';
import { Repository } from '../data/repository';
import { db } from '../data/database';
import { Dialog } from './ui';
import { useFeedback } from '../app/context';
import { flushAllSaves } from '../app/saveCoordinator';
import { downloadFile, today } from '../utils/files';

export function GuestMigration({ manual = false, onClose }: { manual?: boolean; onClose?: () => void }) {
  const { user } = useCloud();
  const repository = useRepository();
  const info = useLiveQuery(() => user ? repository.getGuestMigrationState() : null, [repository, user?.id]);
  const [busy, setBusy] = useState(false);
  const { perform, notify } = useFeedback();
  if (!user || !info || (!manual && (info.decision || info.count === 0))) return null;
  async function choose(choice: 'merge' | 'keep' | 'cancel') {
    if (!(await flushAllSaves())) { notify('还有未保存的编辑，请先重试保存。', true); return; }
    setBusy(true);
    const ok = await perform(async () => {
      if (choice === 'merge') await repository.migrateGuestToAccount();
      await repository.setGuestMigrationDecision(choice);
    }, choice === 'merge' ? '游客数据已复制到账号空间，原游客记录仍保留。' : '游客数据继续保留在游客空间，可稍后再迁移。');
    setBusy(false);
    if (ok) onClose?.();
  }
  return <Dialog title="登录后的游客数据选择" onClose={() => { if (!busy) void choose('cancel'); }}>
    <p>当前浏览器有 {info.count} 条游客记录（含删除标记）。登录不会自动上传这些记录。</p>
    <p className="small muted">合并会先保留安全快照，再将记录复制到当前账号并排队同步。重复操作会去重；原游客数据保留。</p>
    <button className="button secondary" disabled={busy} onClick={() => void perform(async () => {
      const backup = await new Repository(db, 'guest').exportBackup();
      downloadFile(`游客迁移前备份-${today()}.json`, JSON.stringify(backup, null, 2));
    }, '游客备份已生成。')}>先导出游客备份</button>
    <div className="cloud-actions">
      <button className="button" disabled={busy || !info.count} onClick={() => void choose('merge')}>将游客数据合并到当前账号</button>
      <button className="button secondary" disabled={busy} onClick={() => void choose('keep')}>保留游客数据但不合并</button>
      <button className="text-button" disabled={busy} onClick={() => void choose('cancel')}>取消本次迁移</button>
    </div>
  </Dialog>;
}
