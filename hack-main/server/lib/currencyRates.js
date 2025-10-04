const DEFAULT_OPEN_TEMPLATE = 'https://open.er-api.com/v6/latest';
const DEFAULT_EXCHANGE_TEMPLATE = 'https://v6.exchangerate-api.com/v6/{apikey}/latest/{base}';

const cache = new Map();
let config;

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

const applyTemplate = (template, base, apiKey) => {
  let compiled = template.replace(/\{apikey\}|\{api_key\}|\{APIKEY\}|\{API_KEY\}/g, apiKey || '');
  const hasBaseToken = /\{base\}|\{BASE\}/.test(compiled);

  if (hasBaseToken) {
    compiled = compiled.replace(/\{base\}|\{BASE\}/g, base);
    return compiled;
  }

  const sanitized = compiled.trim().replace(/\/$/, '');
  return `${sanitized}/${base}`;
};

const ensureConfig = () => {
  if (config) {
    return config;
  }

  const apiKey = (process.env.EXCHANGE_RATE_API_KEY || process.env.CURRENCY_API_KEY || '').trim();
  const cacheTtl = Number(process.env.CURRENCY_CACHE_TTL_MS || 60 * 60 * 1000);
  const currencyApiUrl = (process.env.CURRENCY_API_URL || '').trim();
  const exchangeApiUrl = (process.env.EXCHANGE_RATE_API_URL || '').trim();

  if (apiKey) {
  const canReuseCurrencyTemplate = /\{apikey\}|\{api_key\}|\{APIKEY\}|\{API_KEY\}/.test(currencyApiUrl);
  const template = exchangeApiUrl || (canReuseCurrencyTemplate ? currencyApiUrl : '') || DEFAULT_EXCHANGE_TEMPLATE;
    config = {
      cacheTtl,
      provider: {
        name: 'exchangerate-api',
        label: 'ExchangeRate-API',
        requiresKey: true,
        buildUrl: (base) => applyTemplate(template, base, apiKey),
        parse: (payload) => {
          if (payload.result !== 'success' || !payload.conversion_rates) {
            throw new Error('Unexpected response shape from ExchangeRate-API');
          }

          return {
            rates: payload.conversion_rates,
            updatedAt: payload.time_last_update_utc || new Date().toUTCString(),
            provider: payload.provider || 'ExchangeRate-API',
          };
        },
      },
    };
  } else {
    const template = currencyApiUrl || DEFAULT_OPEN_TEMPLATE;
    config = {
      cacheTtl,
      provider: {
        name: 'open-er-api',
        label: 'open.er-api.com',
        requiresKey: false,
        buildUrl: (base) => applyTemplate(template, base),
        parse: (payload) => {
          if (payload.result !== 'success' || !payload.rates) {
            throw new Error('Unexpected response shape from currency API');
          }

          return {
            rates: payload.rates,
            updatedAt: payload.time_last_update_utc || new Date().toUTCString(),
            provider: payload.provider || 'open.er-api.com',
          };
        },
      },
    };
  }

  return config;
};

const fetchRates = async (base) => {
  const { provider } = ensureConfig();
  const fetchImpl = await ensureFetch();
  const response = await fetchImpl(provider.buildUrl(base));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch currency rates: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return provider.parse(payload);
};

export const getRatesForBase = async (baseCurrency) => {
  const base = normalizeCurrency(baseCurrency || 'USD');
  const cached = cache.get(base);
  const now = Date.now();
  const { cacheTtl } = ensureConfig();

  if (cached && now - cached.timestamp < cacheTtl) {
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
    const { provider } = ensureConfig();
    return {
      base: normalizedFrom,
      target: normalizedTo,
      rate: 1,
      amount: numericAmount,
      converted_amount: numericAmount,
      updated_at: new Date().toISOString(),
      provider: provider.label,
    };
  }

  const { rates, updatedAt, provider } = await getRatesForBase(normalizedFrom);
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
    provider,
  };
};

export const listSupportedCurrencies = async (baseCurrency) => {
  const { rates, updatedAt, provider } = await getRatesForBase(baseCurrency);
  return {
    base: normalizeCurrency(baseCurrency || 'USD'),
    rates,
    updated_at: updatedAt,
    provider,
  };
};

export const getActiveCurrencyProvider = () => {
  const { provider } = ensureConfig();
  return {
    name: provider.name,
    label: provider.label,
    requiresKey: provider.requiresKey,
  };
};
