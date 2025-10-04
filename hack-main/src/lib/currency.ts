import { CurrencyQuote, CurrencyRates } from '../types';
import { request } from './api';

export const fetchCurrencyConversion = async (
  token: string,
  from: string,
  to: string,
  amount: number
): Promise<CurrencyQuote> => {
  const params = new URLSearchParams({
    from,
    to,
    amount: amount.toString(),
  });

  const data = await request<{ quote: CurrencyQuote }>(`/api/currency/convert?${params.toString()}`, token);
  return data.quote;
};

export const fetchCurrencyRates = async (
  token: string,
  base?: string
): Promise<CurrencyRates> => {
  const query = base ? `?base=${encodeURIComponent(base)}` : '';
  return request<CurrencyRates>(`/api/currency/rates${query}`, token);
};
