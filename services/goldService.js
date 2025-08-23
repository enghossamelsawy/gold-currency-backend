const axios = require('axios');

class GoldService {
  constructor() {
    this.apiKey = process.env.METAL_PRICE_API_KEY;
    // We'll use a free alternative if MetalpriceAPI is limited
    this.mockData = {
      egypt: { price_per_gram: 3250, currency: 'EGP' },
      germany: { price_per_gram: 65, currency: 'EUR' },
      usa: { price_per_gram: 70, currency: 'USD' }
    };
  }

  async getGoldPrice(country) {
    try {
      // For now, return mock data (we'll implement real API later)
      // This helps you continue development while waiting for API approval
      const data = this.mockData[country.toLowerCase()];
      
      if (data) {
        return {
          country: country,
          ...data,
          timestamp: new Date().toISOString()
        };
      }
      
      throw new Error(`No data for country: ${country}`);
    } catch (error) {
      console.error('Gold API Error:', error.message);
      throw error;
    }
  }

  async getAllGoldPrices() {
    try {
      const countries = ['egypt', 'germany', 'usa'];
      const prices = [];
      
      for (const country of countries) {
        const price = await this.getGoldPrice(country);
        prices.push(price);
      }
      
      return prices;
    } catch (error) {
      console.error('Error fetching all gold prices:', error.message);
      throw error;
    }
  }
}

module.exports = new GoldService();