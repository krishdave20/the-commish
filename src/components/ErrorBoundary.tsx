import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Catches a page that throws while drawing, so one bad panel leaves the menu and the other pages working. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('page failed to draw', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <section className="card" role="alert" aria-labelledby="snag-title">
          <header>
            <div className="micro">this page hit a snag</div>
            <h1 id="snag-title">fumble</h1>
          </header>
          <p className="note neg-c">{this.state.error.message || 'something went wrong while drawing this page.'}</p>
          <p className="note">your league data is safe. try another page from the menu, or reload this one.</p>
          <div><button type="button" className="btn" onClick={() => this.setState({ error: null })}>try again</button></div>
        </section>
      </div>
    );
  }
}
