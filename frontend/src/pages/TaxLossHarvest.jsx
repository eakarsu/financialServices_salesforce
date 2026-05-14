import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function TaxLossHarvest() {
  return (
    <AiToolPage
      title="Tax-Loss Harvesting"
      intro="Identify wash-sale-safe loss harvesting opportunities and replacement securities."
      endpoint="tax-loss-harvest"
      fields={[
        { name: 'holdings', label: 'Holdings with cost basis (JSON)', type: 'textarea', placeholder: '[{"ticker":"AAPL","cost":180,"price":150,"qty":100}, ...]' },
        { name: 'year_to_date_gains', label: 'Realized YTD gains ($)', type: 'number', placeholder: 'e.g. 25000' },
        { name: 'account_type', label: 'Account type', type: 'text', placeholder: 'taxable / IRA / 401k', default: 'taxable' },
      ]}
    />
  );
}
