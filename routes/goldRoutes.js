// routes/goldRoutes.js
// This is the COMPLETE goldRoutes.js file - replace your entire file with this

const express = require('express');
const router = express.Router();
const goldService = require('../services/goldService');

// Get single gold price for specific country (24k base price)
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

// NEW ENDPOINT: Get all karat prices for a country (THIS IS WHAT YOUR APP NEEDS!)
router.get('/karat-prices/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const data = await goldService.getAllKaratPrices(country);
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all karat prices for Egypt (shortcut endpoint)
router.get('/egypt/all-karats', async (req, res) => {
  try {
    const data = await goldService.getAllKaratPrices('egypt');
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all gold prices (base prices for multiple countries)
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

// Get silver price for specific country
router.get('/silver/price/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const data = await goldService.getSilverPrice(country);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all silver prices
router.get('/silver/prices', async (req, res) => {
  try {
    const data = await goldService.getAllSilverPrices();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Force refresh cache
router.post('/refresh-cache', async (req, res) => {
  try {
    goldService.clearCache();
    const data = await goldService.getAllKaratPrices('egypt');
    res.json({ 
      success: true, 
      message: 'Cache cleared and prices refreshed',
      data 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;