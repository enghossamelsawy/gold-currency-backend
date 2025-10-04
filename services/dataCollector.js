const GoldPrice = require('../models/GoldPrice');
const CurrencyRate = require('../models/CurrencyRate');
const goldService = require('./goldService');
const currencyService = require('./currencyService');
const notificationService = require('./notificationService');

class DataCollector {
  async collectGoldPrices() {
    console.log('📊 Collecting gold prices...');
    
    try {
      const prices = await goldService.getAllGoldPrices();
      
      for (const priceData of prices) {
        // Get the last price for comparison
        const lastPrice = await GoldPrice.findOne({ 
          country: priceData.country 
        }).sort({ timestamp: -1 });
        
        // Calculate changes
        let priceChange = 0;
        let percentageChange = 0;
        
        if (lastPrice) {
          priceChange = priceData.price_per_gram - lastPrice.pricePerGram;
          percentageChange = (priceChange / lastPrice.pricePerGram) * 100;
        }
        
        // Save new price
        const newPrice = new GoldPrice({
          country: priceData.country,
          pricePerGram: priceData.price_per_gram,
          currency: priceData.currency,
          previousPrice: lastPrice ? lastPrice.pricePerGram : null,
          priceChange,
          percentageChange
        });
        
        await newPrice.save();
        await notificationService.notifyGoldPriceUpdate(newPrice);
        console.log(`✅ Saved gold price for ${priceData.country}: ${priceData.price_per_gram} ${priceData.currency}`);
      }
      
      // Clean old records (keep only last 100 per country)
      await this.cleanOldRecords('gold');
      
    } catch (error) {
      console.error('❌ Error collecting gold prices:', error);
    }
  }
  
  async collectCurrencyRates() {
    console.log('💱 Collecting currency rates...');
    
    try {
      const rates = await currencyService.getMultipleRates();
      
      const pairs = [
        { from: 'USD', to: 'EUR', rate: rates.USD_EUR },
        { from: 'USD', to: 'EGP', rate: rates.USD_EGP },
        { from: 'EUR', to: 'EGP', rate: rates.EUR_EGP }
      ];
      
      for (const pair of pairs) {
        // Get last rate for comparison
        const lastRate = await CurrencyRate.findOne({
          fromCurrency: pair.from,
          toCurrency: pair.to
        }).sort({ timestamp: -1 });
        
        // Calculate changes
        let rateChange = 0;
        let percentageChange = 0;
        
        if (lastRate) {
          rateChange = pair.rate - lastRate.rate;
          percentageChange = (rateChange / lastRate.rate) * 100;
        }
        
        // Save new rate
        const newRate = new CurrencyRate({
          fromCurrency: pair.from,
          toCurrency: pair.to,
          rate: pair.rate,
          previousRate: lastRate ? lastRate.rate : null,
          rateChange,
          percentageChange
        });
        
        await newRate.save();
        await notificationService.notifyCurrencyRateUpdate(newRate);
        console.log(`✅ Saved rate ${pair.from}/${pair.to}: ${pair.rate}`);
      }
      
      // Clean old records
      await this.cleanOldRecords('currency');
      
    } catch (error) {
      console.error('❌ Error collecting currency rates:', error);
    }
  }
  
  async cleanOldRecords(type) {
    try {
      if (type === 'gold') {
        const countries = ['egypt', 'germany', 'usa'];
        for (const country of countries) {
          const records = await GoldPrice.find({ country })
            .sort({ timestamp: -1 })
            .skip(100);
          
          if (records.length > 0) {
            const idsToDelete = records.map(r => r._id);
            await GoldPrice.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`🧹 Cleaned ${idsToDelete.length} old gold records for ${country}`);
          }
        }
      } else if (type === 'currency') {
        const pairs = [
          { from: 'USD', to: 'EUR' },
          { from: 'USD', to: 'EGP' },
          { from: 'EUR', to: 'EGP' }
        ];
        
        for (const pair of pairs) {
          const records = await CurrencyRate.find({
            fromCurrency: pair.from,
            toCurrency: pair.to
          })
            .sort({ timestamp: -1 })
            .skip(100);
          
          if (records.length > 0) {
            const idsToDelete = records.map(r => r._id);
            await CurrencyRate.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`🧹 Cleaned ${idsToDelete.length} old currency records for ${pair.from}/${pair.to}`);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning old records:', error);
    }
  }
  
  async collectAllData() {
    console.log('🔄 Starting data collection...');
    await this.collectGoldPrices();
    await this.collectCurrencyRates();
    console.log('✅ Data collection completed');
  }
}

module.exports = new DataCollector();
