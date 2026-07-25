import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "./components/home";
import './App.css';

const GameContainer = lazy(() => import("@/Core/container"));

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    if (!import.meta.env.VITE_LOCAL_DEV) {
      console.error('Error caught:', error, errorInfo);
    }
  }

  render() {
    if (this.state.errorInfo && import.meta.env.VITE_LOCAL_DEV) {
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Home />} />
          <Route
            path="/play"
            element={
              <Suspense fallback={null}>
                <GameContainer />
              </Suspense>
            }
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
