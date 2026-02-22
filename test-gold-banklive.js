const axios = require('axios');
const cheerio = require('cheerio');

async function testScraper() {
    try {
        const url = 'https://banklive.net/en/gold-price-today-in-egypt';
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const goldPrices = {};

        $('tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 3) {
                const nameColumn = $(cells[0]).text().trim();
                const buyColumn = $(cells[1]).find('.rate').text().trim() || $(cells[1]).text().trim();
                const sellColumn = $(cells[2]).find('.rate').text().trim() || $(cells[2]).text().trim();

                const karatMatch = nameColumn.match(/(\d+)\s*Karat/);
                if (karatMatch) {
                    const karat = parseInt(karatMatch[1]);
                    const buy = parseFloat(buyColumn.replace(/,/g, ''));
                    const sell = parseFloat(sellColumn.replace(/,/g, ''));

                    if (!isNaN(buy) && !isNaN(sell)) {
                        goldPrices[karat] = { buy, sell };
                    }
                }
            }
        });

        console.log("Gold Prices extracted (Corrected):", goldPrices);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

testScraper();
