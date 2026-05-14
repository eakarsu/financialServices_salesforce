import React from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { TOOLS } from './tools.js';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import PortfolioAnalysis from './pages/PortfolioAnalysis.jsx';
import TaxLossHarvest from './pages/TaxLossHarvest.jsx';
import RiskProfile from './pages/RiskProfile.jsx';
import RetirementProjection from './pages/RetirementProjection.jsx';
import ComplianceCheck from './pages/ComplianceCheck.jsx';
import ClientMeetingPrep from './pages/ClientMeetingPrep.jsx';
import InsuranceNeedsAnalysis from './pages/InsuranceNeedsAnalysis.jsx';
import EstateSummary from './pages/EstateSummary.jsx';
import LeadScoring from './pages/LeadScoring.jsx';
import MarketCommentary from './pages/MarketCommentary.jsx';

function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  function onLogout() { logout(); nav('/'); }
  return (
    <nav className="sidebar">
      <h1>Financial Services AI</h1>
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink>
      <div style={{ marginTop: 12, fontSize: '0.75rem', textTransform: 'uppercase', color: '#9ca3af' }}>AI Tools</div>
      {TOOLS.map((t) => (
        <NavLink key={t.path} to={t.path} className={({ isActive }) => isActive ? 'active' : ''}>
          {t.title}
        </NavLink>
      ))}
      <div className="user-box">
        <div>Signed in as</div>
        <div><strong>{user?.name || user?.email}</strong></div>
        <button onClick={onLogout}>Sign out</button>
      </div>
    </nav>
  );
}

function ProtectedShell({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  return (
    <div className="app">
      <Sidebar />
      <div className="main">{children}</div>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<ProtectedShell><Home /></ProtectedShell>} />
      <Route path="/tools/portfolio-analysis" element={<ProtectedShell><PortfolioAnalysis /></ProtectedShell>} />
      <Route path="/tools/tax-loss-harvest" element={<ProtectedShell><TaxLossHarvest /></ProtectedShell>} />
      <Route path="/tools/risk-profile" element={<ProtectedShell><RiskProfile /></ProtectedShell>} />
      <Route path="/tools/retirement-projection" element={<ProtectedShell><RetirementProjection /></ProtectedShell>} />
      <Route path="/tools/compliance-check" element={<ProtectedShell><ComplianceCheck /></ProtectedShell>} />
      <Route path="/tools/client-meeting-prep" element={<ProtectedShell><ClientMeetingPrep /></ProtectedShell>} />
      <Route path="/tools/insurance-needs-analysis" element={<ProtectedShell><InsuranceNeedsAnalysis /></ProtectedShell>} />
      <Route path="/tools/estate-summary" element={<ProtectedShell><EstateSummary /></ProtectedShell>} />
      <Route path="/tools/lead-scoring" element={<ProtectedShell><LeadScoring /></ProtectedShell>} />
      <Route path="/tools/market-commentary" element={<ProtectedShell><MarketCommentary /></ProtectedShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
