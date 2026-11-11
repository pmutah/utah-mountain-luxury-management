import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: string | null };

/** One tab crashing should not blank the rest of the dashboard. */
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || 'This tab hit a problem.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.log(JSON.stringify({ t: new Date().toISOString(), event: 'tab-error', message: error.message, component: info.componentStack?.slice(0, 200) }));
  }

  render() {
    if (this.state.error) {
      return (
        <div className="uml-panel rounded-3xl p-6" data-bot="tab-error">
          <p className="uml-kicker">This tab</p>
          <p className="mt-2 text-sm">Something on this tab failed to draw. The books were not changed.</p>
          <button type="button" className="uml-nav mt-4" data-bot="tab-error-retry" onClick={() => this.setState({ error: null })}>
            Try this tab again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
