import { useState } from 'react';
import { modules } from '../../content';
import { useRepository } from '../../hooks/useRepository';
import { useFeedback } from '../../shared/feedback';
import { Dialog } from '../../shared/ui';

export function CustomTaskForm({ onClose }: { onClose: () => void }) {
  const repository = useRepository();
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
