const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, (_req, res) => {
  res.json({
    feature: 'Beneficiary Review',
    summary: { householdsReviewed: 18, staleDesignations: 5, missingContingents: 3, estateRisk: 'Moderate' },
    households: [
      { name: 'Garcia Household', issue: 'IRA beneficiary older than five years', priority: 'High' },
      { name: 'Patel Household', issue: 'No contingent beneficiary on taxable TOD', priority: 'Medium' },
      { name: 'Morrison Trust', issue: 'Estate plan document date mismatch', priority: 'High' },
    ],
    advisorActions: [
      'Create FSC task for each stale or missing beneficiary designation.',
      'Cross-check retirement accounts against estate summary beneficiaries.',
      'Route high-priority households to advisor review before annual meeting.',
    ],
  });
});

module.exports = router;
