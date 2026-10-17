import { Component, type ReactNode } from 'react';

/** Data reads may fail after startup; keep that failure visible instead of showing empty records. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    return this.state.error ? (
      <main className="fatal" role="alert">
        <h1>暂时无法打开实验室</h1>
        <p>请刷新重试。已写入本机的记录仍在浏览器数据库中，请不要清除网站数据。</p>
        <button onClick={() => location.reload()}>刷新页面</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
