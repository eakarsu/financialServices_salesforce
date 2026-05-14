import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function RetirementProjection() {
  return (
    <AiToolPage
      title="Retirement Projection"
      intro="Monte-Carlo style retirement narrative with probability of success."
      endpoint="retirement-projection"
      fields={[
        { name: 'current_age', label: 'Current age', type: 'number', placeholder: 'e.g. 40' },
        { name: 'retirement_age', label: 'Target retirement age', type: 'number', placeholder: 'e.g. 65' },
        { name: 'current_savings', label: 'Current savings ($)', type: 'number', placeholder: 'e.g. 220000' },
        { name: 'annual_contribution', label: 'Annual contribution ($)', type: 'number', placeholder: 'e.g. 22500' },
        { name: 'target_income', label: 'Target retirement income ($/yr)', type: 'number', placeholder: 'e.g. 90000' },
      ]}
    />
  );
}
