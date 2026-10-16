import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { FeedbackProvider } from './app/context';
import App from './app/App';
import './styles/index.css';
import { CloudProvider, useCloud } from './cloud/context';
import { SyncProvider } from './app/SyncProvider';

function IdentityBoundary() {
  const { scope, ready } = useCloud();
  if (!ready) return <main className="fatal"><h1>正在打开你的成长空间…</h1><p>正在恢复此设备的本机数据与账号状态。</p></main>;
  // A new identity gets new component state, editor drafts, subscriptions and feedback.
  return <FeedbackProvider key={scope}><SyncProvider><App /></SyncProvider></FeedbackProvider>;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>暂时无法打开实验室</h1>
        <p>请刷新重试。已写入本机的记录仍在浏览器数据库中，请不要清除网站数据。</p>
        <button onClick={() => location.reload()}>刷新页面</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <CloudProvider><IdentityBoundary /></CloudProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
