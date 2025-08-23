const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const cronManager = require('./services/cronManager');

const app = express();

// Connect to MongoDB
connectDB();

// Import routes
const currencyRoutes = require('./routes/currencyRoutes');
const goldRoutes = require('./routes/goldRoutes');
const alertRoutes = require('./routes/alertRoutes');

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Gold & Currency Tracker API',
    version: '1.0.0',
    endpoints: {
      gold: {
        prices: '/api/gold/prices',
        priceByCountry: '/api/gold/price/:country',
        history: '/api/gold/history/:country'
      },
      currency: {
        rates: '/api/currency/rates',
        specificRate: '/api/currency/rate/:from/:to',
        history: '/api/currency/history/:from/:to'
      },
      alerts: {
        register: '/api/alerts/register',
        settings: '/api/alerts/settings/:userId',
        getAlerts: '/api/alerts/:userId'
      }
    }
  });
});

// API Routes
app.use('/api/currency', currencyRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/alerts', alertRoutes);

// Add history endpoints to goldRoutes.js
const GoldPrice = require('./models/GoldPrice');
const CurrencyRate = require('./models/CurrencyRate');

// Gold history endpoint
app.get('/api/gold/history/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const { limit = 24 } = req.query; // Default last 24 records
    
    const history = await GoldPrice.find({ country })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Currency history endpoint
app.get('/api/currency/history/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { limit = 24 } = req.query;
    
    const history = await CurrencyRate.find({ 
      fromCurrency: from, 
      toCurrency: to 
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: 'Connected',
    timestamp: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Test it at: http://localhost:${PORT}`);
  
  // Start cron jobs after server starts
  cronManager.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  cronManager.stop();
  process.exit(0);
});