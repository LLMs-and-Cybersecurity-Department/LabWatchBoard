import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Rendering switches to the recovery screen; production telemetry can be attached here.
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <div>
          <strong>气象看板发生运行错误</strong>
          <p>当前页面状态可能已失效。重新载入后会从本机保存的观测点和偏好设置恢复。</p>
          <code>{this.state.error.message}</code>
          <button onClick={() => window.location.reload()}>重新载入看板</button>
        </div>
      </main>
    );
  }
}
