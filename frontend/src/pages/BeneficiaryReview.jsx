import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

export default function BeneficiaryReview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/api/beneficiary-review')
      .then(setData)
      .catch(() => setData({ error: 'Unable to load beneficiary review.' }));
  }, []);

  if (!data) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h2>Beneficiary Review</h2>
      <p className="muted">Household-level review of stale designations, missing contingents, and estate-plan mismatches.</p>
      <div className="grid">
        <div className="card"><strong>{data.summary?.householdsReviewed}</strong><span>Households Reviewed</span></div>
        <div className="card"><strong>{data.summary?.staleDesignations}</strong><span>Stale Designations</span></div>
        <div className="card"><strong>{data.summary?.missingContingents}</strong><span>Missing Contingents</span></div>
        <div className="card"><strong>{data.summary?.estateRisk}</strong><span>Estate Risk</span></div>
      </div>
      <div className="card">
        <h3>Households</h3>
        {data.households?.map((household) => (
          <div key={household.name} className="result-box" style={{ marginBottom: 12 }}>
            <strong>{household.name}</strong>
            <div>{household.issue}</div>
            <div className="muted">Priority: {household.priority}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Advisor Actions</h3>
        <ul>{data.advisorActions?.map((action) => <li key={action}>{action}</li>)}</ul>
      </div>
    </div>
  );
}
