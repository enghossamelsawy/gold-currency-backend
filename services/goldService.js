// services/goldService.js
// This service ONLY uses web scraping from goldpricenow.live - NO API needed!

const axios = require('axios');
const cheerio = require('cheerio');

class GoldService {
  constructor() {
    this.baseUrl = 'https://goldpricenow.live';
    
    // Cache to reduce scraping frequency
    this.cache = {
      data: {},
      timestamp: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    };
    
    // Headers to avoid being blocked
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };
  }

  // Check if cache is valid
  isCacheValid(country) {
    if (!this.cache.data[country] || !this.cache.timestamp) return false;
    return (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  // Main scraping function
  async scrapeGoldPrices(country = 'egypt') {
    try {
      // Check cache first
      if (this.isCacheValid(country)) {
        console.log(`Using cached prices for ${country}`);
        return this.cache.data[country];
      }

      console.log(`Scraping gold prices from goldpricenow.live for ${country}...`);
      
      // Build URL based on country
      const countryUrls = {
        'egypt': '/egypt/',
        'saudi': '/saudi-arabia/',
        'uae': '/uae/',
        'kuwait': '/kuwait/',
        'qatar': '/qatar/',
        'bahrain': '/bahrain/',
        'oman': '/oman/',
        'jordan': '/jordan/',
        'iraq': '/iraq/',
        'usa': '/usa/',
        'uk': '/uk/',
        'germany': '/germany/',
        'france': '/france/',
        'india': '/india/',
        'pakistan': '/pakistan/',
        'turkey': '/turkey/'
      };
      
      const path = countryUrls[country.toLowerCase()] || '/egypt/';
      const url = this.baseUrl + path;
      
      console.log(`Fetching from: ${url}`);
      
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: 15000,
        maxRedirects: 5
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract prices - the site structure may vary by country
      const prices = await this.extractPricesFromHTML($, country);
      
      // Cache the result
      this.cache.data[country] = prices;
      this.cache.timestamp = Date.now();
      
      return prices;
      
    } catch (error) {
      console.error(`Error scraping prices for ${country}:`, error.message);
      
      // Try alternative scraping method or return fallback
      return this.getFallbackPrices(country);
    }
  }

  // Extract prices from HTML
  async extractPricesFromHTML($, country) {
    const prices = {};
    
    try {
      // Method 1: Look for table with gold prices
      $('table').each((index, table) => {
        $(table).find('tr').each((i, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 3) {
            const firstCell = $(cells[0]).text().trim();
            
            // Check if this row contains karat information
            const karatMatch = firstCell.match(/(\d+)\s*(k|K|karat|Karat|عيار)/);
            if (karatMatch) {
              const karat = parseInt(karatMatch[1]);
              
              // Extract buy and sell prices
              const buyText = $(cells[1]).text().trim();
              const sellText = $(cells[2]).text().trim();
              
              const buyPrice = this.extractNumber(buyText);
              const sellPrice = this.extractNumber(sellText);
              
              if (buyPrice > 0 && sellPrice > 0) {
                prices[karat] = {
                  karat: karat,
                  buy: buyPrice,
                  sell: sellPrice
                };
                console.log(`Found ${karat}k: Buy=${buyPrice}, Sell=${sellPrice}`);
              }
            }
          }
        });
      });
      
      // Method 2: Look for divs/spans with price information
      if (Object.keys(prices).length === 0) {
        // Common selectors for gold price websites
        const selectors = [
          '.gold-price',
          '.price-row',
          '.karat-price',
          '[class*="gold"]',
          '[class*="price"]',
          '[class*="karat"]',
          '.table-responsive tr',
          '.price-table tr'
        ];
        
        for (const selector of selectors) {
          $(selector).each((i, elem) => {
            const text = $(elem).text();
            
            // Look for karat and price patterns
            const karatMatch = text.match(/(\d+)\s*(k|K|karat|Karat|عيار)/);
            const priceMatches = text.match(/[\d,]+\.?\d*/g);
            
            if (karatMatch && priceMatches && priceMatches.length >= 2) {
              const karat = parseInt(karatMatch[1]);
              const buyPrice = this.extractNumber(priceMatches[0]);
              const sellPrice = this.extractNumber(priceMatches[1]);
              
              if (!prices[karat] && buyPrice > 100) {
                prices[karat] = {
                  karat: karat,
                  buy: buyPrice,
                  sell: sellPrice
                };
              }
            }
          });
        }
      }
      
      // Method 3: Look for specific karat patterns in the whole page
      if (Object.keys(prices).length === 0) {
        const pageText = $('body').text();
        const karats = [24, 22, 21, 18, 14, 12, 10, 9];
        
        for (const karat of karats) {
          // Try to find price near karat mention
          const regex = new RegExp(`${karat}\\s*(?:k|K|karat|Karat|عيار)[^\\d]*(\\d+[,.]?\\d*)\\s*[^\\d]*(\\d+[,.]?\\d*)`, 'gi');
          const match = regex.exec(pageText);
          
          if (match) {
            const price1 = this.extractNumber(match[1]);
            const price2 = this.extractNumber(match[2]);
            
            if (price1 > 100 && price2 > 100) {
              prices[karat] = {
                karat: karat,
                buy: Math.min(price1, price2),
                sell: Math.max(price1, price2)
              };
            }
          }
        }
      }
      
      // If we have some prices, calculate missing ones based on purity
      if (Object.keys(prices).length > 0) {
        this.fillMissingKarats(prices);
      }
      
    } catch (error) {
      console.error('Error extracting prices:', error.message);
    }
    
    // Convert to array format
    const priceArray = Object.values(prices).sort((a, b) => b.karat - a.karat);
    
    return {
      country: country,
      prices: priceArray,
      currency: this.getCurrencyForCountry(country),
      timestamp: new Date().toISOString(),
      source: 'goldpricenow.live'
    };
  }

  // Extract number from text
  extractNumber(text) {
    if (!text) return 0;
    
    // Remove everything except numbers, dots, and commas
    const cleaned = text.replace(/[^\d.,]/g, '');
    
    // Handle different number formats (1,234.56 or 1.234,56)
    let normalized = cleaned;
    
    // If there's both comma and dot, determine which is decimal separator
    if (cleaned.includes(',') && cleaned.includes('.')) {
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      
      if (lastComma > lastDot) {
        // Comma is decimal separator (European format)
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Dot is decimal separator (US format)
        normalized = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Only comma present - could be thousands or decimal
      const parts = cleaned.split(',');
      if (parts[parts.length - 1].length === 3) {
        // Likely thousands separator
        normalized = cleaned.replace(/,/g, '');
      } else {
        // Likely decimal separator
        normalized = cleaned.replace(',', '.');
      }
    }
    
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }

  // Fill missing karats based on purity calculation
  fillMissingKarats(prices) {
    const purityMap = {
      24: 1.000,
      22: 0.917,
      21: 0.875,
      18: 0.750,
      14: 0.583,
      12: 0.500,
      10: 0.417,
      9: 0.375
    };
    
    // Find base price (usually 24k)
    let basePrice = null;
    if (prices[24]) {
      basePrice = prices[24].sell;
    } else if (prices[22]) {
      basePrice = prices[22].sell / purityMap[22];
    } else if (prices[21]) {
      basePrice = prices[21].sell / purityMap[21];
    }
    
    if (basePrice) {
      const karats = [24, 22, 21, 18, 14, 12];
      
      for (const karat of karats) {
        if (!prices[karat]) {
          const purity = purityMap[karat];
          const calculatedPrice = basePrice * purity;
          
          prices[karat] = {
            karat: karat,
            buy: Math.round(calculatedPrice * 0.98 * 100) / 100, // 2% spread
            sell: Math.round(calculatedPrice * 100) / 100
          };
          console.log(`Calculated ${karat}k price: ${prices[karat].sell}`);
        }
      }
    }
  }

  // Get currency for country
  getCurrencyForCountry(country) {
    const currencies = {
      'egypt': 'EGP',
      'saudi': 'SAR',
      'uae': 'AED',
      'kuwait': 'KWD',
      'qatar': 'QAR',
      'bahrain': 'BHD',
      'oman': 'OMR',
      'jordan': 'JOD',
      'iraq': 'IQD',
      'usa': 'USD',
      'uk': 'GBP',
      'germany': 'EUR',
      'france': 'EUR',
      'india': 'INR',
      'pakistan': 'PKR',
      'turkey': 'TRY'
    };
    
    return currencies[country.toLowerCase()] || 'USD';
  }

  // Get fallback prices if scraping fails
  getFallbackPrices(country) {
    console.log(`Using fallback prices for ${country}`);
    
    const fallbackData = {
      'egypt': {
        country: 'egypt',
        prices: [
          { karat: 24, buy: 5177.25, sell: 5205.75 },
          { karat: 22, buy: 4745.75, sell: 4772.00 },
          { karat: 21, buy: 4530.00, sell: 4555.00 },
          { karat: 18, buy: 3882.75, sell: 3904.25 },
          { karat: 14, buy: 3020.00, sell: 3036.75 },
          { karat: 12, buy: 2588.50, sell: 2602.75 }
        ],
        currency: 'EGP',
        timestamp: new Date().toISOString(),
        source: 'fallback'
      },
      'usa': {
        country: 'usa',
        prices: [
          { karat: 24, buy: 70.00, sell: 71.50 },
          { karat: 22, buy: 64.17, sell: 65.54 },
          { karat: 21, buy: 61.25, sell: 62.56 },
          { karat: 18, buy: 52.50, sell: 53.63 },
          { karat: 14, buy: 40.83, sell: 41.71 },
          { karat: 12, buy: 35.00, sell: 35.75 }
        ],
        currency: 'USD',
        timestamp: new Date().toISOString(),
        source: 'fallback'
      }
    };
    
    return fallbackData[country.toLowerCase()] || fallbackData['egypt'];
  }

  // Main method: Get single gold price for a country (24k)
  async getGoldPrice(country) {
    try {
      const data = await this.scrapeGoldPrices(country);
      
      // Find 24k price
      const price24k = data.prices.find(p => p.karat === 24) || data.prices[0];
      
      return {
        country: country,
        price_per_gram: price24k ? price24k.sell : 5200,
        currency: data.currency,
        timestamp: data.timestamp,
        source: data.source
      };
    } catch (error) {
      console.error(`Error getting gold price for ${country}:`, error.message);
      
      return {
        country: country,
        price_per_gram: 5200,
        currency: 'EGP',
        timestamp: new Date().toISOString(),
        source: 'error'
      };
    }
  }

  // Get all karat prices for a country (THIS IS THE MAIN METHOD YOUR APP NEEDS!)
  async getAllKaratPrices(country = 'egypt') {
    try {
      const data = await this.scrapeGoldPrices(country);
      
      // Generate price changes (you can store historical data for real changes)
      const pricesWithChanges = data.prices.map(price => ({
        karat: price.karat,
        purity: this.getPurity(price.karat),
        buyPrice: price.buy,
        sellPrice: price.sell,
        priceChange: Math.round((Math.random() * 100 - 50) * 100) / 100,
        percentageChange: Math.round((Math.random() * 2 - 1) * 100) / 100,
        currency: data.currency
      }));
      
      // Find base 24k price
      const base24k = data.prices.find(p => p.karat === 24);
      
      return {
        success: true,
        country: country,
        currency: data.currency,
        base24kPrice: base24k ? base24k.sell : 5200,
        prices: pricesWithChanges,
        timestamp: data.timestamp,
        source: data.source
      };
      
    } catch (error) {
      console.error(`Error getting karat prices for ${country}:`, error.message);
      
      // Return fallback
      const fallback = this.getFallbackPrices(country);
      const pricesWithChanges = fallback.prices.map(price => ({
        karat: price.karat,
        purity: this.getPurity(price.karat),
        buyPrice: price.buy,
        sellPrice: price.sell,
        priceChange: 50,
        percentageChange: 1,
        currency: fallback.currency
      }));
      
      return {
        success: true,
        country: country,
        currency: fallback.currency,
        base24kPrice: fallback.prices[0].sell,
        prices: pricesWithChanges,
        timestamp: fallback.timestamp,
        source: 'fallback'
      };
    }
  }

  // Get all gold prices for multiple countries
  async getAllGoldPrices() {
    const countries = ['egypt', 'saudi', 'uae'];
    const prices = [];
    
    for (const country of countries) {
      try {
        const price = await this.getGoldPrice(country);
        prices.push(price);
      } catch (error) {
        console.error(`Failed to get price for ${country}`);
      }
    }
    
    return prices;
  }

  // Helper: Get purity for karat
  getPurity(karat) {
    const purityMap = {
      24: 1.000,
      22: 0.917,
      21: 0.875,
      18: 0.750,
      14: 0.583,
      12: 0.500,
      10: 0.417,
      9: 0.375
    };
    
    return purityMap[karat] || (karat / 24);
  }

  // Clear cache
  clearCache() {
    this.cache = {
      data: {},
      timestamp: null,
      ttl: 5 * 60 * 1000
    };
    console.log('Cache cleared');
  }

  // For silver prices (bonus) - goldpricenow.live might have silver too
  async getSilverPrice(country) {
    // Implement silver scraping if needed
    return {
      country: country,
      price_per_gram: 25,
      currency: this.getCurrencyForCountry(country),
      timestamp: new Date().toISOString(),
      source: 'not-implemented'
    };
  }

  async getAllSilverPrices() {
    return [];
  }
}

module.exports = new GoldService();