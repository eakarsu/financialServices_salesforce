import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function InsuranceNeedsAnalysis() {
  return (
    <AiToolPage
      title="Insurance Needs Analysis"
      intro="DIME / HLV life, disability and LTC coverage gap analysis."
      endpoint="insurance-needs-analysis"
      fields={[
        { name: 'household', label: 'Household (JSON)', type: 'textarea', placeholder: '{"adults":2,"kids":[8,12]}' },
        { name: 'income', label: 'Annual income ($)', type: 'number', placeholder: 'e.g. 220000' },
        { name: 'debts', label: 'Debts (JSON)', type: 'textarea', placeholder: '{"mortgage":420000,"student_loans":18000}' },
        { name: 'education_goals', label: 'Education goals', type: 'text', placeholder: 'e.g. fund 4-year private college x2' },
        { name: 'existing_coverage', label: 'Existing coverage (JSON)', type: 'textarea', placeholder: '{"term_life":500000,"disability":"60% income"}' },
      ]}
    />
  );
}
