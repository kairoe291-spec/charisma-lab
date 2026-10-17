import { useState } from 'react';
import { getModules, getTasks, trainingDurations } from '../../content';
import { useTrainingService } from '../../hooks/useFeatureServices';
import { useFeedback } from '../../shared/feedback';
import { Dialog } from '../../shared/ui';

export function CustomTaskForm({ onClose }: { onClose: () => void }) {
  const modules = getModules();
  const trainingService = useTrainingService();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [moduleId, setModule] = useState(getTasks()[0]?.moduleId ?? modules[0]?.id ?? '');
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
              trainingService.createTask({ title, description, minutes, moduleId }),
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
              {trainingDurations.map(({ minutes: duration }) => (
                <option key={duration} value={duration}>
                  {duration} 分钟
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
