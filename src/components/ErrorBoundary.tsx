import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Catches render errors so a bug in one screen shows a recovery page instead of a blank screen. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F5F1E8' }}>
        <h1 className="text-2xl mb-2" style={{ color: '#151515', fontFamily: 'DM Serif Display, serif' }}>
          Something went wrong
        </h1>
        <p className="text-sm mb-6" style={{ color: '#68645F', fontFamily: 'Inter' }}>
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: '#7A263A', color: '#FFFDF9', fontFamily: 'DM Sans' }}
        >
          Reload
        </button>
      </div>
    );
  }
}
