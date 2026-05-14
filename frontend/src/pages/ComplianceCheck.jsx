import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function ComplianceCheck() {
  return (
    <AiToolPage
      title="Compliance Check"
      intro="FINRA / SEC review of advisor communications with regulation citations."
      endpoint="compliance-check"
      fields={[
        { name: 'communication_text', label: 'Communication text', type: 'textarea', rows: 8, placeholder: 'Paste the advisor email, social post or marketing copy...' },
        { name: 'channel', label: 'Channel', type: 'text', placeholder: 'email / social / website / print', default: 'email' },
        { name: 'audience', label: 'Audience', type: 'text', placeholder: 'retail / institutional / accredited', default: 'retail client' },
      ]}
    />
  );
}
