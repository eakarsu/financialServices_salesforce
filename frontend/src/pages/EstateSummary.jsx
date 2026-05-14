import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function EstateSummary() {
  return (
    <AiToolPage
      title="Estate Summary"
      intro="Identify gaps in titling, beneficiaries and estate documents (not legal advice)."
      endpoint="estate-summary"
      fields={[
        { name: 'state', label: 'State of residence', type: 'text', placeholder: 'e.g. CA' },
        { name: 'net_worth', label: 'Net worth ($)', type: 'number', placeholder: 'e.g. 3500000' },
        { name: 'documents_on_file', label: 'Documents on file (list)', type: 'textarea', placeholder: '["will","RLT","POA"]' },
        { name: 'asset_titling', label: 'Asset titling summary (JSON)', type: 'textarea', placeholder: '{"home":"JTWROS","brokerage":"individual"}' },
        { name: 'beneficiary_designations', label: 'Beneficiary designations (JSON)', type: 'textarea', placeholder: '{"401k":"spouse","IRA":"trust"}' },
      ]}
    />
  );
}
