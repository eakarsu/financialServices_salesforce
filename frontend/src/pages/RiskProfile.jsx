import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function RiskProfile() {
  return (
    <AiToolPage
      title="Risk Profile"
      intro="Derive a 0-100 risk score and IPS narrative from KYC inputs."
      endpoint="risk-profile"
      fields={[
        { name: 'age', label: 'Age', type: 'number', placeholder: 'e.g. 45' },
        { name: 'income', label: 'Annual income ($)', type: 'number', placeholder: 'e.g. 180000' },
        { name: 'net_worth', label: 'Net worth ($)', type: 'number', placeholder: 'e.g. 750000' },
        { name: 'dependents', label: 'Dependents', type: 'number', placeholder: 'e.g. 2' },
        { name: 'time_horizon', label: 'Time horizon', type: 'text', placeholder: 'e.g. 20y' },
        { name: 'questionnaire', label: 'Questionnaire answers (JSON)', type: 'textarea', placeholder: '{"reaction_to_drawdown":"hold","liquidity_needs":"low"}' },
      ]}
    />
  );
}
