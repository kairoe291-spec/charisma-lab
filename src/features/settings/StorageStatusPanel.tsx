import { useEffect, useState } from 'react';
import { HardDrive, ShieldCheck } from 'lucide-react';
import { useRecordsState } from '../../hooks/useRecords';
import { useFeedback } from '../../shared/feedback';
import { Card, SectionTitle, Tag } from '../../shared/ui';

export function StorageStatusPanel({ isAccount }: { isAccount: boolean }) {
  const { data: records, loading } = useRecordsState();
  const { notify } = useFeedback();
  const [persistent, setPersistent] = useState('尚未申请');
  const [usage, setUsage] = useState('');

  useEffect(() => {
    let active = true;
    if (navigator.storage) {
      navigator.storage
        .persisted?.()
        .then((granted) => {
          if (active) setPersistent(granted ? '已获得持久化存储' : '当前为尽力保留存储');
        })
        .catch(() => {
          if (active) setPersistent('无法读取浏览器存储状态');
        });
      navigator.storage
        .estimate?.()
        .then((estimate) => {
          if (active) setUsage(`约 ${((estimate.usage ?? 0) / 1024 / 1024).toFixed(2)} MB`);
        })
        .catch(() => {
          if (active) setUsage('无法读取存储用量');
        });
    }
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card>
      <SectionTitle title="数据保存位置" />
      <div className="storage-status">
        <span>
          <HardDrive size={26} />
        </span>
        <div>
          <strong>此设备 · 浏览器 IndexedDB</strong>
          <p>{location.origin}</p>
          <Tag color="green">
            {isAccount ? '当前账号空间' : '本地游客空间'} ·{' '}
            {loading ? '正在读取记录…' : `${records.length} 条可见记录`}
          </Tag>
        </div>
      </div>
      <p className="small muted">
        浏览器按网址来源隔离数据库。不同域名、端口、协议和设备不会共享这份本地记录。
      </p>
      <div className="settings-row">
        <span>存储策略</span>
        <strong>{persistent}</strong>
      </div>
      <div className="settings-row">
        <span>本站浏览器总存储估算</span>
        <strong>{usage || '浏览器未提供'}</strong>
      </div>
      <button
        className="button secondary"
        onClick={async () => {
          if (!navigator.storage?.persist) {
            notify('当前浏览器不支持申请持久化存储。');
            return;
          }
          try {
            const granted = await navigator.storage.persist();
            setPersistent(granted ? '已获得持久化存储' : '浏览器未授予持久化存储');
            notify(
              granted
                ? '持久化存储已获准，仍请独立备份。'
                : '浏览器未授予持久化存储，请定期导出备份。',
            );
          } catch {
            notify('存储申请失败，请检查浏览器设置。', true);
          }
        }}
      >
        <ShieldCheck size={16} />
        申请持久化存储
      </button>
    </Card>
  );
}
