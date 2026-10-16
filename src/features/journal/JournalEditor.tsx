import { useEffect, useRef, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useRepository } from '../../hooks/useRepository';
import { useSaveQueue } from '../../hooks/useSaveQueue';
import { hasUnsavedChanges } from '../../services/saveCoordinator';
import { useFeedback } from '../../shared/feedback';
import type { JournalEntry as Journal, BusinessRecord } from '../../types';
import { Card, Tag } from '../../shared/ui';
import { saveJournalEntry, parseJournalTags } from './journalService';

export function JournalEditor({
  record,
  onDeleted,
}: {
  record: BusinessRecord<'journalEntry'>;
  onDeleted: () => void;
}) {
  const repository = useRepository();
  const [form, setForm] = useState<Journal>(record.payload);
  const [tags, setTags] = useState(record.payload.tags.join('，'));
  const [preview, setPreview] = useState(false);
  const { enqueue, state } = useSaveQueue();
  const { perform } = useFeedback();
  const shownVersion = useRef(record.serverVersion);
  useEffect(() => {
    if (
      record.serverVersion !== shownVersion.current &&
      record.syncStatus === 'synced' &&
      !hasUnsavedChanges()
    ) {
      shownVersion.current = record.serverVersion;
      setForm(record.payload);
      setTags(record.payload.tags.join('，'));
    }
  }, [record]);
  function update(patch: Partial<Journal>) {
    const next = { ...form, ...patch };
    setForm(next);
    void enqueue(() => saveJournalEntry(repository, record.id, next));
  }
  return (
    <Card className="journal-editor">
      <div className="editor-tools">
        <Tag color="green">私人笔记</Tag>
        <span className="save-state" role="status">
          {state}
        </span>
        <button
          title="Markdown 预览"
          aria-label="切换预览"
          onClick={() => setPreview(!preview)}
          className={preview ? 'selected' : ''}
        >
          <Eye size={18} />
        </button>
        <button
          aria-label="删除日志"
          className="danger"
          onClick={async () => {
            if (confirm('确定删除这篇日志？建议先导出备份。')) {
              await enqueue(async () => {
                if (await perform(() => repository.remove(record.id), '已在本机删除日志'))
                  onDeleted();
              });
            }
          }}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <input
        className="journal-title"
        aria-label="日志标题"
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        maxLength={200}
        placeholder="日志标题"
      />
      <div className="journal-meta">
        <input
          aria-label="日志日期"
          type="date"
          required
          value={form.date}
          onChange={(e) => {
            if (e.target.value) update({ date: e.target.value });
          }}
        />
        <select
          aria-label="日志类型"
          value={form.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          {['每日成长', '社交复盘', '思想笔记', '每周总结'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <label className="tags-field">
        标签
        <input
          aria-label="日志标签"
          placeholder="用逗号分隔，例如：表达，发现"
          value={tags}
          maxLength={300}
          onChange={(e) => {
            setTags(e.target.value);
            update({
              tags: parseJournalTags(e.target.value),
            });
          }}
        />
      </label>
      {preview ? (
        <div className="markdown-preview">
          <ReactMarkdown>{form.body || '还没有内容。'}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="journal-body"
          aria-label="日志正文"
          value={form.body}
          maxLength={100000}
          placeholder={
            '今天，我注意到…\n\n发生了什么？我有什么感受？\n下一次，我想试着…\n\n支持 Markdown：## 标题、**加粗**、- 列表'
          }
          onChange={(e) => update({ body: e.target.value })}
        />
      )}
      <div className="editor-bottom">
        <span>Markdown · {form.body.length} 字 · 本机 IndexedDB</span>
        <button
          className="text-button"
          onClick={() => void enqueue(() => saveJournalEntry(repository, record.id, form))}
        >
          立即保存 / 重试
        </button>
      </div>
    </Card>
  );
}
