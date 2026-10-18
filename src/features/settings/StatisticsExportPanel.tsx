import { Download } from 'lucide-react';
import { useRecords } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import { exportCsv, today } from '../../utils/files';
import { buildAssessmentCsvRows, buildTrainingCsvRows } from './csvExport';

export function StatisticsExportPanel() {
  const records = useRecords();
  const { notify } = useFeedback();

  return (
    <div className="csv-actions">
      <span>普通统计不包含私人日志</span>
      <button
        className="text-button"
        onClick={() => {
          exportCsv(`训练记录-${today()}.csv`, buildTrainingCsvRows(records));
          notify('CSV 已生成；不包含个人日志。');
        }}
      >
        导出训练 CSV
        <Download size={14} />
      </button>
      <button
        className="text-button"
        onClick={() => {
          exportCsv(`阶段自评-${today()}.csv`, buildAssessmentCsvRows(records));
          notify('CSV 已生成；不包含个人日志。');
        }}
      >
        导出自评 CSV
        <Download size={14} />
      </button>
    </div>
  );
}
