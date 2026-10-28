import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('React ErrorBoundary caught:', error?.message || error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-bold text-amber-400">GOBINGO</h1>
          <p className="text-red-300">Something went wrong. Please refresh and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-amber-500 px-4 py-2 font-bold text-slate-900"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
