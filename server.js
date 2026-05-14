const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/salesforce-fsc', require('./routes/salesforceFSC')); app.use('/api/goal-planning', require('./routes/goalPlanning')); app.use('/api/tax-rebalancer', require('./routes/taxRebalancer')); app.use('/api/compliance-copilot', require('./routes/complianceCopilot')); app.use('/api/meeting-prep', require('./routes/meetingPrep'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'financialServices_salesforce', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.statusCode || 500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`financialServices_salesforce backend running on port ${PORT}`);
});
