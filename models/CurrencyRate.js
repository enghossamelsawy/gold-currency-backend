const mongoose = require('mongoose');

const currencyRateSchema = new mongoose.Schema({
  fromCurrency: {
    type: String,
    required: true,
    index: true
  },
  toCurrency: {
    type: String,
    required: true,
    index: true
  },
  rate: {
    type: Number,
    required: true
  },
  previousRate: {
    type: Number,
    default: null
  },
  rateChange: {
    type: Number,
    default: 0
  },
  percentageChange: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index for currency pairs
currencyRateSchema.index({ fromCurrency: 1, toCurrency: 1, timestamp: -1 });

module.exports = mongoose.model('CurrencyRate', currencyRateSchema);