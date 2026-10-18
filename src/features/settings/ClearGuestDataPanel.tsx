import { useState } from 'react';
import { useDataManagementService } from '../../hooks/useFeatureServices';
import { useFeedback } from '../../shared/feedback';
import { Card, Dialog } from '../../shared/ui';
import { flushAllSaves } from '../../services/saveCoordinator';
import { useBackupDownload } from './useBackupDownload';

export function ClearGuestDataPanel({
  isAccount,
  onCleared,
}: {
  isAccount: boolean;
  onCleared: () => void;
}) {
  const dataService = useDataManagementService();
  const exportJSON = useBackupDownload();
  const { perform, notify } = useFeedback();
  const [danger, setDanger] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  async function clearGuestData() {
    if (isAccount || confirmText !== '清空' || clearing) return;
    if (!(await flushAllSaves())) {
      notify('还有未保存的编辑，请先重试保存。', true);
      return;
    }
    setClearing(true);
    try {
      if (await perform(() => dataService.clear(), '当前记录已清空，恢复快照仍保留在本机。')) {
        setDanger(false);
        onCleared();
      }
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <Card className="danger-zone">
        <div>
          <h3>清空当前记录</h3>
          <p>
            {isAccount
              ? '账号空间请使用指定记录的删除操作。清空本机缓存或替换整个账号空间会影响同步基线，当前暂不开放；游客模式仍可清空。'
              : '删除此游客空间的业务记录与本地队列，并保留一个恢复快照。不会操作其他来源的数据。'}
          </p>
        </div>
        <button
          className="button danger-button"
          disabled={isAccount}
          onClick={() => {
            setDanger(true);
            setConfirmText('');
          }}
        >
          清空当前记录
        </button>
      </Card>
      {danger && (
        <Dialog
          title="确认清空当前记录"
          onClose={() => {
            if (!clearing) setDanger(false);
          }}
        >
          <p>
            请先导出备份。这会清空当前业务记录并保留恢复快照；快照仍包含私人内容，不等于完整隐私擦除。
          </p>
          <button className="button secondary" onClick={() => void exportJSON()}>
            先导出备份
          </button>
          <label>
            输入「清空」确认
            <input
              aria-label="清空确认文字"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </label>
          <button
            className="button danger-button"
            disabled={confirmText !== '清空' || clearing}
            onClick={() => void clearGuestData()}
          >
            确认清空
          </button>
        </Dialog>
      )}
    </>
  );
}
