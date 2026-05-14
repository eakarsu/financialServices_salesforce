import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function MarketCommentary() {
  return (
    <AiToolPage
      title="Market Commentary"
      intro="Compliant client-ready market commentary with required disclosures."
      endpoint="market-commentary"
      fields={[
        { name: 'period', label: 'Period', type: 'text', placeholder: 'e.g. Q1 2026', default: 'last quarter' },
        { name: 'themes', label: 'Themes to cover (JSON or comma list)', type: 'textarea', placeholder: '["AI capex","rate path","credit spreads"]' },
        { name: 'audience', label: 'Audience', type: 'text', placeholder: 'retail / HNW / institutional', default: 'retail clients' },
      ]}
    />
  );
}
