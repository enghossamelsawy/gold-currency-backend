const mongoose = require('mongoose');

const goldPriceSchema = new mongoose.Schema({
  country: {
    type: String,
    required: true,
    index: true
  },
  pricePerGram: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  previousPrice: {
    type: Number,
    default: null
  },
  priceChange: {
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

// Keep only last 100 records per country
goldPriceSchema.index({ country: 1, timestamp: -1 });

module.exports = mongoose.model('GoldPrice', goldPriceSchema);