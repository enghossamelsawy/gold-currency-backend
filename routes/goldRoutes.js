const express = require('express');
const router = express.Router();
const goldService = require('../services/goldService');

// Get gold price for specific country
router.get('/price/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const data = await goldService.getGoldPrice(country);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all gold prices
router.get('/prices', async (req, res) => {
  try {
    const data = await goldService.getAllGoldPrices();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;