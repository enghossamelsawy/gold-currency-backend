const admin = require('firebase-admin');
const UserAlert = require('../models/UserAlert');
const GoldPrice = require('../models/GoldPrice');
const CurrencyRate = require('../models/CurrencyRate');

// Initialize Firebase Admin
try {
  const serviceAccount = require('../firebase-admin.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.log('⚠️ Firebase Admin not initialized - notifications disabled');
}

class NotificationService {
  async sendNotification(fcmToken, title, body, data = {}) {
    if (!admin.apps.length) {
      console.log('Firebase not initialized - skipping notification');
      return;
    }
    
    try {
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          timestamp: new Date().toISOString()
        },
        token: fcmToken
      };
      
      const response = await admin.messaging().send(message);
      console.log('✅ Notification sent:', response);
      return response;
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      throw error;
    }
  }
  
  async checkAndSendAlerts() {
    console.log('🔔 Checking for alerts...');
    
    try {
      const alerts = await UserAlert.find({ 'notificationSettings.enabled': true });
      
      for (const alert of alerts) {
        // Check if enough time has passed since last notification
        if (alert.notificationSettings.lastNotified) {
          const timeSinceLastNotification = Date.now() - alert.notificationSettings.lastNotified;
          if (timeSinceLastNotification < alert.notificationSettings.minInterval) {
            continue;
          }
        }
        
        // Check gold price alerts
        for (const goldAlert of alert.goldAlerts) {
          const latestPrice = await GoldPrice.findOne({ 
            country: goldAlert.country 
          }).sort({ timestamp: -1 });
          
          if (latestPrice && latestPrice.priceChange !== 0) {
            const shouldAlert = this.checkThreshold(
              latestPrice.pricePerGram,
              goldAlert.threshold,
              goldAlert.direction
            );
            
            if (shouldAlert) {
              await this.sendNotification(
                alert.fcmToken,
                `Gold Price Alert - ${goldAlert.country}`,
                `Gold price in ${goldAlert.country} is now ${latestPrice.pricePerGram} ${latestPrice.currency} (${latestPrice.percentageChange > 0 ? '+' : ''}${latestPrice.percentageChange.toFixed(2)}%)`,
                {
                  type: 'gold_price',
                  country: goldAlert.country,
                  price: latestPrice.pricePerGram.toString(),
                  currency: latestPrice.currency
                }
              );
              
              // Update last notified time
              alert.notificationSettings.lastNotified = new Date();
              await alert.save();
            }
          }
        }
        
        // Check currency rate alerts
        for (const currencyAlert of alert.currencyAlerts) {
          const latestRate = await CurrencyRate.findOne({
            fromCurrency: currencyAlert.fromCurrency,
            toCurrency: currencyAlert.toCurrency
          }).sort({ timestamp: -1 });
          
          if (latestRate && latestRate.rateChange !== 0) {
            const shouldAlert = this.checkThreshold(
              latestRate.rate,
              currencyAlert.threshold,
              currencyAlert.direction
            );
            
            if (shouldAlert) {
              await this.sendNotification(
                alert.fcmToken,
                `Exchange Rate Alert`,
                `${currencyAlert.fromCurrency}/${currencyAlert.toCurrency} rate is now ${latestRate.rate.toFixed(4)} (${latestRate.percentageChange > 0 ? '+' : ''}${latestRate.percentageChange.toFixed(2)}%)`,
                {
                  type: 'currency_rate',
                  from: currencyAlert.fromCurrency,
                  to: currencyAlert.toCurrency,
                  rate: latestRate.rate.toString()
                }
              );
              
              // Update last notified time
              alert.notificationSettings.lastNotified = new Date();
              await alert.save();
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking alerts:', error);
    }
  }
  
  checkThreshold(currentValue, threshold, direction) {
    switch (direction) {
      case 'above':
        return currentValue > threshold;
      case 'below':
        return currentValue < threshold;
      case 'any':
      default:
        return true;
    }
  }
}

module.exports = new NotificationService();