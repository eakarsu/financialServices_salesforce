import React from 'react';
import AiToolPage from '../AiToolPage.jsx';

export default function ClientMeetingPrep() {
  return (
    <AiToolPage
      title="Client Meeting Prep"
      intro="Generate prep notes, agenda and discovery questions for an annual review."
      endpoint="client-meeting-prep"
      fields={[
        { name: 'client_name', label: 'Client name', type: 'text', placeholder: 'e.g. Jane Smith' },
        { name: 'last_meeting_notes', label: 'Last meeting notes', type: 'textarea', placeholder: 'Key topics discussed last review...' },
        { name: 'recent_activity', label: 'Recent account activity', type: 'textarea', placeholder: 'Contributions, withdrawals, trades, alerts...' },
        { name: 'life_events', label: 'Life events on record', type: 'text', placeholder: 'e.g. new grandchild, recent retirement' },
        { name: 'market_conditions', label: 'Current market conditions', type: 'text', placeholder: 'e.g. rate-cut cycle, volatile equities' },
      ]}
    />
  );
}
