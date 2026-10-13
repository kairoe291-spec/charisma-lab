import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { FeedbackProvider } from './app/context';
import App from './app/App';
import './styles/index.css';
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
        <FeedbackProvider>
          <App />
        </FeedbackProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
