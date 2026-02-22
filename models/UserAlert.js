const mongoose = require('mongoose');

const userAlertSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  fcmToken: {
    type: String,
    required: true
  },
  alertType: {
    type: String,
    enum: ['gold_price', 'currency_rate', 'both'],
    default: 'both'
  },
  goldAlerts: [{
    country: String,
    threshold: Number,
    direction: {
      type: String,
      enum: ['above', 'below', 'any'],
      default: 'any'
    }
  }],
  currencyAlerts: [{
    fromCurrency: String,
    toCurrency: String,
    threshold: Number,
    direction: {
      type: String,
      enum: ['above', 'below', 'any'],
      default: 'any'
    }
  }],
  language: {
    type: String,
    enum: ['en', 'ar'],
    default: 'en'
  },
  notificationSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    minInterval: {
      type: Number,
      default: 300000 // 5 minutes in milliseconds
    },
    lastNotified: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('UserAlert', userAlertSchema);