import { useCallback } from 'react';
import { useDataManagementService } from '../../hooks/useFeatureServices';
import { useFeedback } from '../../shared/feedback';
import { flushAllSaves } from '../../services/saveCoordinator';
import { downloadFile, today } from '../../utils/files';

/** Both backup buttons use the same application-wide pending-save coordinator. */
export function useBackupDownload() {
  const dataService = useDataManagementService();
  const { notify, perform } = useFeedback();

  return useCallback(async () => {
    if (!(await flushAllSaves())) {
      notify('存在尚未保存的编辑，请重试保存后再备份。', true);
      return;
    }
    await perform(async () => {
      const backup = await dataService.exportBackup();
      downloadFile(`charisma-lab-${today()}.json`, JSON.stringify(backup, null, 2));
    }, '备份已生成，请保存到独立的位置。');
  }, [dataService, notify, perform]);
}
