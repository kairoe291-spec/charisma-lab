import { useState } from 'react';
import { Check, Clock, Plus, Target } from 'lucide-react';
import { trainings, modules } from '../content';
import type { Training } from '../content/types';
import { repository } from '../data/repository';
import { useRecords } from '../hooks/useRecords';
import { useFeedback } from '../app/context';
import { Card, Dialog, Empty, PageHeading, SectionTitle, Tag } from '../components/ui';
import { today } from '../utils/files';
import type { TrainingRecord } from '../app/types';
export default function TrainingPage() {
  const [minutes, setMinutes] = useState(5);
  const [active, setActive] = useState<Training | null>(null);
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(today());
  const [reflection, setReflection] = useState('');
  const [difficulty, setDifficulty] = useState('入门');
  const [saving, setSaving] = useState(false);
  const [historyDate, setHistoryDate] = useState('');
  const records = useRecords('trainingRecord');
  const tasks = useRecords('trainingTask');
  const { perform } = useFeedback();
  const allTasks = [
    ...trainings,
    ...tasks.map((t) => ({
      id: t.id,
      ...(t.payload as {
        title: string;
        minutes: 5 | 15 | 30;
        moduleId: string;
        description: string;
      }),
      difficulty: '自主练习',
      steps: ['在合适的环境中进行练习。', '完成后记录真实体验与下一次的调整。'],
    })),
  ];
  return (
    <>
      <PageHeading
        eyebrow="DAILY PRACTICE"
        title="日常训练营"
        description="在真实生活里做一个小实验。行动比完美重要，记录比比较有用。"
        action={
          <button className="button secondary" onClick={() => setCustom(true)}>
            <Plus size={16} />
            自定义任务
          </button>
        }
      />
      <div className="duration-options">
        {[5, 15, 30].map((n, i) => (
          <button key={n} className={minutes === n ? 'selected' : ''} onClick={() => setMinutes(n)}>
            <Clock size={19} />
            <strong>{n} 分钟</strong>
            <span>{['轻量开始', '标准练习', '深度探索'][i]}</span>
          </button>
        ))}
      </div>
      <div className="training-grid">
        {allTasks
          .filter((t) => t.minutes === minutes)
          .map((t) => (
            <Card key={t.id} className="training-card">
              <div className="section-title">
                <span className="training-symbol">
                  <Target size={25} />
                </span>
                <Tag>{t.difficulty}</Tag>
              </div>
              <h2>{t.title}</h2>
              <p>{t.description}</p>
              <ol className="practice-steps">
                {t.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="training-card-footer">
                <span>
                  {modules.find((m) => m.id === t.moduleId)?.shortTitle ?? '自主成长'} · {t.minutes}{' '}
                  分钟
                </span>
                <button
                  className="button"
                  onClick={() => {
                    setActive(t);
                    setReflection('');
                    setDifficulty(t.difficulty);
                    setDate(today());
                  }}
                >
                  记录这次练习
                  <Check size={16} />
                </button>
              </div>
            </Card>
          ))}
      </div>
      <SectionTitle title="我的训练记录" />
      <label className="history-filter">
        按日期查询
        <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} />
        <button className="text-button" onClick={() => setHistoryDate('')}>
          全部日期
        </button>
      </label>
      {records.length ? (
        <div className="history-list">
          {records
            .filter((r) => !historyDate || (r.payload as TrainingRecord).date === historyDate)
            .map((r) => {
              const p = r.payload as TrainingRecord;
              return (
                <Card key={r.id} className="training-history">
                  <div>
                    <Check size={18} />
                    <h3>{p.title}</h3>
                    <Tag>{p.minutes} 分钟</Tag>
                    <span className="small muted">
                      {p.date} · {p.difficulty}
                    </span>
                  </div>
                  <p>{p.reflection || '本次练习已完成。'}</p>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      if (confirm('删除这条训练记录？此操作会保存删除标记。'))
                        void perform(() => repository.remove(r.id), '已在本机删除训练记录');
                    }}
                  >
                    删除记录
                  </button>
                </Card>
              );
            })}
        </div>
      ) : (
        <Empty
          title="从一次小练习开始"
          description="完成后记录日期与感受，你的真实练习会出现在这里。"
        />
      )}
      {active && (
        <Dialog title="记录现实练习" onClose={() => setActive(null)}>
          <Tag>{active.title}</Tag>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              if (
                await perform(() =>
                  repository.save('trainingRecord', {
                    taskId: active.id,
                    title: active.title,
                    moduleId: active.moduleId,
                    minutes: active.minutes,
                    date,
                    difficulty,
                    reflection,
                    completed: true,
                  }),
                )
              )
                setActive(null);
              setSaving(false);
            }}
          >
            <div className="form-row">
              <label>
                实际训练日期
                <input
                  type="date"
                  required
                  value={date}
                  max={today()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                此次难度
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  {Array.from(new Set([difficulty, '入门', '适中', '有挑战'])).map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              有什么感受或发现？
              <textarea
                aria-label="训练心得"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="发生了什么？下一次想做什么调整？"
                maxLength={20000}
              />
            </label>
            <button className="button" disabled={saving}>
              {saving ? '正在保存…' : '完成并保存到本机'}
            </button>
          </form>
        </Dialog>
      )}
      {custom && <CustomTask onClose={() => setCustom(false)} />}
    </>
  );
}
function CustomTask({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [moduleId, setModule] = useState('M04');
  const { perform } = useFeedback();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog title="添加自己的成长任务" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          if (
            await perform(() =>
              repository.save('trainingTask', { title, description, minutes, moduleId }),
            )
          )
            onClose();
          setSaving(false);
        }}
      >
        <label>
          任务名称
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          具体做什么？
          <textarea
            required
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            训练时长
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[5, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} 分钟
                </option>
              ))}
            </select>
          </label>
          <label>
            能力维度
            <select value={moduleId} onChange={(e) => setModule(e.target.value)}>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortTitle}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="button" disabled={saving}>
          保存任务
        </button>
      </form>
    </Dialog>
  );
}
