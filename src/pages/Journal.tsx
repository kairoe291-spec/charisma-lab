import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, NotebookPen, Plus, Search, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { repository } from '../data/repository';
import { useRecords } from '../hooks/useRecords';
import { useSaveQueue } from '../hooks/useSaveQueue';
import { useFeedback } from '../app/context';
import type { Journal } from '../app/types';
import { PageHeading, Card, Empty, Tag } from '../components/ui';
import { today } from '../utils/files';
import type { BusinessRecord } from '../domain/types';
export default function JournalPage() {
  const records = useRecords('journalEntry');
  const [params, setParams] = useSearchParams();
  const id = params.get('entry');
  const selected = records.find((r) => r.id === id);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const { perform } = useFeedback();
  const [creating, setCreating] = useState(false);
  const visible = records.filter((r) => {
    const p = r.payload as Journal;
    return (
      (category === '全部' || p.category === category) &&
      [p.title, p.body, ...p.tags].join('').includes(search)
    );
  });
  return (
    <>
      <PageHeading
        eyebrow="PRIVATE GROWTH JOURNAL"
        title="个人成长档案"
        description="为生活里的思考留一个位置。这里的文字，默认只属于你。"
        action={
          <button
            className="button"
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              await perform(async () => {
                const r = await repository.save('journalEntry', {
                  title: '未命名日志',
                  body: '',
                  tags: [],
                  category: '每日成长',
                  date: today(),
                });
                setParams({ entry: r.id });
              });
              setCreating(false);
            }}
          >
            <Plus size={16} />
            新建日志
          </button>
        }
      />
      <div className="journal-layout">
        <Card className="journal-index">
          <label className="inline-search">
            <Search size={16} />
            <input
              aria-label="搜索日志"
              placeholder="搜索内容或标签"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="日志类型筛选"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['全部', '每日成长', '社交复盘', '思想笔记', '每周总结'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="journal-items">
            {visible.map((r) => {
              const p = r.payload as Journal;
              return (
                <button
                  key={r.id}
                  className={id === r.id ? 'selected' : ''}
                  onClick={() => setParams({ entry: r.id })}
                >
                  <div>
                    <small>{p.date}</small>
                    <span>{p.category}</span>
                  </div>
                  <strong>{p.title}</strong>
                  <p>{p.body.slice(0, 65) || '一个新的开始…'}</p>
                  <div className="topic-tags">
                    {p.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </button>
              );
            })}
            {!visible.length && <p className="small muted">还没有匹配的记录。</p>}
          </div>
        </Card>
        {selected ? (
          <JournalEditor
            key={selected.id}
            record={selected as BusinessRecord<'journalEntry'>}
            onDeleted={() => setParams({})}
          />
        ) : (
          <Card className="journal-placeholder">
            <Empty
              title="把经历，变成自己的成长"
              description="写下今天发生的事、自己的感受，以及下一次想尝试的行动。点击「新建日志」开始。"
            />
            <NotebookPen size={60} />
          </Card>
        )}
      </div>
    </>
  );
}
function JournalEditor({
  record,
  onDeleted,
}: {
  record: BusinessRecord<'journalEntry'>;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<Journal>(record.payload);
  const [tags, setTags] = useState(record.payload.tags.join('，'));
  const [preview, setPreview] = useState(false);
  const { enqueue, state } = useSaveQueue();
  const { perform } = useFeedback();
  function update(patch: Partial<Journal>) {
    const next = { ...form, ...patch };
    setForm(next);
    void enqueue(() =>
      repository.save(
        'journalEntry',
        { ...next, title: next.title.trim() || '未命名日志' },
        record.id,
      ),
    );
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
              tags: Array.from(
                new Set(
                  e.target.value
                    .split(/[,，]/)
                    .map((t) => t.trim().slice(0, 40))
                    .filter(Boolean),
                ),
              ).slice(0, 20),
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
          onClick={() =>
            void enqueue(() =>
              repository.save(
                'journalEntry',
                { ...form, title: form.title.trim() || '未命名日志' },
                record.id,
              ),
            )
          }
        >
          立即保存 / 重试
        </button>
      </div>
    </Card>
  );
}
