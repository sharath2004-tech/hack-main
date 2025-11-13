const BASE_URL = 'https://open.er-api.com/v6/latest';
let ratesCache = { data: null, timestamp: 0 };
const CACHE_DURATION = 3600000;

export const fetchRates = async (base = 'USD') => {
  const now = Date.now();
  if (ratesCache.data && ratesCache.data.base === base && (now - ratesCache.timestamp) < CACHE_DURATION) {
    return ratesCache.data;
  }
  const url = `${BASE_URL}/${base}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch rates: ${response.statusText}`);
  const data = await response.json();
  if (data.result !== 'success') throw new Error('Exchange rate API error');
  const result = { base: data.base_code, rates: data.rates, updated_at: data.time_last_update_utc, provider: 'ExchangeRate-API' };
  ratesCache = { data: result, timestamp: now };
  return result;
};

export const listSupportedCurrencies = async (base = 'USD') => await fetchRates(base);

export const convertCurrency = async (amount, from, to) => {
  const rates = await fetchRates(from);
  if (!rates.rates[to]) throw new Error(`Currency ${to} not supported`);
  const rate = rates.rates[to];
  const converted = parseFloat(amount) * rate;
  return { from, to, amount: parseFloat(amount), rate, converted: parseFloat(converted.toFixed(2)) };
};