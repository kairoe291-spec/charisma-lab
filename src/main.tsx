import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { FeedbackProvider } from './app/context';
import App from './app/App';
import './styles/index.css';
import { CloudProvider, useCloud } from './cloud/context';
import { SyncProvider } from './app/SyncProvider';
import { ErrorBoundary } from './app/ErrorBoundary';

function IdentityBoundary() {
  const { scope, ready } = useCloud();
  if (!ready)
    return (
      <main className="fatal">
        <h1>正在打开你的成长空间…</h1>
        <p>正在恢复此设备的本机数据与账号状态。</p>
      </main>
    );
  // A new identity gets new component state, editor drafts, subscriptions and feedback.
  return (
    <FeedbackProvider key={scope}>
      <SyncProvider>
        <App />
      </SyncProvider>
    </FeedbackProvider>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <CloudProvider>
          <IdentityBoundary />
        </CloudProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
