import React, { Component } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "./components/home";
import GodotContainer from "./godot/container";
import './App.css';

class ErrorBoundary extends Component {
  state = { error: null, errorInfo: null };

  componentDidCatch(error, errorInfo) {
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
          <Route path="/play" element={<GodotContainer />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;