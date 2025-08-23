const axios = require('axios');

class CurrencyService {
  constructor() {
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
    this.baseUrl = `https://v6.exchangerate-api.com/v6/${this.apiKey}`;
  }

  async getExchangeRate(fromCurrency, toCurrency) {
    try {
      const response = await axios.get(`${this.baseUrl}/pair/${fromCurrency}/${toCurrency}`);
      
      if (response.data.result === 'success') {
        return {
          from: fromCurrency,
          to: toCurrency,
          rate: response.data.conversion_rate,
          timestamp: new Date().toISOString()
        };
      }
      throw new Error('Failed to fetch exchange rate');
    } catch (error) {
      console.error('Currency API Error:', error.message);
      throw error;
    }
  }

  async getMultipleRates() {
    try {
      // Get USD as base and convert to multiple currencies
      const response = await axios.get(`${this.baseUrl}/latest/USD`);
      
      if (response.data.result === 'success') {
        const rates = response.data.conversion_rates;
        return {
          USD_EUR: rates.EUR,
          USD_EGP: rates.EGP,
          EUR_EGP: rates.EGP / rates.EUR,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Error fetching multiple rates:', error.message);
      throw error;
    }
  }
}

module.exports = new CurrencyService();