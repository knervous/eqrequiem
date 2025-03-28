// App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "./components/home";
import GodotContainer from "./godot/container";
import './App.css';

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Home />} />
        <Route path="/play" element={<GodotContainer />} />
      </Routes>
    </Router>
  );
}

export default App;
