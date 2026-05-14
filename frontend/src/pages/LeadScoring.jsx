import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function LeadScoring() {
  return (
    <AiToolPage
      title="Lead Scoring"
      intro="Score a Salesforce lead 0-100 with a recommended next action."
      endpoint="lead-scoring"
      fields={[
        { name: 'lead', label: 'Lead profile (JSON)', type: 'textarea', rows: 10, placeholder: '{"name":"...","company":"...","investable_assets":1500000,"source":"referral","notes":"..."}' },
      ]}
    />
  );
}
