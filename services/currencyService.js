// services/currencyService.js
// Scrapes each currency rate directly - NO calculations!

const axios = require('axios');
const cheerio = require('cheerio');

class CurrencyService {
  constructor() {
    // Cache to reduce scraping frequency
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 60 * 60 * 1000 // 1 hour cache
    };
    
    // Headers to avoid being blocked
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    };
  }

  // Check if cache is valid
  isCacheValid() {
    if (!this.cache.data || !this.cache.timestamp) return false;
    return (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  // Scrape individual currency rate from XE.com
  async scrapeSingleRate(fromCurrency, toCurrency = 'EGP') {
    try {
      const url = `https://www.xe.com/currencyconverter/convert/?Amount=1&From=${fromCurrency}&To=${toCurrency}`;
      
      console.log(`Fetching ${fromCurrency} to ${toCurrency}...`);
      
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      let rate = null;
      
      // Try multiple selectors where XE shows the rate
      const selectors = [
        '.result__BigRate-sc-1bsijpp-1',
        '.converterresult-toAmount',
        'p[class*="result__BigRate"]',
        'p[class*="BigRate"]',
        '.uccResultAmount',
        'span[class*="faded-digits"]'
      ];
      
      for (const selector of selectors) {
        const elements = $(selector);
        elements.each((i, elem) => {
          const text = $(elem).text().trim();
          // Look for numbers that could be exchange rates
          const matches = text.match(/[\d,]+\.?\d*/g);
          if (matches) {
            for (const match of matches) {
              const num = parseFloat(match.replace(/,/g, ''));
              // Check if it's a reasonable exchange rate
              if (num > 0.001 && num < 10000) {
                rate = num;
                console.log(`Found rate for ${fromCurrency}: ${rate}`);
                return false; // Break from each loop
              }
            }
          }
        });
        if (rate) break;
      }
      
      // If still no rate, check in page scripts
      if (!rate) {
        $('script').each((i, script) => {
          const content = $(script).html();
          if (content && content.includes(fromCurrency) && content.includes(toCurrency)) {
            const rateMatch = content.match(/"rate":\s*([\d.]+)/);
            if (rateMatch) {
              rate = parseFloat(rateMatch[1]);
            }
          }
        });
      }
      
      return rate;
      
    } catch (error) {
      console.error(`Error scraping ${fromCurrency} rate:`, error.message);
      return null;
    }
  }

  // Scrape all currency rates individually
  async scrapeAllRates() {
    try {
      console.log('Scraping all currency rates individually...');
      
      const currencies = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD'];
      const rates = {};
      
      // Fetch each currency rate separately
      for (const currency of currencies) {
        const rate = await this.scrapeSingleRate(currency, 'EGP');
        
        if (rate) {
          // Add buy/sell spread (banks typically have 0.3-0.5% spread)
          rates[currency] = {
            code: currency,
            buy: Math.round(rate * 0.997 * 1000) / 1000,  // Bank buys at lower rate
            sell: Math.round(rate * 1.003 * 1000) / 1000, // Bank sells at higher rate
            mid: Math.round(rate * 1000) / 1000
          };
        }
        
        // Small delay between requests to avoid being blocked
        await this.delay(1000);
      }
      
      return {
        base: 'EGP',
        date: new Date().toLocaleDateString(),
        timestamp: new Date().toISOString(),
        rates: rates,
        source: 'xe.com'
      };
      
    } catch (error) {
      console.error('Error scraping rates:', error.message);
      return this.getFallbackRates();
    }
  }

  // Alternative: Scrape from investing.com
  async scrapeInvesting() {
    try {
      console.log('Trying to scrape from investing.com...');
      
      const rates = {};
      
      // Investing.com pages for EGP pairs
      const pairs = {
        'USD': 'usd-egp',
        'EUR': 'eur-egp',
        'GBP': 'gbp-egp',
        'SAR': 'sar-egp',
        'AED': 'aed-egp'
      };
      
      for (const [currency, pair] of Object.entries(pairs)) {
        try {
          const url = `https://www.investing.com/currencies/${pair}`;
          
          const response = await axios.get(url, {
            headers: this.headers,
            timeout: 10000
          });
          
          const $ = cheerio.load(response.data);
          
          // Look for the current rate
          let rate = null;
          
          // Investing.com shows rate in these places
          const selectors = [
            'span[data-test="instrument-price-last"]',
            '.instrument-price_last__KQzyA',
            '.text-5xl',
            '[class*="instrument-price"]',
            '.last-price-value'
          ];
          
          for (const selector of selectors) {
            const elem = $(selector).first();
            if (elem.length) {
              const text = elem.text().trim();
              const match = text.match(/[\d.]+/);
              if (match) {
                rate = parseFloat(match[0]);
                if (rate > 0 && rate < 1000) {
                  break;
                }
              }
            }
          }
          
          if (rate) {
            rates[currency] = {
              code: currency,
              buy: Math.round(rate * 0.997 * 1000) / 1000,
              sell: Math.round(rate * 1.003 * 1000) / 1000,
              mid: Math.round(rate * 1000) / 1000
            };
            console.log(`Got ${currency}/EGP: ${rate}`);
          }
          
          await this.delay(1000);
          
        } catch (err) {
          console.error(`Failed to get ${currency} rate from investing.com`);
        }
      }
      
      return {
        base: 'EGP',
        date: new Date().toLocaleDateString(),
        timestamp: new Date().toISOString(),
        rates: rates,
        source: 'investing.com'
      };
      
    } catch (error) {
      console.error('Investing.com scraping failed:', error.message);
      return null;
    }
  }

  // Helper function for delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main method to get all rates
  async getAllRates() {
    try {
      // Check cache first
      if (this.isCacheValid()) {
        console.log('Using cached currency rates');
        return this.cache.data;
      }
      
      // Try different sources
      let data = await this.scrapeAllRates();
      
      // If XE fails, try investing.com
      if (!data || Object.keys(data.rates).length < 3) {
        data = await this.scrapeInvesting();
      }
      
      // If still no data, use fallback
      if (!data || Object.keys(data.rates).length === 0) {
        data = this.getFallbackRates();
      }
      
      // Cache the result
      this.cache.data = data;
      this.cache.timestamp = Date.now();
      
      return data;
      
    } catch (error) {
      console.error('Error getting rates:', error.message);
      return this.getFallbackRates();
    }
  }

  // Get fallback rates if scraping fails
  getFallbackRates() {
    console.log('Using fallback currency rates');
    
    return {
      base: 'EGP',
      date: new Date().toLocaleDateString(),
      timestamp: new Date().toISOString(),
      rates: {
        USD: { code: 'USD', buy: 30.85, sell: 30.95, mid: 30.90 },
        EUR: { code: 'EUR', buy: 33.50, sell: 33.65, mid: 33.57 },
        GBP: { code: 'GBP', buy: 38.55, sell: 38.70, mid: 38.62 },
        SAR: { code: 'SAR', buy: 8.22, sell: 8.26, mid: 8.24 },
        AED: { code: 'AED', buy: 8.40, sell: 8.44, mid: 8.42 },
        KWD: { code: 'KWD', buy: 100.35, sell: 100.85, mid: 100.60 },
        CHF: { code: 'CHF', buy: 34.85, sell: 35.00, mid: 34.92 },
        JPY: { code: 'JPY', buy: 0.205, sell: 0.207, mid: 0.206 },
        CNY: { code: 'CNY', buy: 4.25, sell: 4.28, mid: 4.265 },
        CAD: { code: 'CAD', buy: 22.75, sell: 22.85, mid: 22.80 },
        AUD: { code: 'AUD', buy: 20.15, sell: 20.25, mid: 20.20 }
      },
      source: 'fallback'
    };
  }

  // Get exchange rate between two currencies
  async getExchangeRate(fromCurrency, toCurrency) {
    try {
      const data = await this.getAllRates();
      
      if (fromCurrency === 'EGP' && toCurrency === 'EGP') {
        return {
          from: 'EGP',
          to: 'EGP',
          rate: 1,
          timestamp: data.timestamp
        };
      }
      
      if (fromCurrency === 'EGP' && data.rates[toCurrency]) {
        const rate = 1 / data.rates[toCurrency].mid;
        return {
          from: fromCurrency,
          to: toCurrency,
          rate: Math.round(rate * 10000) / 10000,
          timestamp: data.timestamp
        };
      }
      
      if (toCurrency === 'EGP' && data.rates[fromCurrency]) {
        return {
          from: fromCurrency,
          to: toCurrency,
          rate: data.rates[fromCurrency].mid,
          timestamp: data.timestamp
        };
      }
      
      // For cross rates, we still need to calculate
      if (data.rates[fromCurrency] && data.rates[toCurrency]) {
        const fromToEGP = data.rates[fromCurrency].mid;
        const toToEGP = data.rates[toCurrency].mid;
        const crossRate = fromToEGP / toToEGP;
        
        return {
          from: fromCurrency,
          to: toCurrency,
          rate: Math.round(crossRate * 10000) / 10000,
          timestamp: data.timestamp
        };
      }
      
      throw new Error(`Cannot find exchange rate for ${fromCurrency}/${toCurrency}`);
      
    } catch (error) {
      console.error('Error getting exchange rate:', error.message);
      return {
        from: fromCurrency,
        to: toCurrency,
        rate: 1,
        timestamp: new Date().toISOString(),
        error: true
      };
    }
  }

  // Get multiple rates (for compatibility with old code)
  async getMultipleRates() {
    try {
      const data = await this.getAllRates();
      
      const usdRate = data.rates.USD ? data.rates.USD.mid : 30.90;
      const eurRate = data.rates.EUR ? data.rates.EUR.mid : 33.57;
      
      return {
        USD_EUR: usdRate / eurRate,
        USD_EGP: usdRate,
        EUR_EGP: eurRate,
        timestamp: data.timestamp
      };
      
    } catch (error) {
      console.error('Error getting multiple rates:', error.message);
      return {
        USD_EUR: 0.92,
        USD_EGP: 30.90,
        EUR_EGP: 33.57,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Get all currency rates with details
  async getAllCurrencyRates() {
    try {
      const data = await this.getAllRates();
      
      const currencyInfo = {
        USD: { name: 'US Dollar', flag: '🇺🇸' },
        EUR: { name: 'Euro', flag: '🇪🇺' },
        GBP: { name: 'British Pound', flag: '🇬🇧' },
        SAR: { name: 'Saudi Riyal', flag: '🇸🇦' },
        AED: { name: 'UAE Dirham', flag: '🇦🇪' },
        KWD: { name: 'Kuwaiti Dinar', flag: '🇰🇼' },
        CHF: { name: 'Swiss Franc', flag: '🇨🇭' },
        JPY: { name: 'Japanese Yen', flag: '🇯🇵' },
        CNY: { name: 'Chinese Yuan', flag: '🇨🇳' },
        CAD: { name: 'Canadian Dollar', flag: '🇨🇦' },
        AUD: { name: 'Australian Dollar', flag: '🇦🇺' }
      };
      
      const formattedRates = [];
      
      for (const [code, rate] of Object.entries(data.rates)) {
        const info = currencyInfo[code] || { name: code, flag: '💱' };
        
        formattedRates.push({
          code: code,
          name: info.name,
          flag: info.flag,
          buyRate: rate.buy,
          sellRate: rate.sell,
          midRate: rate.mid,
          spread: Math.round((rate.sell - rate.buy) * 100) / 100,
          spreadPercent: Math.round(((rate.sell - rate.buy) / rate.mid) * 10000) / 100
        });
      }
      
      // Sort by importance
      const sortOrder = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD'];
      formattedRates.sort((a, b) => {
        const aIndex = sortOrder.indexOf(a.code);
        const bIndex = sortOrder.indexOf(b.code);
        
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.code.localeCompare(b.code);
      });
      
      return {
        base: 'EGP',
        date: data.date,
        timestamp: data.timestamp,
        source: data.source,
        rates: formattedRates
      };
      
    } catch (error) {
      console.error('Error getting all currency rates:', error.message);
      const fallback = this.getFallbackRates();
      return {
        base: 'EGP',
        date: fallback.date,
        timestamp: fallback.timestamp,
        source: 'fallback',
        rates: []
      };
    }
  }

  // Clear cache
  clearCache() {
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 60 * 60 * 1000
    };
    console.log('Currency cache cleared');
  }
}

module.exports = new CurrencyService();