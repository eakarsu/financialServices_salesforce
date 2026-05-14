import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function PortfolioAnalysis() {
  return (
    <AiToolPage
      title="Portfolio Analysis"
      intro="CFA-style review of a client's holdings with rebalancing recommendations."
      endpoint="portfolio-analysis"
      fields={[
        { name: 'holdings', label: 'Holdings (JSON or list)', type: 'textarea', placeholder: '[{"ticker":"VTI","weight":0.4}, ...]' },
        { name: 'risk_tolerance', label: 'Risk tolerance', type: 'text', placeholder: 'conservative / moderate / aggressive', default: 'moderate' },
        { name: 'investment_horizon', label: 'Investment horizon', type: 'text', placeholder: 'e.g. 10y', default: '10y' },
        { name: 'client_age', label: 'Client age', type: 'number', placeholder: 'e.g. 52' },
      ]}
    />
  );
}
