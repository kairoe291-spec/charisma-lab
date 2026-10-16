import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NotebookPen, Plus, Search } from 'lucide-react';
import { useRepository } from '../../hooks/useRepository';
import { useRecords } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import type { JournalEntry as Journal, BusinessRecord } from '../../types';
import { PageHeading, Card, Empty } from '../../shared/ui';
import { JournalEditor } from './JournalEditor';
import { filterJournalEntries, createJournalEntry } from './journalService';

export function JournalWorkspace() {
  const repository = useRepository();
  const records = useRecords('journalEntry');
  const [params, setParams] = useSearchParams();
  const id = params.get('entry');
  const selected = records.find((r) => r.id === id);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const { perform } = useFeedback();
  const [creating, setCreating] = useState(false);
  const visible = filterJournalEntries(records, search, category);
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
                const r = await createJournalEntry(repository);
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
