import { useState } from 'react';
import { useDataManagementService } from '../hooks/useFeatureServices';
import { useServiceQuery } from '../hooks/useServiceQuery';
import { useFeedback } from '../app/context';
import { useSync } from '../app/SyncProvider';
import { flushAllSaves } from '../app/saveCoordinator';
import type { BusinessRecord, ConflictRecord } from '../domain/types';
import { Card, Dialog, SectionTitle, Tag } from './ui';

function content(record: BusinessRecord | null) {
  if (!record) return '云端没有这条记录。';
  const p = record.payload;
  if ('body' in p) return `${p.title}\n\n${p.body}`;
  if ('text' in p) return p.text;
  return JSON.stringify(p, null, 2);
}
export function ConflictPanel() {
  const dataService = useDataManagementService();
  const conflicts = useServiceQuery(() => dataService.listConflicts(), dataService);
  const [selected, setSelected] = useState<ConflictRecord | null>(null);
  if (!conflicts.length) return null;
  return <Card className="conflict-panel"><SectionTitle title="需要你确认的不同版本" />
    <p>两份内容都已保留。选择时会再次检查云端版本，避免覆盖其他设备的新修改。</p>
    {conflicts.map(c => <div className="settings-row" key={c.id}><span>{'title' in c.local.payload ? c.local.payload.title : c.local.kind} · {new Date(c.detectedAt).toLocaleString('zh-CN')}</span><button className="button secondary" onClick={() => setSelected(c)}>对比两个版本</button></div>)}
    {selected && <ConflictEditor key={selected.id} conflict={selected} onClose={() => setSelected(null)} />}
  </Card>;
}
function ConflictEditor({ conflict, onClose }: { conflict: ConflictRecord; onClose: () => void }) {
  const dataService = useDataManagementService();
  const { perform, notify } = useFeedback();
  const { runSync } = useSync();
  const [merging, setMerging] = useState(false);
  const [draft, setDraft] = useState(content(conflict.local));
  const [busy, setBusy] = useState(false);
  async function resolve(choice: 'local' | 'remote' | 'merge') {
    if (!(await flushAllSaves())) { notify('请先保存当前编辑后再处理冲突。', true); return; }
    setBusy(true);
    const ok = await perform(async () => {
      let payload: unknown;
      if (choice === 'merge') {
        if (conflict.local.kind === 'journalEntry') {
          const lines = draft.split('\n');
          payload = { ...conflict.local.payload, title: lines.shift()?.trim() || '合并日志', body: lines.join('\n').replace(/^\n/, '') };
        } else if (conflict.local.kind === 'lessonNote') payload = { ...conflict.local.payload, text: draft };
        else payload = JSON.parse(draft);
      }
      await dataService.resolveConflict(conflict.id, choice, payload);
    }, '你的选择已保存到本机；原版本已保留恢复副本，联网后继续同步。');
    setBusy(false);
    if (ok) { onClose(); void runSync().catch(() => {}); }
  }
  return <Dialog title="对比与处理版本冲突" onClose={() => { if (!busy) onClose(); }}>
    <div className="conflict-columns">
      <div><h3>本地版本 · 当前设备</h3><p className="small muted">{new Date(conflict.local.updatedAt).toLocaleString('zh-CN')}</p>{conflict.local.deletedAt && <Tag>本地已删除</Tag>}<pre>{content(conflict.local)}</pre></div>
      <div><h3>云端版本 {conflict.remote?.serverVersion ?? '—'}</h3><p className="small muted">{conflict.remote?.serverUpdatedAt ? new Date(conflict.remote.serverUpdatedAt).toLocaleString('zh-CN') : '无远端时间'}</p>{conflict.remote?.deletedAt && <Tag>云端已删除</Tag>}<pre>{content(conflict.remote)}</pre></div>
    </div>
    {merging && <label>手动合并内容 {conflict.local.kind === 'journalEntry' ? '（第一行是标题，其后是正文）' : conflict.local.kind === 'lessonNote' ? '' : '（JSON）'}<textarea aria-label="手动合并内容" rows={10} value={draft} onChange={e => setDraft(e.target.value)} /></label>}
    <p className="small muted">若云端已删除，保留本地或合并会创建新副本，不复活原记录。暂时跳过会继续保留双方内容。</p>
    <div className="cloud-actions">
      <button className="button" disabled={busy} onClick={() => void resolve('local')}>保留本地版本</button>
      <button className="button secondary" disabled={busy} onClick={() => void resolve('remote')}>保留云端版本</button>
      {merging ? <button className="button" disabled={busy} onClick={() => void resolve('merge')}>保存合并版本</button> : <button className="button secondary" onClick={() => setMerging(true)}>对比后手动合并</button>}
      <button className="text-button" disabled={busy} onClick={onClose}>暂时跳过</button>
    </div>
  </Dialog>;
}
