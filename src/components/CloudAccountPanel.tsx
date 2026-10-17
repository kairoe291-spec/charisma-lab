import { useState } from 'react';
import { Cloud, LogOut, RefreshCw } from 'lucide-react';
import { useCloud } from '../cloud/context';
import { requestCloudDeletion } from '../cloud/transport';
import { useSync } from '../app/SyncProvider';
import { useFeedback } from '../app/context';
import { flushAllSaves } from '../app/saveCoordinator';
import { useDataManagementService } from '../hooks/useFeatureServices';
import { downloadFile, today } from '../utils/files';
import { Card, Dialog, SectionTitle, Tag } from './ui';
import { GuestMigration } from './GuestMigration';

export function CloudAccountPanel() {
  const cloud = useCloud();
  const sync = useSync();
  const dataService = useDataManagementService();
  const { perform, notify } = useFeedback();
  const [url, setUrl] = useState(cloud.config?.url ?? '');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [configure, setConfigure] = useState(!cloud.configured);
  const [migration, setMigration] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  async function action(task: () => Promise<unknown>, message: string, flushBefore = false) {
    setBusy(true);
    try {
      if (flushBefore && !(await flushAllSaves())) {
        notify('请先重试保存尚未提交的编辑。', true);
        return false;
      }
      return await perform(task, message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="cloud-account">
      <SectionTitle title="云端账户与同步" />
      {!cloud.user ? (
        <>
          <div className="cloud-summary">
            <Cloud size={28} />
            <div>
              <h3>{cloud.configured ? '可选登录，同步你的成长记录' : '当前为完整本地模式'}</h3>
              <p>
                {cloud.configured
                  ? '登录后使用独立账号空间。游客数据由你决定是否合并。'
                  : '尚未配置 Supabase。学习与记录继续保存在本机。'}
              </p>
            </div>
          </div>
          <button className="text-button" onClick={() => setConfigure(!configure)}>
            {configure ? '收起项目配置' : '配置 / 更换 Supabase 项目'}
          </button>
          {configure && (
            <form
              className="cloud-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!(await flushAllSaves())) {
                  notify('请先完成本机保存。', true);
                  return;
                }
                if (
                  await action(
                    () => cloud.configure({ url, publishableKey: key }),
                    '公开配置已保存到此设备；请确认数据库迁移和邮件模板已配置。',
                  )
                )
                  setConfigure(false);
              }}
            >
              <label>
                Supabase Project URL
                <input
                  aria-label="Supabase Project URL"
                  type="url"
                  required
                  placeholder="https://你的项目.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Publishable / anon 公开密钥
                <input
                  aria-label="Supabase 公开密钥"
                  type="password"
                  autoComplete="off"
                  required
                  placeholder="sb_publishable_…"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <p className="small muted">
                只接受公开密钥。请先按 README 执行数据库迁移，并把 Supabase
                邮件模板设置为验证码。配置保存在此浏览器，不上传到成长记录。
              </p>
              <button className="button secondary" disabled={busy}>
                保存公开配置
              </button>
            </form>
          )}
          {cloud.configured && (
            <form
              className="cloud-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!(await flushAllSaves())) {
                  notify('请先完成本机保存。', true);
                  return;
                }
                if (sent)
                  await action(
                    () => cloud.verifyOtp(email, token.trim()),
                    '登录成功，正在打开账号空间。',
                  );
                else if (
                  await action(
                    () => cloud.sendOtp(email.trim()),
                    '验证码已请求发送，请查收邮箱；若收到链接，请先调整 Supabase 邮件模板。',
                  )
                )
                  setSent(true);
              }}
            >
              <label>
                登录邮箱
                <input
                  type="email"
                  aria-label="登录邮箱"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSent(false);
                  }}
                />
              </label>
              {sent && (
                <label>
                  邮箱验证码
                  <input
                    aria-label="邮箱验证码"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
              )}
              <div className="cloud-actions">
                <button className="button" disabled={busy || !navigator.onLine}>
                  {busy ? '正在处理…' : sent ? '验证并登录' : '发送邮箱验证码'}
                </button>
                {sent && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setSent(false)}
                  >
                    重新发送验证码
                  </button>
                )}
              </div>
              {!navigator.onLine && (
                <p className="small muted">离线时无法验证新登录；当前本机数据可继续使用。</p>
              )}
            </form>
          )}
        </>
      ) : (
        <>
          <div className="cloud-summary">
            <Cloud size={28} />
            <div>
              <h3>{cloud.user.email ?? '已登录账号'}</h3>
              <p>本机独立账号空间 · 云服务 {new URL(cloud.config!.url).hostname}</p>
              <Tag>
                {cloud.authorization === 'verified' ? '会话已验证' : '使用已缓存会话，联网后验证'}
              </Tag>
            </div>
          </div>
          <div className="settings-row">
            <span>等待同步</span>
            <strong>{sync.pending} 项修改</strong>
          </div>
          <div className="settings-row">
            <span>最后完整同步</span>
            <strong>
              {sync.lastSuccessAt
                ? new Date(sync.lastSuccessAt).toLocaleString('zh-CN')
                : '尚无成功记录'}
            </strong>
          </div>
          {!!sync.conflicts && (
            <p className="cloud-error">发现 {sync.conflicts} 份不同版本，请在下方对比处理。</p>
          )}
          {sync.error && (
            <p role="alert" className="cloud-error">
              同步遇到问题，本地数据仍然保留：{sync.error}
            </p>
          )}
          {sync.authRequired && (
            <p className="small muted">会话需要重新验证。请先保存编辑，再退出并重新登录。</p>
          )}
          <div className="cloud-actions">
            <button
              className="button"
              disabled={busy || sync.running}
              onClick={() =>
                void action(
                  () => sync.runSync({ skipFlush: true }),
                  sync.conflicts ? '同步检查完成，请处理不同版本。' : '同步检查完成。',
                  true,
                )
              }
            >
              <RefreshCw size={16} />
              {sync.running ? '正在同步…' : '立即同步 / 重试'}
            </button>
            <button className="button secondary" onClick={() => setMigration(true)}>
              管理游客迁移
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(() => cloud.signOut(), '已退出，账号的本机记录保留在独立空间。', true)
              }
            >
              <LogOut size={16} />
              退出账号
            </button>
          </div>
          <button
            className="text-button cloud-delete"
            onClick={() => {
              setDeleting(true);
              setConfirmText('');
              setDownloaded(false);
            }}
          >
            申请删除云端成长记录
          </button>
        </>
      )}
      {cloud.error && (
        <p role="alert" className="cloud-error">
          {cloud.error}
        </p>
      )}
      <p className="small muted">
        云同步只会在项目配置、数据库迁移、网络和会话均正常时工作。私人记录仅限账号本人访问；RLS
        不等同于端到端加密。
      </p>
      {migration && <GuestMigration manual onClose={() => setMigration(false)} />}
      {deleting && (
        <Dialog
          title="确认删除云端成长记录"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <p>
            将当前账号云端已有的成长记录标记为删除，并传播至其他设备。为防止离线旧设备恢复内容，服务端保留删除标记与幂等凭证。
          </p>
          <p>
            这是同步软删除，不是 Supabase
            账号注销或管理员级物理擦除。尚未同步的本机修改会保留并可能形成冲突；需要彻底删除时请按
            README 联系项目管理员。
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void action(
                async () => {
                  const backup = await dataService.exportBackup();
                  downloadFile(`云端删除前备份-${today()}.json`, JSON.stringify(backup, null, 2));
                  setDownloaded(true);
                },
                '备份已生成，请保存到独立位置。',
                true,
              )
            }
          >
            先下载本机备份
          </button>
          <label>
            输入「删除云端记录」确认
            <input
              aria-label="云端删除确认文字"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </label>
          <button
            className="button danger-button"
            disabled={busy || !downloaded || confirmText !== '删除云端记录'}
            onClick={() =>
              void action(
                async () => {
                  if (!cloud.client || !cloud.user) throw new Error('请先登录。');
                  // Drain acknowledged local work before issuing the explicitly confirmed deletion.
                  await sync.runSync({ skipFlush: true });
                  await requestCloudDeletion(cloud.client, cloud.user.id);
                  setDeleting(false);
                  await sync.runSync({ skipFlush: true });
                },
                '云端删除已提交；请检查同步结果及可能的冲突。',
                true,
              )
            }
          >
            确认删除云端记录
          </button>
        </Dialog>
      )}
    </Card>
  );
}
