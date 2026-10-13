import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  LayoutDashboard,
  BookOpen,
  MessagesSquare,
  Dumbbell,
  ChartNoAxesCombined,
  NotebookPen,
  Palette,
  Settings,
  Search,
  Sprout,
  ChevronRight,
  Wifi,
  WifiOff,
  ShieldCheck,
  Menu,
  ArrowUpRight,
  CircleHelp,
} from 'lucide-react';
import { repository } from '../data/repository';
import { useRecords } from '../hooks/useRecords';
import { modules, lessons, scenarios } from '../content';
import { Onboarding } from './Onboarding';
import type { Profile, Progress, Journal } from './types';
import { useFeedback } from './context';
import Dashboard from '../pages/Dashboard';
import Academy from '../pages/Academy';
import LessonPage from '../pages/Lesson';
import TrainingPage from '../pages/Training';
import JournalPage from '../pages/Journal';
import ScenarioPage from '../pages/Scenarios';
import AssessmentPage from '../pages/Assessment';
import StudioPage from '../pages/Studio';
import SettingsPage from '../pages/Settings';
import {
  flushAllSaves,
  hasFailedSaves,
  hasUnsavedChanges,
  subscribeSaves,
} from './saveCoordinator';
const links = [
  { to: '/', text: '成长首页', icon: LayoutDashboard },
  { to: '/academy', text: '魅力学院', icon: BookOpen },
  { to: '/scenarios', text: '情景剧场', icon: MessagesSquare },
  { to: '/training', text: '日常训练', icon: Dumbbell },
  { to: '/assessment', text: '阶段测评', icon: ChartNoAxesCombined },
  { to: '/journal', text: '成长档案', icon: NotebookPen },
  { to: '/studio', text: '风格工作室', icon: Palette },
];
export default function App() {
  const profiles = useRecords('profile');
  const profile = profiles[0]?.payload as Profile | undefined;
  const progress = useRecords('courseProgress');
  const journals = useRecords('journalEntry');
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState(false);
  const [setup, setSetup] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState(0);
  const all = useRecords();
  const settings = useRecords('appSettings');
  useEffect(() => subscribeSaves(() => setSaveError(hasFailedSaves())), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    // Let current transactions finish before a link leaves an editor. A failed
    // save stays in memory and blocks navigation until the user retries it.
    const guard = (event: MouseEvent) => {
      if (!hasUnsavedChanges() || event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element).closest?.('a');
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
      const destination = new URL(anchor.href);
      if (destination.origin !== location.origin || !destination.hash.startsWith('#/')) return;
      event.preventDefault();
      event.stopPropagation();
      void flushAllSaves().then((saved) => {
        if (saved) navigate(destination.hash.slice(1));
        else notify('编辑内容尚未写入本机。请重试保存后再切换页面。', true);
      });
    };
    addEventListener('beforeunload', warn);
    document.addEventListener('click', guard, true);
    return () => {
      removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guard, true);
    };
  }, [navigate, notify]);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      notify('离线缓存未能注册，请在 HTTPS 或 localhost 的生产版本中重试。', true),
  });
  useEffect(() => {
    repository
      .list('profile')
      .then((items) => {
        if (!items.length) setSetup(true);
      })
      .catch(() => notify('无法访问本地数据库，请检查浏览器存储权限。', true));
  }, [notify]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    repository
      .countOutbox('guest')
      .then(setQueue)
      .catch(() => setQueue(0));
  }, [all]);
  useEffect(() => {
    document.documentElement.dataset.theme =
      (settings[0]?.payload as { theme: string } | undefined)?.theme ?? 'light';
  }, [settings]);
  const completed = lessons.filter(
    (lesson) =>
      (
        progress.find((record) => (record.payload as Progress).lessonId === lesson.id)?.payload as
          Progress | undefined
      )?.completed,
  ).length;
  const percent = Math.round((completed / lessons.length) * 100);
  const results = [
    ...lessons.map((l) => ({ label: l.title, meta: '正式课程', to: '/academy/' + l.id })),
    ...modules.map((m) => ({ label: m.title, meta: '能力目录', to: '/academy?module=' + m.id })),
    ...scenarios.map((s) => ({ label: s.title, meta: '场景练习', to: '/scenarios' })),
    ...journals.map((j) => ({
      label: (j.payload as Journal).title,
      meta: '私人日志',
      to: '/journal?entry=' + j.id,
    })),
  ]
    .filter((r) => r.label.includes(search))
    .slice(0, 7);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setMobile(false)}>
          <span className="brand-icon">
            <Sprout size={23} />
          </span>
          <div>
            Charisma Lab<span>个人魅力成长实验室</span>
          </div>
        </Link>
        <div className="nav-label">我的成长空间</div>
        <nav>
          {links.map(({ to, text, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobile(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={19} />
              <span>{text}</span>
              {to === '/academy' && <small>12</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-plan">
          <span className="small">慢慢来，也是一种前进。</span>
          <h3>你的 90 天成长计划</h3>
          <p>从认识自己，到成为自己。</p>
          <Link to="/assessment">
            查看我的计划 <ArrowUpRight size={15} />
          </Link>
        </div>
        <NavLink className="settings-link" to="/settings" onClick={() => setMobile(false)}>
          <Settings size={18} />
          数据与同步设置
        </NavLink>
        <button
          className="sidebar-user"
          onClick={() => {
            setSetup(true);
            setMobile(false);
          }}
        >
          <div className="avatar">{profile?.name.slice(0, 1) ?? '我'}</div>
          <div>
            <strong>{profile?.name ?? '成长探索者'}</strong>
            <span>本地游客 · 私人空间</span>
          </div>
          <ChevronRight size={16} />
        </button>
      </aside>
      {mobile && (
        <button className="menu-backdrop" aria-label="关闭菜单" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" aria-label="打开导航" onClick={() => setMobile(true)}>
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            我的实验室 <ChevronRight size={13} />
            <span>持续成长的每一天</span>
          </div>
          <div className="search-wrap">
            <Search size={17} />
            <input
              aria-label="全局搜索"
              placeholder="搜索课程、场景、日志…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div className="search-results">
                {results.length ? (
                  results.map((r, i) => (
                    <Link key={i} to={r.to} onClick={() => setSearch('')}>
                      {r.label}
                      <small>{r.meta}</small>
                    </Link>
                  ))
                ) : (
                  <p>没有找到匹配内容</p>
                )}
              </div>
            )}
          </div>
          <div className="top-status">
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span>{online ? '在线' : '离线'}</span>
          </div>
          <Link to="/settings" className="status-private" title="查看数据保存位置">
            <ShieldCheck size={17} />
            <span>本地模式</span>
          </Link>
          <button className="top-avatar" onClick={() => setSetup(true)} aria-label="编辑我的计划">
            {profile?.name.slice(0, 1) ?? '我'}
          </button>
        </header>
        <div className="status-strip">
          <span>
            <i className="status-dot" /> IndexedDB 本机存储 · {queue} 项本地变更
          </span>
          <span>
            云同步未启用 · 最后同步：无{' '}
            <Link to="/settings">
              <CircleHelp size={13} />
            </Link>
          </span>
        </div>
        {saveError && (
          <div className="notice" role="alert">
            有编辑尚未保存到本机。失败的修改仍在当前窗口中，请先重试。
            <button
              onClick={() =>
                void flushAllSaves().then((saved) =>
                  notify(
                    saved ? '所有编辑已保存到本机' : '保存仍未成功，请检查浏览器存储空间。',
                    !saved,
                  ),
                )
              }
            >
              重试保存
            </button>
          </div>
        )}
        {!online && (
          <div className="notice offline">
            <WifiOff size={16} />
            当前处于离线模式。你可以继续学习，已保存的记录保留在本机。
          </div>
        )}
        {offlineReady && <div className="offline-ready">应用资源已缓存，可以离线打开本应用。</div>}
        {needRefresh && (
          <div className="notice">
            有新版本可用。请先确认编辑内容已保存。
            <button
              onClick={() => {
                if (confirm('确认所有编辑已保存，立即更新应用？'))
                  void flushAllSaves().then((saved) => {
                    if (saved) void updateServiceWorker(true);
                    else notify('还有未保存的编辑，请先重试保存。', true);
                  });
              }}
            >
              更新应用
            </button>
          </div>
        )}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} percent={percent} />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/academy/:lessonId" element={<LessonPage />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/scenarios" element={<ScenarioPage />} />
            <Route path="/assessment" element={<AssessmentPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <div>
                  <h1>这个页面还不存在</h1>
                  <Link to="/">返回成长首页</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="footer">
          <span>
            CHARISMA LAB <b>·</b> 成为自己喜欢的样子
          </span>
          <span>
            P0 本地优先 <b>·</b> 不评价人格价值
          </span>
        </footer>
      </div>
      {setup && (
        <Onboarding initial={profile} id={profiles[0]?.id} onClose={() => setSetup(false)} />
      )}
      <div className="mobile-bottom">
        {links
          .filter((l) => ['/', '/academy', '/training', '/journal'].includes(l.to))
          .map(({ to, text, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={19} />
              <span>{text}</span>
            </NavLink>
          ))}
      </div>
    </div>
  );
}
