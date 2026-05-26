import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="shell">
          <section className="appError">
            <p className="eyebrow">Runtime Error</p>
            <h1>游戏启动失败</h1>
            <p>{this.state.error.message}</p>
            <button className="toolButton" onClick={() => {
              localStorage.removeItem("netspire-save");
              window.location.reload();
            }}>
              清空旧存档并重载
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
