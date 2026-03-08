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
  constructor() {
    this.arabicMessages = {
      goldUp: [
        "الدهب ولع يا معلم! 🔥",
        "فرصة للبيع؟ الدهب رفع! 💰",
        "الدهب طار لفوق 🚀 الحق الظرف",
        "يا تلحق يا متلحقش، الدهب بيزيد 📈",
        "الدهب بيلمع النهاردة! ✨ السعر زاد",
        "أوبا! الدهب شد حيله قوي 💪",
        "صباح الذهب! ☀️ السعر دلوقتي في العالي"
      ],
      goldDown: [
        "يا بلاش! الدهب نزل، دي فرصة تشتري 🛒",
        "الحق اشتري، الدهب ريح شوية 👇",
        "الدهب هدي، يمكن الوقت مناسب للشراء؟ 🤔",
        "فرصة ذهبية! السعر نزل 📉",
        "الدهب نازل يدلع 💃 فرصة للناس اللي عايزة تشتري",
        "سعر الذهب هدي شوية، بص بصه كده 😉"
      ],
      goldGeneral: [
        "تحديث سريع لأسعار الذهب 📝",
        "شوف الذهب وصل لفين النهاردة 👀",
        "يا صباح الرزق! ده سعر الذهب دلوقتي 💸",
        "نشرة الذهب اليومية وصلت 📢",
        "إيه الأخبار في سوق الذهب؟ 🕵️‍♂️"
      ],
      currUp: [
        "أوبا! العملة رفعت تاني 📈",
        "الدولار طار لفوق! 🚀",
        "سعر الصرف في العالي، خد بالك 💸",
        "يا ساتر! العملة شدت حيلها 💹"
      ],
      currDown: [
        "الجنيه بيرد! العملة نزلت 📉",
        "بشرى سارة، سعر الصرف نزل شوية 🟢",
        "العملة ريحت أخيرًا 👇",
        "فرصة تحويل؟ السعر نزل 📉"
      ],
      digestOpener: [
        "صباح الفل يا مصري! ☀️",
        "إيه الأخبار في السوق النهاردة؟ 🗞️",
        "يا صباح الرزق! شوف الأسعار دلوقت 💸",
        "يا هلا بالناس الحلوة، ده ملخص السوق 🍏",
        "صباح الورد والالماس، إليك أسعار اليوم 📝"
      ]
    };

    this.englishMessages = {
      goldGeneral: [
        "Gold update incoming! ✨",
        "Check today's gold rates! 💰",
        "Fresh gold prices just in 📝",
        "Is it time to buy? Check the rates! 🤔",
        "Daily gold market overview 📊"
      ]
    };
  }

  getRandomMessage(category) {
    const msgs = this.arabicMessages[category];
    if (!msgs) return "";
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

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
                const lang = alert.language === 'ar' ? 'ar' : 'en';
                const isUp = latestPrice.priceChange > 0;
                const title = lang === 'ar'
                  ? `تنبيه سعر الذهب - ${goldAlert.country}`
                  : `Gold Price Alert - ${goldAlert.country}`;
                let body = lang === 'ar'
                  ? `سعر الذهب في ${goldAlert.country} الآن ${latestPrice.pricePerGram} ${latestPrice.currency} (${isUp ? '+' : ''}${latestPrice.percentageChange.toFixed(2)}%)`
                  : `Gold price in ${goldAlert.country} is now ${latestPrice.pricePerGram} ${latestPrice.currency} (${isUp ? '+' : ''}${latestPrice.percentageChange.toFixed(2)}%)`;

                if (lang === 'ar') {
                  const catchphrase = this.getRandomMessage(isUp ? 'goldUp' : 'goldDown');
                  body = `${catchphrase}\n${body}`;
                }

                await this.sendNotification(
                  alert.fcmToken,
                  title,
                  body,
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
                const lang = alert.language === 'ar' ? 'ar' : 'en';
                const isUp = latestRate.rateChange > 0;
                const title = lang === 'ar' ? 'تنبيه سعر الصرف' : 'Exchange Rate Alert';
                let body = lang === 'ar'
                  ? `سعر ${currencyAlert.fromCurrency}/${currencyAlert.toCurrency} الآن ${latestRate.rate.toFixed(4)} (${isUp ? '+' : ''}${latestRate.percentageChange.toFixed(2)}%)`
                  : `${currencyAlert.fromCurrency}/${currencyAlert.toCurrency} rate is now ${latestRate.rate.toFixed(4)} (${isUp ? '+' : ''}${latestRate.percentageChange.toFixed(2)}%)`;

                if (lang === 'ar') {
                  const catchphrase = this.getRandomMessage(isUp ? 'currUp' : 'currDown');
                  body = `${catchphrase}\n${body}`;
                }

                await this.sendNotification(
                  alert.fcmToken,
                  title,
                  body,
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

  getRandomEnglishMessage(category) {
    const msgs = this.englishMessages[category];
    if (!msgs) return "";
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  async notifyGoldPriceUpdate(priceData) {
    if (!this.isFirebaseReady()) {
      return;
    }

    if (!priceData) {
      return;
    }

    const country = priceData.country;
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

      const lang = alert.language === 'ar' ? 'ar' : 'en';
      const currentPrice = this.formatNumber(priceData.pricePerGram, 2);

      let title;
      let body;

      if (lang === 'ar') {
        const catchphrase = this.getRandomMessage('goldGeneral');
        title = `✨ تحديث سعر الذهب - ${this.formatCountryName(country)}`;
        body = `${catchphrase}\n\nسعر الذهب في ${this.formatCountryName(country)} هو الآن ${currentPrice} ${priceData.currency}/جرام 💰`;
      } else {
        const catchphrase = this.getRandomEnglishMessage('goldGeneral');
        title = `✨ Gold Update - ${this.formatCountryName(country)}`;
        body = `${catchphrase}\n\nThe gold price in ${this.formatCountryName(country)} is currently ${currentPrice} ${priceData.currency}/g 💰`;
      }

      try {
        await this.sendNotification(alert.fcmToken, title, body, {
          type: 'gold_price_update',
          country,
          price: priceData.pricePerGram.toString(),
          currency: priceData.currency,
          timestamp: priceData.timestamp || new Date().toISOString()
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

      const lang = alert.language === 'ar' ? 'ar' : 'en';
      const directionPayload = rateDoc.rateChange > 0 ? 'strengthened' : 'weakened';
      const directionStr = lang === 'ar'
        ? (rateDoc.rateChange > 0 ? 'ارتفع' : 'انخفض')
        : directionPayload;

      const title = lang === 'ar'
        ? `تحديث أسعار الصرف - ${fromCurrency}/${toCurrency}`
        : `FX rate update - ${fromCurrency}/${toCurrency}`;

      const change = this.formatNumber(Math.abs(rateDoc.rateChange), 4);
      const percentage = this.formatNumber(Math.abs(rateDoc.percentageChange), 2);
      const currentRate = this.formatNumber(rateDoc.rate, 4);

      let body = lang === 'ar'
        ? `${fromCurrency}/${toCurrency} ${directionStr} بمقدار ${change} (${percentage}%) إلى ${currentRate}.`
        : `${fromCurrency}/${toCurrency} ${directionStr} by ${change} (${percentage}%) to ${currentRate}.`;

      if (lang === 'ar') {
        const catchphrase = this.getRandomMessage(rateDoc.rateChange > 0 ? 'currUp' : 'currDown');
        title = `${catchphrase} ${title}`;
      }

      try {
        await this.sendNotification(alert.fcmToken, title, body, {
          type: 'currency_rate_update',
          from: fromCurrency,
          to: toCurrency,
          rate: rateDoc.rate.toString(),
          change: rateDoc.rateChange.toString(),
          direction: directionPayload,
          percentageChange: rateDoc.percentageChange.toString()
        });
        await this.markNotified(alert);
      } catch (error) {
        await this.handleSendError(error, alert);
      }
    }
  }

  async sendDailyDigest() {
    if (!this.isFirebaseReady()) {
      console.log('Firebase not initialized - skipping daily digest');
      return;
    }

    try {
      const [latestGold, latestUsdEgp, latestUsdEur] = await Promise.all([
        GoldPrice.findOne({ country: 'egypt' }).sort({ timestamp: -1 }),
        CurrencyRate.findOne({ fromCurrency: 'USD', toCurrency: 'EGP' }).sort({ timestamp: -1 }),
        CurrencyRate.findOne({ fromCurrency: 'USD', toCurrency: 'EUR' }).sort({ timestamp: -1 })
      ]);

      const getGoldChangeStr = (doc) => `${doc.percentageChange > 0 ? '+' : ''}${this.formatNumber(doc.percentageChange || 0, 2)}%`;
      const getCurrencyChangeStr = (doc) => `${doc.percentageChange > 0 ? '+' : ''}${this.formatNumber(doc.percentageChange || 0, 2)}%`;

      // English parts
      const enGoldSegment = latestGold ? `Gold 24K ${this.formatNumber(latestGold.pricePerGram, 2)} ${latestGold.currency}/g (${getGoldChangeStr(latestGold)})` : null;
      const enUsdEgpSegment = latestUsdEgp ? `USD/EGP ${this.formatNumber(latestUsdEgp.rate, 2)} (${getCurrencyChangeStr(latestUsdEgp)})` : null;
      const enUsdEurSegment = latestUsdEur ? `USD/EUR ${this.formatNumber(latestUsdEur.rate, 4)} (${getCurrencyChangeStr(latestUsdEur)})` : null;

      // Arabic parts
      const arGoldSegment = latestGold ? `ذهب عيار 24: ${this.formatNumber(latestGold.pricePerGram, 2)} ${latestGold.currency}/جرام (${getGoldChangeStr(latestGold)})` : null;
      const arUsdEgpSegment = latestUsdEgp ? `دولار/جنيه: ${this.formatNumber(latestUsdEgp.rate, 2)} (${getCurrencyChangeStr(latestUsdEgp)})` : null;
      const arUsdEurSegment = latestUsdEur ? `دولار/يورو: ${this.formatNumber(latestUsdEur.rate, 4)} (${getCurrencyChangeStr(latestUsdEur)})` : null;

      const dataPayload = {
        type: 'daily_digest',
        goldPrice: latestGold?.pricePerGram?.toString() || '',
        goldCurrency: latestGold?.currency || '',
        usdEgp: latestUsdEgp?.rate?.toString() || '',
        usdEur: latestUsdEur?.rate?.toString() || ''
      };

      const alerts = await UserAlert.find({
        'notificationSettings.enabled': true,
        fcmToken: { $ne: null }
      });

      console.log(`🔊 Sending daily digest to ${alerts.length} users`);

      for (const alert of alerts) {
        if (this.shouldSkipByInterval(alert)) {
          continue;
        }

        const lang = alert.language === 'ar' ? 'ar' : 'en';
        let body;
        let title;

        if (lang === 'ar') {
          const opener = this.getRandomMessage('digestOpener');
          const parts = [arGoldSegment, arUsdEgpSegment, arUsdEurSegment].filter(Boolean);
          body = parts.length > 0 ? `${opener}\n\n${parts.join(' | ')}` : 'تحقق من أحدث أسعار الذهب والعملات.';
          title = 'تحديث السوق اليومي';
        } else {
          const parts = [enGoldSegment, enUsdEgpSegment, enUsdEurSegment].filter(Boolean);
          body = parts.length > 0 ? parts.join(' | ') : 'Check the latest gold and currency updates.';
          title = 'Daily Market Update';
        }

        try {
          await this.sendNotification(
            alert.fcmToken,
            title,
            body,
            dataPayload
          );
          await this.markNotified(alert);
        } catch (error) {
          await this.handleSendError(error, alert);
        }
      }
    } catch (error) {
      console.error('❌ Error sending daily digest:', error);
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
