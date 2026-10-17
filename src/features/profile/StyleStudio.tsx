import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Leaf,
  NotebookPen,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { PageHeading, Card, SectionTitle, Dialog, Tag } from '../../shared/ui';
import { useProfileService } from '../../hooks/useFeatureServices';
import { useServiceQuery } from '../../hooks/useServiceQuery';
import { useFeedback } from '../../shared/feedback';
import type { BusinessRecord, RecordPayloads } from '../../types';

const goalStatuses = ['进行中', '已完成', '暂缓'];
const goalPriorities = ['高', '中', '低'];

export function StyleStudio() {
  const profileService = useProfileService();
  const interestRecords: BusinessRecord[] = useServiceQuery(() => profileService.listInterests(), profileService);
  const goalRecords: BusinessRecord[] = useServiceQuery(() => profileService.listGoals(), profileService);
  const interests = interestRecords.filter(
    (record): record is BusinessRecord<'userInterest'> => record.kind === 'userInterest',
  );
  const goals = goalRecords.filter(
    (record): record is BusinessRecord<'growthGoal'> => record.kind === 'growthGoal',
  );
  const [interestEditor, setInterestEditor] = useState<
    BusinessRecord<'userInterest'> | 'new' | null
  >(null);
  const [goalEditor, setGoalEditor] = useState<BusinessRecord<'growthGoal'> | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { perform } = useFeedback();

  async function removeRecord(
    record: BusinessRecord<'userInterest'> | BusinessRecord<'growthGoal'>,
  ) {
    const title = record.kind === 'userInterest' ? record.payload.name : record.payload.title;
    if (!confirm(`确定删除「${title}」？建议先导出备份，删除后本机会保留删除标记。`)) return;
    setBusyId(record.id);
    await perform(() => profileService.removeRecord(record), '已在本机删除记录');
    setBusyId(null);
  }

  async function changeGoalStatus(record: BusinessRecord<'growthGoal'>, status: string) {
    setBusyId(record.id);
    await perform(() => profileService.changeGoalStatus(record, status));
    setBusyId(null);
  }

  return (
    <>
      <PageHeading
        eyebrow="PERSONAL STYLE STUDIO"
        title="个人风格工作室"
        description="留意让你舒服、好奇、愿意持续投入的事。风格在真实生活里慢慢形成。"
        action={
          <Tag color="green">
            <Leaf size={14} /> 自己定义，慢慢探索
          </Tag>
        }
      />

      <div className="studio-grid">
        <Card>
          <SectionTitle title="我的兴趣清单" />
          <p className="small muted">
            不需要精通才可以开始。记录一个兴趣，以及愿意尝试的下一小步。
          </p>
          <button className="button secondary" onClick={() => setInterestEditor('new')}>
            <Plus size={16} />
            添加兴趣
          </button>
          <div className="interest-list">
            {interests.map((record) => (
              <div className="studio-record" key={record.id}>
                <div className="section-title">
                  <h3>{record.payload.name}</h3>
                  <Tag>兴趣探索</Tag>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {record.payload.note || '还没有探索笔记。可以写一个想试试的小行动。'}
                </p>
                <div className="studio-actions">
                  <button
                    className="text-button"
                    disabled={busyId === record.id}
                    onClick={() => setInterestEditor(record)}
                  >
                    <Pencil size={14} />
                    编辑
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busyId === record.id}
                    onClick={() => void removeRecord(record)}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            ))}
            {!interests.length && (
              <div className="empty">
                <Leaf size={28} />
                <h3>给好奇心留个位置</h3>
                <p>摄影、散步、阅读、烹饪，或任何你愿意花一点时间探索的事情。</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle title="把愿望变成小目标" />
          <p className="small muted">
            用具体行动描述目标，期限可以留空。完成与暂缓都值得如实记录。
          </p>
          <button className="button secondary" onClick={() => setGoalEditor('new')}>
            <Plus size={16} />
            添加成长目标
          </button>
          <div className="goal-list">
            {goals.map((record) => (
              <div className="studio-record" key={record.id}>
                <div className="section-title">
                  <h3>
                    {record.payload.status === '已完成' && <Check size={17} />}{' '}
                    {record.payload.title}
                  </h3>
                  <Tag>{record.payload.priority}优先级</Tag>
                </div>
                <p className="small muted">
                  {record.payload.deadline
                    ? `目标日期：${record.payload.deadline}`
                    : '未设期限，按自己的节奏推进'}
                </p>
                <div className="studio-actions">
                  <select
                    aria-label={`${record.payload.title}的状态`}
                    value={record.payload.status}
                    disabled={busyId === record.id}
                    onChange={(event) => void changeGoalStatus(record, event.target.value)}
                  >
                    {Array.from(new Set([...goalStatuses, record.payload.status])).map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <button
                    className="text-button"
                    disabled={busyId === record.id}
                    onClick={() => setGoalEditor(record)}
                  >
                    <Pencil size={14} />
                    编辑
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busyId === record.id}
                    onClick={() => void removeRecord(record)}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            ))}
            {!goals.length && (
              <div className="empty">
                <Target size={28} />
                <h3>一个小目标就够了</h3>
                <p>例如“本周读完一个短篇并写三句感受”，比“变得有品位”更容易行动。</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <StyleReflection />

      <Card>
        <SectionTitle title="为生活添一点探索" />
        <p>
          选一个你真正好奇的方向：留意路上的一处细节、听一首没听过的歌、尝试一道简单菜，或问朋友最近喜欢的一部作品。完成后写下一条具体发现。
        </p>
        <div className="studio-actions">
          <button className="button secondary" onClick={() => setGoalEditor('new')}>
            <Sparkles size={16} />
            把探索写成目标
          </button>
          <Link className="text-button" to="/journal">
            记录生活里的发现
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <p className="small muted">审美没有统一排名；兴趣也不需要换取他人的认可。</p>
      </Card>

      {interestEditor && (
        <InterestEditor
          key={interestEditor === 'new' ? 'new' : interestEditor.id}
          initial={interestEditor === 'new' ? undefined : interestEditor}
          onClose={() => setInterestEditor(null)}
        />
      )}
      {goalEditor && (
        <GoalEditor
          key={goalEditor === 'new' ? 'new' : goalEditor.id}
          initial={goalEditor === 'new' ? undefined : goalEditor}
          onClose={() => setGoalEditor(null)}
        />
      )}
    </>
  );
}

function InterestEditor({
  initial,
  onClose,
}: {
  initial?: BusinessRecord<'userInterest'>;
  onClose: () => void;
}) {
  const profileService = useProfileService();
  const [form, setForm] = useState<RecordPayloads['userInterest']>(
    initial?.payload ?? { name: '', note: '' },
  );
  const [saving, setSaving] = useState(false);
  const { perform, notify } = useFeedback();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      notify('请填写一个兴趣名称。', true);
      return;
    }
    setSaving(true);
    if (
      await perform(() =>
        profileService.saveInterest(form, initial?.id),
      )
    )
      onClose();
    setSaving(false);
  }

  return (
    <Dialog title={initial ? '编辑兴趣与探索笔记' : '添加一个兴趣'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)}>
        <label>
          兴趣名称
          <input
            autoFocus
            required
            maxLength={160}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="例如：街头摄影、科幻小说、烹饪"
          />
        </label>
        <label>
          为什么感兴趣？下一步想做什么？
          <textarea
            maxLength={20000}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="我喜欢什么？试过什么？接下来想花 15 分钟做哪件小事？"
          />
        </label>
        <p className="small muted">这里的内容保存在此浏览器的本机数据库中。</p>
        <div className="studio-actions">
          <button className="button" disabled={saving}>
            {saving ? '正在保存…' : '保存到本机'}
          </button>
          <button type="button" className="button secondary" disabled={saving} onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function GoalEditor({
  initial,
  onClose,
}: {
  initial?: BusinessRecord<'growthGoal'>;
  onClose: () => void;
}) {
  const profileService = useProfileService();
  const [form, setForm] = useState<RecordPayloads['growthGoal']>(
    initial?.payload ?? { title: '', deadline: '', priority: '中', status: '进行中' },
  );
  const [saving, setSaving] = useState(false);
  const { perform, notify } = useFeedback();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      notify('请用一句话描述你的目标。', true);
      return;
    }
    setSaving(true);
    if (
      await perform(() =>
        profileService.saveGoal(form, initial?.id),
      )
    )
      onClose();
    setSaving(false);
  }

  return (
    <Dialog title={initial ? '编辑成长目标' : '添加成长目标'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)}>
        <label>
          想完成的具体行动
          <input
            autoFocus
            required
            maxLength={200}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="例如：周日散步时观察并记录三处光影"
          />
        </label>
        <div className="form-row">
          <label>
            目标日期（可不填）
            <input
              type="date"
              value={form.deadline}
              onChange={(event) => setForm({ ...form, deadline: event.target.value })}
            />
          </label>
          <label>
            优先级
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
            >
              {Array.from(new Set([...goalPriorities, form.priority])).map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          当前状态
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
          >
            {Array.from(new Set([...goalStatuses, form.status])).map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <p className="small muted">可以随时调整期限、状态和优先级，计划是帮助你行动的工具。</p>
        <div className="studio-actions">
          <button className="button" disabled={saving}>
            {saving ? '正在保存…' : '保存到本机'}
          </button>
          <button type="button" className="button secondary" disabled={saving} onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function StyleReflection() {
  const profileService = useProfileService();
  const [feeling, setFeeling] = useState('');
  const [scene, setScene] = useState('');
  const [action, setAction] = useState('');
  const [journalId, setJournalId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { perform } = useFeedback();
  const hasContent = [feeling, scene, action].some((value) => value.trim());

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!hasContent) return;
    setSaving(true);
    await perform(async () => {
      const entry = await profileService.saveStyleReflection({ feeling, scene, action }, journalId);
      setJournalId(entry.id);
    });
    setSaving(false);
  }

  return (
    <Card>
      <SectionTitle title="探索自己的风格" />
      <p>
        从真实感受开始，不必把自己归入某种固定类型。可以只回答一个问题；答案会作为私人思想笔记保存。
      </p>
      <form onSubmit={(event) => void save(event)}>
        <div className="form-row">
          <label>
            我希望日常给自己的感觉
            <textarea
              maxLength={10000}
              value={feeling}
              onChange={(event) => setFeeling(event.target.value)}
              placeholder="例如：自然、利落、温暖。哪些感觉对我重要？"
            />
          </label>
          <label>
            一个让我觉得“这很像我”的场景
            <textarea
              maxLength={10000}
              value={scene}
              onChange={(event) => setScene(event.target.value)}
              placeholder="回想一次穿着、表达、创作或生活体验。是什么让我舒服？"
            />
          </label>
        </div>
        <label>
          不用证明给别人看，我想尝试的一小步
          <textarea
            maxLength={10000}
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="例如：整理一套适合上课的舒适搭配，或向朋友分享一次散步的发现。"
          />
        </label>
        <div className="studio-actions">
          <button className="button" disabled={saving || !hasContent}>
            <NotebookPen size={16} />
            {saving ? '正在保存…' : journalId ? '更新这份探索笔记' : '保存为私人笔记'}
          </button>
          {journalId && (
            <Link className="text-button" to={`/journal?entry=${journalId}`}>
              打开已保存的笔记
              <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        <p className="small muted">
          点击保存后才写入本机。这里不评价长相、不生成审美或吸引力分数，也不上传照片。
        </p>
      </form>
    </Card>
  );
}
