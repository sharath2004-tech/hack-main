const DEFAULT_API_URL = process.env.CURRENCY_API_URL || 'https://open.er-api.com/v6/latest';
const CACHE_TTL_MS = Number(process.env.CURRENCY_CACHE_TTL_MS || 60 * 60 * 1000);

const cache = new Map();

const normalizeCurrency = (code) => {
  if (!code || typeof code !== 'string') {
    throw new Error('Currency code is required');
  }
  return code.trim().toUpperCase();
};

const ensureFetch = async () => {
  if (typeof fetch === 'function') {
    return fetch;
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
};

const buildUrl = (base) => {
  const apiUrl = DEFAULT_API_URL.trim().replace(/\/$/, '');
  return `${apiUrl}/${base}`;
};

const fetchRates = async (base) => {
  const fetchImpl = await ensureFetch();
  const response = await fetchImpl(buildUrl(base));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch currency rates: ${response.status} ${text}`);
  }

  const payload = await response.json();

  if (payload.result !== 'success' || !payload.rates) {
    throw new Error('Unexpected response shape from currency API');
  }

  return {
    rates: payload.rates,
    updatedAt: payload.time_last_update_utc || new Date().toUTCString(),
    provider: payload.provider || 'open.er-api.com',
  };
};

export const getRatesForBase = async (baseCurrency) => {
  const base = normalizeCurrency(baseCurrency || 'USD');
  const cached = cache.get(base);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.payload;
  }

  const payload = await fetchRates(base);
  cache.set(base, { payload, timestamp: now });
  return payload;
};

export const convertCurrency = async (amount, fromCurrency, toCurrency) => {
  const normalizedFrom = normalizeCurrency(fromCurrency);
  const normalizedTo = normalizeCurrency(toCurrency);

  if (Number.isNaN(Number(amount))) {
    throw new Error('Amount must be a valid number');
  }

  const numericAmount = Number(amount);
  if (numericAmount < 0) {
    throw new Error('Amount must be greater than or equal to zero');
  }

  if (normalizedFrom === normalizedTo) {
    return {
      base: normalizedFrom,
      target: normalizedTo,
      rate: 1,
      amount: numericAmount,
      converted_amount: numericAmount,
      updated_at: new Date().toISOString(),
    };
  }

  const { rates, updatedAt } = await getRatesForBase(normalizedFrom);
  const rate = rates[normalizedTo];

  if (typeof rate !== 'number') {
    throw new Error(`Conversion rate from ${normalizedFrom} to ${normalizedTo} is unavailable`);
  }

  return {
    base: normalizedFrom,
    target: normalizedTo,
    rate,
    amount: numericAmount,
    converted_amount: Number((numericAmount * rate).toFixed(2)),
    updated_at: updatedAt,
  };
};

export const listSupportedCurrencies = async (baseCurrency) => {
  const { rates, updatedAt } = await getRatesForBase(baseCurrency);
  return {
    base: normalizeCurrency(baseCurrency || 'USD'),
    rates,
    updated_at: updatedAt,
  };
};
