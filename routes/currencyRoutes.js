const express = require('express');
const router = express.Router();
const currencyService = require('../services/currencyService');

// Get exchange rate between two currencies
router.get('/rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const data = await currencyService.getExchangeRate(from, to);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get multiple exchange rates
router.get('/rates', async (req, res) => {
  try {
    const data = await currencyService.getMultipleRates();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;