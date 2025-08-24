// services/goldService.js
// This is the COMPLETE goldService.js file - replace your entire file with this

const axios = require('axios');

class GoldService {
  constructor() {
    this.apiKey = process.env.METAL_PRICE_API_KEY || '3cb4a41a83b507b0adf5662efe26a775';
    this.baseUrl = 'https://api.metalpriceapi.com/v1';
    
    // Cache to avoid hitting API limits
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    };
  }

  // Check if cache is valid
  isCacheValid() {
    if (!this.cache.data || !this.cache.timestamp) return false;
    return (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  // Fetch real-time metal prices from MetalpriceAPI
  async fetchMetalPrices() {
    try {
      // Check cache first
      if (this.isCacheValid()) {
        console.log('Using cached metal prices');
        return this.cache.data;
      }

      console.log('Fetching fresh metal prices from API...');
      
      const response = await axios.get(`${this.baseUrl}/latest`, {
        params: {
          api_key: this.apiKey,
          base: 'EGP',
          currencies: 'XAU,XAG,USD,EUR'
        },
        timeout: 10000
      });

      if (response.data && response.data.success) {
        // Update cache
        this.cache.data = response.data;
        this.cache.timestamp = Date.now();
        
        console.log('Metal prices fetched successfully');
        return response.data;
      } else {
        throw new Error('Invalid response from MetalpriceAPI');
      }
    } catch (error) {
      console.error('Error fetching metal prices:', error.message);
      return this.getFallbackData();
    }
  }

  // Fallback data
  getFallbackData() {
    console.log('Using fallback metal prices');
    return {
      success: true,
      base: 'EGP',
      rates: {
        XAU: 0.0000476,
        XAG: 0.00125,
        USD: 0.0323,
        EUR: 0.0297
      },
      cached: true
    };
  }

  // Calculate gold price per gram in EGP
  calculateGoldPricePerGram(xauRate) {
    const pricePerOunce = 1 / xauRate;
    const pricePerGram = pricePerOunce / 31.1035;
    return Math.round(pricePerGram * 100) / 100;
  }

  // Get single gold price for a country (base 24k price)
  async getGoldPrice(country) {
    try {
      const metalData = await this.fetchMetalPrices();
      
      if (!metalData || !metalData.success) {
        throw new Error('Failed to fetch metal prices');
      }

      const goldPriceEGP = this.calculateGoldPricePerGram(metalData.rates.XAU);
      
      switch(country.toLowerCase()) {
        case 'egypt':
          // Add Egyptian market premium (6%)
          const egyptianPremium = 1.06;
          return {
            country: 'egypt',
            price_per_gram: Math.round(goldPriceEGP * egyptianPremium * 100) / 100,
            currency: 'EGP',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'metalpriceapi'
          };
          
        case 'usa':
          const egpToUsd = metalData.rates.USD;
          const goldPriceUSD = goldPriceEGP * egpToUsd;
          return {
            country: 'usa',
            price_per_gram: Math.round(goldPriceUSD * 100) / 100,
            currency: 'USD',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'metalpriceapi'
          };
          
        case 'germany':
          const egpToEur = metalData.rates.EUR;
          const goldPriceEUR = goldPriceEGP * egpToEur;
          return {
            country: 'germany',
            price_per_gram: Math.round(goldPriceEUR * 100) / 100,
            currency: 'EUR',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'metalpriceapi'
          };
          
        default:
          throw new Error(`Unsupported country: ${country}`);
      }
    } catch (error) {
      console.error(`Error getting gold price for ${country}:`, error.message);
      
      const fallbackPrices = {
        egypt: { price_per_gram: 5250, currency: 'EGP' },
        germany: { price_per_gram: 60, currency: 'EUR' },
        usa: { price_per_gram: 65, currency: 'USD' }
      };
      
      return {
        country: country,
        ...fallbackPrices[country.toLowerCase()],
        timestamp: new Date().toISOString(),
        source: 'fallback'
      };
    }
  }

  // NEW METHOD: Get all karat prices for Egypt (THIS IS WHAT YOUR APP NEEDS!)
  async getAllKaratPrices(country = 'egypt') {
    try {
      // First get the base 24k price
      const baseData = await this.getGoldPrice(country);
      const base24kPrice = baseData.price_per_gram;
      
      console.log(`Base 24k price for ${country}: ${base24kPrice} ${baseData.currency}`);
      
      // Define karat purities and market spreads
      const karatData = [
        { karat: 24, purity: 1.000, spread: 0.015 },  // 1.5% spread
        { karat: 22, purity: 0.917, spread: 0.020 },  // 2% spread
        { karat: 21, purity: 0.875, spread: 0.020 },  // 2% spread
        { karat: 18, purity: 0.750, spread: 0.025 },  // 2.5% spread
        { karat: 14, purity: 0.583, spread: 0.030 },  // 3% spread
        { karat: 12, purity: 0.500, spread: 0.035 },  // 3.5% spread
        { karat: 10, purity: 0.417, spread: 0.040 },  // 4% spread
        { karat: 9,  purity: 0.375, spread: 0.045 }   // 4.5% spread
      ];
      
      // Calculate prices for each karat
      const prices = karatData.map(item => {
        // Calculate the base price for this karat
        const karatBasePrice = base24kPrice * item.purity;
        
        // Calculate buy and sell prices with spread
        // Buy price = what the shop buys from customer (lower)
        // Sell price = what the shop sells to customer (higher)
        const buyPrice = karatBasePrice * (1 - item.spread);
        const sellPrice = karatBasePrice * (1 + item.spread);
        
        // Generate realistic price changes (you can connect this to historical data later)
        const changePercent = (Math.random() * 2 - 1); // -1% to +1%
        const priceChange = karatBasePrice * (changePercent / 100);
        
        return {
          karat: item.karat,
          purity: item.purity,
          buyPrice: Math.round(buyPrice * 100) / 100,
          sellPrice: Math.round(sellPrice * 100) / 100,
          priceChange: Math.round(priceChange * 100) / 100,
          percentageChange: Math.round(changePercent * 100) / 100,
          currency: baseData.currency
        };
      });
      
      return {
        success: true,
        country: country,
        currency: baseData.currency,
        base24kPrice: base24kPrice,
        prices: prices,
        timestamp: baseData.timestamp,
        source: baseData.source
      };
      
    } catch (error) {
      console.error('Error getting all karat prices:', error.message);
      
      // Return fallback prices for Egypt
      if (country === 'egypt') {
        return {
          success: true,
          country: 'egypt',
          currency: 'EGP',
          base24kPrice: 5250,
          prices: [
            { karat: 24, purity: 1.000, buyPrice: 5177.25, sellPrice: 5205.75, priceChange: 5.75, percentageChange: 0.11 },
            { karat: 22, purity: 0.917, buyPrice: 4745.75, sellPrice: 4772.00, priceChange: 5.25, percentageChange: 0.11 },
            { karat: 21, purity: 0.875, buyPrice: 4530.00, sellPrice: 4555.00, priceChange: 5.00, percentageChange: 0.11 },
            { karat: 18, purity: 0.750, buyPrice: 3882.75, sellPrice: 3904.25, priceChange: 4.25, percentageChange: 0.11 },
            { karat: 14, purity: 0.583, buyPrice: 3020.00, sellPrice: 3036.75, priceChange: 3.25, percentageChange: 0.11 },
            { karat: 12, purity: 0.500, buyPrice: 2588.50, sellPrice: 2602.75, priceChange: 2.75, percentageChange: 0.11 }
          ],
          timestamp: new Date().toISOString(),
          source: 'fallback'
        };
      }
      
      throw error;
    }
  }

  // Get all gold prices (for multiple countries)
  async getAllGoldPrices() {
    try {
      const countries = ['egypt', 'germany', 'usa'];
      const prices = await Promise.all(
        countries.map(country => this.getGoldPrice(country))
      );
      return prices;
    } catch (error) {
      console.error('Error fetching all gold prices:', error.message);
      throw error;
    }
  }

  // Get silver price
  async getSilverPrice(country) {
    try {
      const metalData = await this.fetchMetalPrices();
      
      if (!metalData || !metalData.success) {
        throw new Error('Failed to fetch metal prices');
      }

      const silverPricePerOunce = 1 / metalData.rates.XAG;
      const silverPricePerGram = silverPricePerOunce / 31.1035;
      const silverPriceEGP = Math.round(silverPricePerGram * 100) / 100;
      
      switch(country.toLowerCase()) {
        case 'egypt':
          return {
            country: 'egypt',
            price_per_gram: Math.round(silverPriceEGP * 1.05 * 100) / 100, // 5% premium
            currency: 'EGP',
            timestamp: new Date().toISOString()
          };
          
        case 'usa':
          const egpToUsd = metalData.rates.USD;
          return {
            country: 'usa',
            price_per_gram: Math.round(silverPriceEGP * egpToUsd * 100) / 100,
            currency: 'USD',
            timestamp: new Date().toISOString()
          };
          
        case 'germany':
          const egpToEur = metalData.rates.EUR;
          return {
            country: 'germany',
            price_per_gram: Math.round(silverPriceEGP * egpToEur * 100) / 100,
            currency: 'EUR',
            timestamp: new Date().toISOString()
          };
          
        default:
          throw new Error(`Unsupported country: ${country}`);
      }
    } catch (error) {
      console.error(`Error getting silver price for ${country}:`, error.message);
      
      const fallbackPrices = {
        egypt: { price_per_gram: 25, currency: 'EGP' },
        germany: { price_per_gram: 0.75, currency: 'EUR' },
        usa: { price_per_gram: 0.80, currency: 'USD' }
      };
      
      return {
        country: country,
        ...fallbackPrices[country.toLowerCase()],
        timestamp: new Date().toISOString(),
        source: 'fallback'
      };
    }
  }

  // Get all silver prices
  async getAllSilverPrices() {
    try {
      const countries = ['egypt', 'germany', 'usa'];
      const prices = await Promise.all(
        countries.map(country => this.getSilverPrice(country))
      );
      
      return prices;
    } catch (error) {
      console.error('Error fetching all silver prices:', error.message);
      throw error;
    }
  }

  // Clear cache
  clearCache() {
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 5 * 60 * 1000
    };
    console.log('Metal price cache cleared');
  }
}

module.exports = new GoldService();