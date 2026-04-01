import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  resetKey: number;
  autoRecoveredCount: number;
};

const isRecoverableDomMutationError = (error: unknown) => {
  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as any).name || "")
      : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as any).message || "")
      : String(error || "");
  const haystack = `${name} ${message}`.toLowerCase();

  return (
    haystack.includes("notfounderror") ||
    haystack.includes("removechild") ||
    haystack.includes("insertbefore") ||
    haystack.includes("node to be removed is not a child") ||
    haystack.includes("удаляемый узел не является дочерним")
  );
};

export class AppErrorBoundary extends React.Component<Props, State> {
  private recoveryTimer: number | null = null;

  state: State = {
    error: null,
    resetKey: 0,
    autoRecoveredCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("AppErrorBoundary caught error:", error);

    if (
      isRecoverableDomMutationError(error) &&
      this.state.autoRecoveredCount < 1 &&
      this.recoveryTimer === null
    ) {
      this.recoveryTimer = window.setTimeout(() => {
        this.recoveryTimer = null;
        this.setState((prev) => ({
          error: null,
          resetKey: prev.resetKey + 1,
          autoRecoveredCount: prev.autoRecoveredCount + 1,
        }));
      }, 0);
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer !== null) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, resetKey, autoRecoveredCount } = this.state;

    if (error) {
      if (isRecoverableDomMutationError(error) && autoRecoveredCount < 1) {
        return (
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface, #0b1220)",
              color: "var(--text, #fff)",
              padding: "24px",
              textAlign: "center",
            }}
          >
            Recovering interface...
          </div>
        );
      }

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface, #0b1220)",
            color: "var(--text, #fff)",
            padding: "24px",
          }}
        >
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <h2 style={{ marginBottom: 12 }}>Panel error</h2>
            <p style={{ marginBottom: 16 }}>
              The interface hit a browser DOM sync error and could not recover automatically.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(59, 129, 246, 0.18)",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              Reload panel
            </button>
          </div>
        </div>
      );
    }

    return <React.Fragment key={resetKey}>{this.props.children}</React.Fragment>;
  }
}

export default AppErrorBoundary;
