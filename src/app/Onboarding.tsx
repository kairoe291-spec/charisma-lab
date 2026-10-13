import { useState } from 'react';
import { Sprout, Check } from 'lucide-react';
import { modules } from '../content';
import { repository } from '../data/repository';
import { useFeedback } from './context';
import { today } from '../utils/files';
import { Dialog } from '../components/ui';
import type { Profile } from './types';
export function Onboarding({
  initial,
  id,
  onClose,
}: {
  initial?: Profile;
  id?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Profile>(
    initial ?? {
      name: '',
      focus: ['M04', 'M06', 'M08'],
      dailyMinutes: 15,
      weeklyDays: 5,
      scene: '校园交流',
      goal: '更从容地表达自己，建立真实的人际关系。',
      startDate: today(),
    },
  );
  const [saving, setSaving] = useState(false);
  const { perform, notify } = useFeedback();
  function toggle(id: string) {
    if (form.focus.includes(id)) setForm({ ...form, focus: form.focus.filter((x) => x !== id) });
    else if (form.focus.length < 3) setForm({ ...form, focus: [...form.focus, id] });
    else notify('请选择最重视的 3 个维度。');
  }
  return (
    <Dialog title={initial ? '调整我的成长计划' : '欢迎来到你的成长实验室'} onClose={onClose}>
      <div className="welcome-icon">
        <Sprout size={30} />
      </div>
      <p className="muted">成长有自己的节奏。先定一个能融入生活的小计划。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          if (await perform(() => repository.save('profile', form, id))) {
            onClose();
          }
          setSaving(false);
        }}
      >
        <label>
          如何称呼你
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={50}
            required
            placeholder="你的昵称"
          />
        </label>
        <label>选择最重视的 3 个维度（已选 {form.focus.length}/3）</label>
        <div className="focus-grid">
          {modules.map((m) => (
            <button
              type="button"
              key={m.id}
              className={form.focus.includes(m.id) ? 'selected' : ''}
              onClick={() => toggle(m.id)}
            >
              {form.focus.includes(m.id) && <Check size={12} />} {m.shortTitle}
            </button>
          ))}
        </div>
        <div className="form-row">
          <label>
            每天训练
            <select
              value={form.dailyMinutes}
              onChange={(e) => setForm({ ...form, dailyMinutes: Number(e.target.value) })}
            >
              <option value={5}>5 分钟</option>
              <option value={15}>15 分钟</option>
              <option value={30}>30 分钟</option>
            </select>
          </label>
          <label>
            每周学习
            <select
              value={form.weeklyDays}
              onChange={(e) => setForm({ ...form, weeklyDays: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} 天
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          优先练习的场景
          <input
            value={form.scene}
            onChange={(e) => setForm({ ...form, scene: e.target.value })}
            required
            maxLength={100}
          />
        </label>
        <label>
          你的长期目标
          <textarea
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
            required
            maxLength={1000}
          />
        </label>
        <button className="button" disabled={saving || form.focus.length !== 3}>
          {saving ? '正在保存…' : '开启我的成长计划'}
        </button>
        <p className="small muted">游客模式 · 数据仅保存在此设备浏览器。可随时调整计划。</p>
      </form>
    </Dialog>
  );
}
