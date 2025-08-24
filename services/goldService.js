const axios = require('axios');

class GoldService {
  constructor() {
    this.apiKey = process.env.METAL_PRICE_API_KEY;
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
      
      // Fetch prices with EGP as base currency
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
        
        console.log('Metal prices fetched successfully:', response.data.rates);
        return response.data;
      } else {
        throw new Error('Invalid response from MetalpriceAPI');
      }
    } catch (error) {
      console.error('Error fetching metal prices:', error.message);
      
      // If API fails, try alternative endpoint
      return this.fetchAlternativePrices();
    }
  }

  // Alternative method using inverse calculation
  async fetchAlternativePrices() {
    try {
      // Try fetching with USD as base to get gold price in USD
      const response = await axios.get(`${this.baseUrl}/latest`, {
        params: {
          api_key: this.apiKey,
          base: 'USD',
          currencies: 'XAU,XAG,EGP'
        },
        timeout: 10000
      });

      if (response.data && response.data.success) {
        // Convert to EGP base
        const usdToEgp = 1 / response.data.rates.EGP;
        const xauToUsd = response.data.rates.XAU;
        const xagToUsd = response.data.rates.XAG;
        
        return {
          success: true,
          base: 'EGP',
          rates: {
            XAU: xauToUsd / usdToEgp, // Gold in EGP
            XAG: xagToUsd / usdToEgp, // Silver in EGP
            USD: usdToEgp,
            EUR: usdToEgp * 0.92 // Approximate
          }
        };
      }
    } catch (error) {
      console.error('Alternative fetch also failed:', error.message);
      // Return fallback data
      return this.getFallbackData();
    }
  }

  // Fallback data based on recent market prices
  getFallbackData() {
    console.log('Using fallback metal prices');
    return {
      success: true,
      base: 'EGP',
      rates: {
        XAU: 0.0000476, // 1 EGP = 0.0000476 oz of gold (approximately 1 oz gold = 21,000 EGP)
        XAG: 0.00125,   // 1 EGP = 0.00125 oz of silver (approximately 1 oz silver = 800 EGP)
        USD: 0.0323,    // 1 EGP = 0.0323 USD (1 USD = 31 EGP)
        EUR: 0.0297     // 1 EGP = 0.0297 EUR (1 EUR = 33.7 EGP)
      },
      cached: true
    };
  }

  // Calculate gold price per gram in EGP
  calculateGoldPricePerGram(xauRate) {
    // xauRate is: 1 EGP = X oz of gold
    // We need: price of 1 gram of gold in EGP
    
    // 1 oz = 31.1035 grams
    // If 1 EGP = xauRate oz of gold
    // Then 1 oz of gold = 1/xauRate EGP
    // So 1 gram of gold = (1/xauRate) / 31.1035 EGP
    
    const pricePerOunce = 1 / xauRate;
    const pricePerGram = pricePerOunce / 31.1035;
    
    return Math.round(pricePerGram * 100) / 100;
  }

  // Calculate silver price per gram in EGP
  calculateSilverPricePerGram(xagRate) {
    const pricePerOunce = 1 / xagRate;
    const pricePerGram = pricePerOunce / 31.1035;
    
    return Math.round(pricePerGram * 100) / 100;
  }

  // Get gold price for specific country
  async getGoldPrice(country) {
    try {
      const metalData = await this.fetchMetalPrices();
      
      if (!metalData || !metalData.success) {
        throw new Error('Failed to fetch metal prices');
      }

      const goldPriceEGP = this.calculateGoldPricePerGram(metalData.rates.XAU);
      
      switch(country.toLowerCase()) {
        case 'egypt':
          // Add Egyptian market premium (5-7%)
          const egyptianPremium = 1.06;
          return {
            country: 'egypt',
            price_per_gram: Math.round(goldPriceEGP * egyptianPremium * 100) / 100,
            currency: 'EGP',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'live'
          };
          
        case 'usa':
          // Convert EGP price to USD
          const egpToUsd = metalData.rates.USD;
          const goldPriceUSD = goldPriceEGP * egpToUsd;
          return {
            country: 'usa',
            price_per_gram: Math.round(goldPriceUSD * 100) / 100,
            currency: 'USD',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'live'
          };
          
        case 'germany':
          // Convert EGP price to EUR
          const egpToEur = metalData.rates.EUR;
          const goldPriceEUR = goldPriceEGP * egpToEur;
          return {
            country: 'germany',
            price_per_gram: Math.round(goldPriceEUR * 100) / 100,
            currency: 'EUR',
            timestamp: new Date().toISOString(),
            source: metalData.cached ? 'cached' : 'live'
          };
          
        default:
          throw new Error(`Unsupported country: ${country}`);
      }
    } catch (error) {
      console.error(`Error getting gold price for ${country}:`, error.message);
      
      // Return fallback prices
      const fallbackPrices = {
        egypt: { price_per_gram: 3250, currency: 'EGP' },
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

  // Get silver price (bonus feature)
  async getSilverPrice(country) {
    try {
      const metalData = await this.fetchMetalPrices();
      
      if (!metalData || !metalData.success) {
        throw new Error('Failed to fetch metal prices');
      }

      const silverPriceEGP = this.calculateSilverPricePerGram(metalData.rates.XAG);
      
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
      
      // Return fallback silver prices
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

  // Get all gold prices
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

  // Get complete metal data (gold + silver)
  async getMetalPrices() {
    try {
      const metalData = await this.fetchMetalPrices();
      
      const goldPricePerGram = this.calculateGoldPricePerGram(metalData.rates.XAU);
      const silverPricePerGram = this.calculateSilverPricePerGram(metalData.rates.XAG);
      
      return {
        gold: {
          price_per_gram_egp: goldPricePerGram,
          price_per_ounce_egp: goldPricePerGram * 31.1035,
          price_per_gram_usd: goldPricePerGram * metalData.rates.USD,
          price_per_gram_eur: goldPricePerGram * metalData.rates.EUR
        },
        silver: {
          price_per_gram_egp: silverPricePerGram,
          price_per_ounce_egp: silverPricePerGram * 31.1035,
          price_per_gram_usd: silverPricePerGram * metalData.rates.USD,
          price_per_gram_eur: silverPricePerGram * metalData.rates.EUR
        },
        exchange_rates: {
          egp_to_usd: metalData.rates.USD,
          egp_to_eur: metalData.rates.EUR
        },
        timestamp: new Date().toISOString(),
        source: metalData.cached ? 'cached' : 'live'
      };
    } catch (error) {
      console.error('Error getting metal prices:', error.message);
      throw error;
    }
  }

  // Clear cache (useful for forcing fresh data)
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