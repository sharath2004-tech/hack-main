import { DollarSign, Loader2, Sparkles } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { request } from '../../lib/api';
import { fetchCurrencyConversion } from '../../lib/currency';
import type { Company, CurrencyQuote, ExpenseCategory, ReceiptAnalysis } from '../../types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

type ExpenseFormState = {
  description: string;
  date: string;
  category_id: string;
  paid_by: string;
  amount: string;
  currency: string;
  remarks: string;
};

type AutoConversionInfo = {
  fromCurrency: string;
  toCurrency: string;
  originalAmount: number;
  convertedAmount: number;
  rate: number;
  updatedAt: string;
};

export const EmployeeDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ReceiptAnalysis | null>(null);
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [companyCurrency, setCompanyCurrency] = useState<string>('USD');
  const [conversionQuote, setConversionQuote] = useState<CurrencyQuote | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [autoConversionInfo, setAutoConversionInfo] = useState<AutoConversionInfo | null>(null);
  const defaultDateRef = useRef(new Date().toISOString().split('T')[0]);
  const defaultCurrencyRef = useRef<string>('USD');
  const [formData, setFormData] = useState<ExpenseFormState>({
    description: '',
    date: defaultDateRef.current,
    category_id: '',
    paid_by: 'Cash',
    amount: '',
    currency: defaultCurrencyRef.current,
    remarks: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversionTimeoutRef = useRef<number | null>(null);

  const loadCategories = useCallback(async () => {
    if (!user || !token) return;
    try {
      const data = await request<{ categories: ExpenseCategory[] }>('/api/expense-categories', token);
      setCategories(data.categories);
    } catch (error) {
      console.error('Failed to load categories', error);
    }
  }, [token, user]);

  const loadCompanyProfile = useCallback(async () => {
    if (!token) return;

    try {
      const data = await request<{ company: Company }>('/api/company/profile', token);
      setCompanyInfo(data.company);
      const previousDefault = defaultCurrencyRef.current;
      const normalizedCurrency = (data.company.default_currency || 'USD').toUpperCase();
      defaultCurrencyRef.current = normalizedCurrency;
      setCompanyCurrency(normalizedCurrency);

      setFormData((prev) => {
        if (!prev.currency || prev.currency.toUpperCase() === previousDefault.toUpperCase()) {
          return { ...prev, currency: normalizedCurrency };
        }
        return prev;
      });
    } catch (error) {
      console.error('Failed to load company profile', error);
    }
  }, [token]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadCompanyProfile();
  }, [loadCompanyProfile]);

  const resetForm = useCallback(() => {
    defaultDateRef.current = new Date().toISOString().split('T')[0];
    setFormData({
      description: '',
      date: defaultDateRef.current,
      category_id: '',
      paid_by: 'Cash',
      amount: '',
      currency: defaultCurrencyRef.current,
      remarks: '',
    });
    setReceiptFile(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setConversionQuote(null);
    setConversionError(null);
    setConversionLoading(false);
  setAutoConversionInfo(null);
    if (conversionTimeoutRef.current !== null) {
      window.clearTimeout(conversionTimeoutRef.current);
      conversionTimeoutRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const analyzeReceiptFile = useCallback(
    async (file: File | null) => {
      setAnalysisResult(null);
      setAnalysisError(null);

      if (!file) {
        setReceiptFile(null);
        setAutoConversionInfo(null);
        return;
      }

      setReceiptFile(file);

      if (!token) {
        setAnalysisError('Please sign in again to analyze receipts automatically.');
        return;
      }

      setAnalyzingReceipt(true);
      try {
        const payload = new FormData();
        payload.append('receipt', file);

        const data = await request<{ analysis: ReceiptAnalysis }>(
          '/api/receipts/analyze',
          token,
          {
            method: 'POST',
            body: payload,
          }
        );

        setAnalysisResult(data.analysis ?? null);
        setAutoConversionInfo(null);
      } catch (error: unknown) {
        const apiError = error as { message?: string } | undefined;
        setAnalysisError(apiError?.message || 'We could not read this receipt. Please fill in the details manually.');
      } finally {
        setAnalyzingReceipt(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!analysisResult) return;

    setFormData((prev) => {
      const next = { ...prev };
      let changed = false;

      const setIfDifferent = <K extends keyof typeof prev>(key: K, value: (typeof prev)[K]) => {
        if (next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      };

      const trimmedDescription = prev.description.trim();
      if (analysisResult.description && trimmedDescription.length === 0) {
        setIfDifferent('description', analysisResult.description.slice(0, 120));
      } else if (analysisResult.merchant && trimmedDescription.length === 0) {
        setIfDifferent('description', analysisResult.merchant.slice(0, 120));
      }

      if (analysisResult.date && (prev.date === defaultDateRef.current || prev.date.trim().length === 0)) {
        setIfDifferent('date', analysisResult.date);
      }

      if (typeof analysisResult.amount === 'number' && prev.amount.trim().length === 0) {
        setIfDifferent('amount', analysisResult.amount.toFixed(2));
      }

      if (analysisResult.currency) {
        const normalizedCurrency = analysisResult.currency.toUpperCase();
        if (
          (prev.currency === defaultCurrencyRef.current || prev.currency.trim().length === 0) &&
          SUPPORTED_CURRENCIES.includes(normalizedCurrency as (typeof SUPPORTED_CURRENCIES)[number])
        ) {
          setIfDifferent('currency', normalizedCurrency);
        }
      }

      if (!prev.category_id && analysisResult.category) {
        const normalizedCategory = analysisResult.category.trim().toLowerCase();
        const matchingCategory = categories.find(
          (category) => category.name.trim().toLowerCase() === normalizedCategory
        );
        if (matchingCategory) {
          setIfDifferent('category_id', matchingCategory.id);
        }
      }

      if (analysisResult.merchant && prev.remarks.trim().length === 0) {
        setIfDifferent('remarks', `Vendor: ${analysisResult.merchant}`);
      }

      return changed ? next : prev;
    });
  }, [analysisResult, categories]);

  useEffect(() => {
    if (!analysisResult || !token) return;
    const receiptCurrencyRaw = analysisResult.currency;
    const receiptAmountRaw = analysisResult.amount;

    if (!receiptCurrencyRaw || receiptAmountRaw === null || receiptAmountRaw === undefined) {
      setAutoConversionInfo(null);
      return;
    }

    const receiptCurrency = receiptCurrencyRaw.toUpperCase();
    const targetCurrency = companyCurrency.toUpperCase();

    if (receiptCurrency === targetCurrency) {
      setAutoConversionInfo(null);
      return;
    }

    const receiptAmount = typeof receiptAmountRaw === 'number' ? receiptAmountRaw : Number(receiptAmountRaw);
    if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
      setAutoConversionInfo(null);
      return;
    }

    let cancelled = false;

    const convert = async () => {
      try {
        const quote = await fetchCurrencyConversion(token, receiptCurrency, targetCurrency, receiptAmount);
        if (cancelled) return;

        setFormData((prev) => ({
          ...prev,
          amount: quote.converted_amount.toFixed(2),
          currency: targetCurrency,
        }));

        setAutoConversionInfo({
          fromCurrency: receiptCurrency,
          toCurrency: targetCurrency,
          originalAmount: receiptAmount,
          convertedAmount: quote.converted_amount,
          rate: quote.rate,
          updatedAt: quote.updated_at,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Automatic currency conversion failed', error);
        setAutoConversionInfo(null);
      }
    };

    convert();

    return () => {
      cancelled = true;
    };
  }, [analysisResult, companyCurrency, token]);

  useEffect(() => {
    if (!token) {
      setConversionQuote(null);
      setConversionError(null);
      setConversionLoading(false);
      if (conversionTimeoutRef.current !== null) {
        window.clearTimeout(conversionTimeoutRef.current);
        conversionTimeoutRef.current = null;
      }
      return;
    }

    const amountValue = Number(formData.amount);

    if (!formData.amount || Number.isNaN(amountValue) || amountValue <= 0) {
      setConversionQuote(null);
      setConversionError(null);
      setConversionLoading(false);
      setAutoConversionInfo(null);
      if (conversionTimeoutRef.current !== null) {
        window.clearTimeout(conversionTimeoutRef.current);
        conversionTimeoutRef.current = null;
      }
      return;
    }

    const fromCurrency = formData.currency.toUpperCase();
    const toCurrency = companyCurrency.toUpperCase();

    if (fromCurrency === toCurrency) {
      setConversionQuote(null);
      setConversionError(null);
      setConversionLoading(false);
      setAutoConversionInfo(null);
      if (conversionTimeoutRef.current !== null) {
        window.clearTimeout(conversionTimeoutRef.current);
        conversionTimeoutRef.current = null;
      }
      return;
    }

    if (conversionTimeoutRef.current !== null) {
      window.clearTimeout(conversionTimeoutRef.current);
    }

    setConversionLoading(true);
    setConversionError(null);

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const quote = await fetchCurrencyConversion(token, fromCurrency, toCurrency, amountValue);
        if (!cancelled) {
          setFormData((prev) => {
            const nextAmount = quote.converted_amount.toFixed(2);
            if (
              prev.currency.toUpperCase() === toCurrency &&
              Number(prev.amount) === Number(nextAmount)
            ) {
              return prev;
            }

            return {
              ...prev,
              amount: nextAmount,
              currency: toCurrency,
            };
          });

          setAutoConversionInfo({
            fromCurrency,
            toCurrency,
            originalAmount: amountValue,
            convertedAmount: quote.converted_amount,
            rate: quote.rate,
            updatedAt: quote.updated_at,
          });

          setConversionQuote(null);
          setConversionError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const apiError = error as { message?: string } | undefined;
          setConversionQuote(null);
          setConversionError(apiError?.message || 'Unable to convert amount right now.');
          setAutoConversionInfo(null);
        }
      } finally {
        if (!cancelled) {
          setConversionLoading(false);
          conversionTimeoutRef.current = null;
        }
      }
    }, 450);

    conversionTimeoutRef.current = timeoutId;

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      conversionTimeoutRef.current = null;
    };
  }, [formData.amount, formData.currency, companyCurrency, token]);

  const formattedConfidence = useMemo(() => {
    if (analysisResult?.confidence === undefined || analysisResult?.confidence === null) {
      return null;
    }
    const rounded = Number(analysisResult.confidence);
    if (Number.isNaN(rounded)) return null;
    return `${Math.max(0, Math.min(100, Math.round(rounded)))}%`;
  }, [analysisResult?.confidence]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!token) {
        throw new Error('You must be signed in to submit expenses');
      }

      const payload = new FormData();
      payload.append('description', formData.description);
      payload.append('date', formData.date);
      payload.append('category_id', formData.category_id);
      payload.append('paid_by', formData.paid_by);
      payload.append('amount', formData.amount);
      payload.append('currency', formData.currency);
      payload.append('remarks', formData.remarks);

      if (receiptFile) {
        payload.append('receipt', receiptFile);
      }

      await request('/api/expenses', token, {
        method: 'POST',
        body: payload,
      });

      resetForm();

      alert('Expense submitted successfully!');
    } catch (error: unknown) {
      const apiError = error as { message?: string } | undefined;
      alert(apiError?.message || 'Failed to submit expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Submit Expense</h1>
        <p className="text-slate-600 mt-1">Create a new expense report</p>
        {companyInfo && (
          <p className="text-sm text-slate-500 mt-2">
            {companyInfo.name} • Default currency {companyInfo.default_currency}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Receipt (Optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void analyzeReceiptFile(file);
              }}
              className="w-full px-4 py-3 border border-dashed border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">
              Attach receipts in any format (PDF, image, etc.).
            </p>
            {analyzingReceipt && (
              <p className="mt-2 text-sm text-blue-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing receipt for suggested values...
              </p>
            )}
            {analysisError && !analyzingReceipt && (
              <p className="mt-2 text-sm text-red-600">{analysisError}</p>
            )}
            {analysisResult && !analysisError && (
              <div className="mt-4 border border-blue-100 bg-blue-50/60 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-700 font-medium">
                  <Sparkles className="h-4 w-4" />
                  Suggested values extracted from your receipt
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {analysisResult.merchant && (
                    <div>
                      <dt className="font-semibold text-slate-800">Vendor</dt>
                      <dd>{analysisResult.merchant}</dd>
                    </div>
                  )}
                  {typeof analysisResult.amount === 'number' && (
                    <div>
                      <dt className="font-semibold text-slate-800">Amount</dt>
                      <dd>
                        {analysisResult.currency ? `${analysisResult.currency} ` : ''}
                        {analysisResult.amount.toFixed(2)}
                      </dd>
                    </div>
                  )}
                  {analysisResult.date && (
                    <div>
                      <dt className="font-semibold text-slate-800">Date</dt>
                      <dd>{analysisResult.date}</dd>
                    </div>
                  )}
                  {analysisResult.category && (
                    <div>
                      <dt className="font-semibold text-slate-800">Expense Type</dt>
                      <dd>{analysisResult.category}</dd>
                    </div>
                  )}
                  {analysisResult.description && (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-slate-800">Suggested Description</dt>
                      <dd>{analysisResult.description}</dd>
                    </div>
                  )}
                  {formattedConfidence && (
                    <div>
                      <dt className="font-semibold text-slate-800">Confidence</dt>
                      <dd>{formattedConfidence}</dd>
                    </div>
                  )}
                </dl>
                {analysisResult.text && (
                  <details className="mt-3 text-xs text-slate-600">
                    <summary className="cursor-pointer select-none font-medium text-slate-700">
                      View extracted receipt text
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words bg-white/80 border border-slate-200 rounded p-3 text-[11px] leading-relaxed">
                      {analysisResult.text}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What was this expense for?"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Paid By</label>
              <select
                value={formData.paid_by}
                onChange={(e) => setFormData({ ...formData, paid_by: e.target.value })}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  min="0.01"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Currency</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="INR">INR</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Company default currency:{' '}
              <span className="font-semibold text-slate-700">{companyCurrency}</span>
            </p>
            {formData.currency.toUpperCase() !== companyCurrency.toUpperCase() && (
              <div className="mt-1">
                {conversionLoading && (
                  <p className="flex items-center gap-2 text-xs text-blue-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calculating approximate amount in {companyCurrency}...
                  </p>
                )}
                {conversionQuote && !conversionLoading && (
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <p>
                      ≈ {conversionQuote.target}{' '}
                      {conversionQuote.converted_amount.toFixed(2)}{' '}
                      <span className="text-slate-400">
                        (rate {conversionQuote.rate.toFixed(4)} · updated{' '}
                        {new Date(conversionQuote.updated_at).toLocaleString()})
                      </span>
                    </p>
                    {conversionQuote.provider && (
                      <p className="text-[11px] text-slate-400">
                        Rates by {conversionQuote.provider}
                      </p>
                    )}
                  </div>
                )}
                {conversionError && !conversionLoading && (
                  <p className="text-xs text-red-600">{conversionError}</p>
                )}
              </div>
            )}
            {autoConversionInfo && (
              <div className="mt-2 text-xs text-green-600">
                Converted {autoConversionInfo.fromCurrency}{' '}
                {autoConversionInfo.originalAmount.toFixed(2)} → {autoConversionInfo.toCurrency}{' '}
                {autoConversionInfo.convertedAmount.toFixed(2)} (rate {autoConversionInfo.rate.toFixed(4)},
                updated {new Date(autoConversionInfo.updatedAt).toLocaleString()})
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Remarks (Optional)
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Any additional notes..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Expense'}
          </button>
        </form>
      </div>
    </div>
  );
};
