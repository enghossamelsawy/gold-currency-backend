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
  constructor() {}

  isFirebaseReady() {
    return admin.apps.length > 0;
  }

  shouldSkipByInterval(alert) {
    const { notificationSettings } = alert;
    if (!notificationSettings?.enabled) {
      return true;
    }

    const minInterval = notificationSettings.minInterval || 300000;
    const lastNotified = notificationSettings.lastNotified;

    if (!lastNotified) {
      return false;
    }

    const elapsed = Date.now() - new Date(lastNotified).getTime();
    return elapsed < minInterval;
  }

  async markNotified(alert) {
    alert.notificationSettings.lastNotified = new Date();
    await alert.save();
  }

  formatCountryName(country) {
    if (!country) return '';
    return country
      .split(/\s|_/)
      .filter(Boolean)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' ');
  }

  formatNumber(value, decimals) {
    if (!Number.isFinite(Number(value))) {
      return Number(0).toFixed(decimals);
    }
    return Number(value).toFixed(decimals);
  }

  escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async handleSendError(error, alert) {
    const code = error?.code || error?.errorInfo?.code;
    if (
      alert &&
      typeof alert.save === 'function' &&
      (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')
    ) {
      console.warn(`⚠️ Removing invalid FCM token for user ${alert.userId}`);
      alert.fcmToken = null;
      await alert.save();
    }
  }

  async sendNotification(fcmToken, title, body, data = {}) {
    if (!this.isFirebaseReady()) {
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
      if (!this.isFirebaseReady()) {
        console.log('Firebase not initialized - skipping alert checks');
        return;
      }

      const alerts = await UserAlert.find({ 'notificationSettings.enabled': true, fcmToken: { $ne: null } });

      for (const alert of alerts) {
        // Check if enough time has passed since last notification
        if (this.shouldSkipByInterval(alert)) {
          continue;
        }

        // Check gold price alerts
        for (const goldAlert of alert.goldAlerts) {
          if (this.shouldSkipByInterval(alert)) {
            break;
          }

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
              try {
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
                await this.markNotified(alert);
              } catch (error) {
                await this.handleSendError(error, alert);
              }
            }
          }
        }

        // Check currency rate alerts
        for (const currencyAlert of alert.currencyAlerts) {
          if (this.shouldSkipByInterval(alert)) {
            break;
          }

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
              try {
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
                await this.markNotified(alert);
              } catch (error) {
                await this.handleSendError(error, alert);
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking alerts:', error);
    }
  }

  async notifyGoldPriceUpdate(priceDoc) {
    if (!this.isFirebaseReady()) {
      return;
    }

    if (!priceDoc || typeof priceDoc.priceChange !== 'number' || priceDoc.priceChange === 0) {
      return;
    }

    const country = priceDoc.country;
    const normalizedCountry = (country || '').toLowerCase();
    const regexCountry = country ? new RegExp(`^${this.escapeRegex(country)}$`, 'i') : null;
    const eligibleAlerts = await UserAlert.find({
      'notificationSettings.enabled': true,
      fcmToken: { $ne: null },
      $or: [
        { alertType: { $in: ['gold_price', 'both'] } },
        ...(regexCountry
          ? [{ goldAlerts: { $elemMatch: { country: regexCountry } } }]
          : []
        )
      ]
    });

    for (const alert of eligibleAlerts) {
      if (this.shouldSkipByInterval(alert)) {
        continue;
      }

      const hasCountryFilter = Array.isArray(alert.goldAlerts) && alert.goldAlerts.length > 0;
      if (hasCountryFilter) {
        const match = alert.goldAlerts.some(item => (item.country || '').toLowerCase() === normalizedCountry);
        if (!match) {
          continue;
        }
      }

      const direction = priceDoc.priceChange > 0 ? 'increased' : 'decreased';
      const title = `Gold price update - ${this.formatCountryName(country)}`;
      const change = this.formatNumber(Math.abs(priceDoc.priceChange), 2);
      const percentage = this.formatNumber(Math.abs(priceDoc.percentageChange), 2);
      const currentPrice = this.formatNumber(priceDoc.pricePerGram, 2);
      const body = `Gold price ${direction} by ${change} ${priceDoc.currency} (${percentage}%) to ${currentPrice} ${priceDoc.currency}/g.`;

      try {
        await this.sendNotification(alert.fcmToken, title, body, {
          type: 'gold_price_update',
          country,
          price: priceDoc.pricePerGram.toString(),
          currency: priceDoc.currency,
          change: priceDoc.priceChange.toString(),
          direction,
          percentageChange: priceDoc.percentageChange.toString()
        });
        await this.markNotified(alert);
      } catch (error) {
        await this.handleSendError(error, alert);
      }
    }
  }

  async notifyCurrencyRateUpdate(rateDoc) {
    if (!this.isFirebaseReady()) {
      return;
    }

    if (!rateDoc || typeof rateDoc.rateChange !== 'number' || rateDoc.rateChange === 0) {
      return;
    }

    const fromCurrency = (rateDoc.fromCurrency || '').toUpperCase();
    const toCurrency = (rateDoc.toCurrency || '').toUpperCase();
    const eligibleAlerts = await UserAlert.find({
      'notificationSettings.enabled': true,
      fcmToken: { $ne: null },
      $or: [
        { alertType: { $in: ['currency_rate', 'both'] } },
        {
          currencyAlerts: {
            $elemMatch: {
              fromCurrency,
              toCurrency
            }
          }
        }
      ]
    });

    for (const alert of eligibleAlerts) {
      if (this.shouldSkipByInterval(alert)) {
        continue;
      }

      const hasPairFilter = Array.isArray(alert.currencyAlerts) && alert.currencyAlerts.length > 0;
      if (hasPairFilter) {
        const match = alert.currencyAlerts.some(item =>
          (item.fromCurrency || '').toUpperCase() === fromCurrency &&
          (item.toCurrency || '').toUpperCase() === toCurrency
        );
        if (!match) {
          continue;
        }
      }

      const direction = rateDoc.rateChange > 0 ? 'strengthened' : 'weakened';
      const title = `FX rate update - ${fromCurrency}/${toCurrency}`;
      const change = this.formatNumber(Math.abs(rateDoc.rateChange), 4);
      const percentage = this.formatNumber(Math.abs(rateDoc.percentageChange), 2);
      const currentRate = this.formatNumber(rateDoc.rate, 4);
      const body = `${fromCurrency}/${toCurrency} ${direction} by ${change} (${percentage}%) to ${currentRate}.`;

      try {
        await this.sendNotification(alert.fcmToken, title, body, {
          type: 'currency_rate_update',
          from: fromCurrency,
          to: toCurrency,
          rate: rateDoc.rate.toString(),
          change: rateDoc.rateChange.toString(),
          direction,
          percentageChange: rateDoc.percentageChange.toString()
        });
        await this.markNotified(alert);
      } catch (error) {
        await this.handleSendError(error, alert);
      }
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
