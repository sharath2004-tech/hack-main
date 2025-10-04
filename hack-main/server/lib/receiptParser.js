import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const PDFParser = require('pdf2json');

const workerPaths = {
  workerPath: path.resolve(__dirname, '../node_modules/tesseract.js/dist/worker.min.js'),
  corePath: path.resolve(__dirname, '../node_modules/tesseract.js-core/tesseract-core.wasm'),
};

let workerPromise = null;

const initWorker = async () => {
  const worker = await createWorker({
    logger: () => {},
    workerPath: workerPaths.workerPath,
    corePath: workerPaths.corePath,
  });

  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  return worker;
};

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = initWorker();
  }
  return workerPromise;
};

export const shutdownWorker = async () => {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch (error) {
      console.warn('Failed to terminate OCR worker', error);
    }
    workerPromise = null;
  }
};

const normalizeWhitespace = (text) => {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
};

const extractTextFromImage = async (filePath) => {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(filePath);
    return {
      text: normalizeWhitespace(data.text || ''),
      confidence: typeof data.confidence === 'number' ? data.confidence : null,
    };
  } catch (error) {
    console.warn('OCR image extraction failed', error);
    throw error;
  }
};

const extractTextFromPdf = async (filePath) => {
  const buffer = await fs.readFile(filePath);

  const safeDecode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  };

  const parseWithPdf2Json = () =>
    new Promise((resolve, reject) => {
      const parser = new PDFParser();

      parser.on('pdfParser_dataError', (error) => {
        reject(error?.parserError || error);
      });

      parser.on('pdfParser_dataReady', (data) => {
        try {
          if (!data || !Array.isArray(data.Pages)) {
            resolve('');
            return;
          }

          const lines = [];

          for (const page of data.Pages) {
            if (!Array.isArray(page.Texts)) continue;
            for (const textItem of page.Texts) {
              if (!Array.isArray(textItem.R)) continue;
              for (const run of textItem.R) {
                if (!run || typeof run.T !== 'string') continue;
                const decoded = safeDecode(run.T);
                if (decoded.trim().length > 0) {
                  lines.push(decoded);
                }
              }
            }
          }

          resolve(lines.join('\n'));
        } catch (parseError) {
          reject(parseError);
        }
      });

      parser.parseBuffer(buffer);
    });

  try {
    const result = await pdfParse(buffer);
    const text = normalizeWhitespace(result.text || '');

    if (text.length > 0) {
      return {
        text,
        confidence: null,
      };
    }

    const fallbackText = await parseWithPdf2Json();
    return {
      text: normalizeWhitespace(fallbackText || ''),
      confidence: null,
    };
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const details = typeof error?.details === 'string' ? error.details : '';
    const isTokenLengthError =
      message.includes('Command token too long') || details.includes('Command token too long');
    const isBadXrefError =
      message.includes('bad XRef entry') || details.includes('bad XRef entry') || message.includes('FormatError');

    if (isTokenLengthError || isBadXrefError) {
      const reason = isTokenLengthError ? 'token length' : 'bad XRef entry';
      console.warn(`pdf-parse failed due to ${reason}. Falling back to pdf2json.`);
      const fallbackText = await parseWithPdf2Json();
      if (fallbackText && fallbackText.trim().length > 0) {
        return {
          text: normalizeWhitespace(fallbackText),
          confidence: null,
        };
      }
    }

    throw error;
  }
};

const pickMerchant = (lines) => {
  const ignorePatterns = /(receipt|invoice|total|amount|date|time|tax|payment|change)/i;
  for (const line of lines) {
    if (line.length < 3) continue;
    if (ignorePatterns.test(line)) continue;
    const alphaPortion = line.replace(/[^a-zA-Z]/g, '');
    if (alphaPortion.length >= 3) {
      return line;
    }
  }
  return null;
};

const pickAmount = (text, lines) => {
  const keywordRegex = /(?:total|amount due|balance due|grand total|amount)\D*([0-9]+[\.,][0-9]{2})/i;
  let best = null;

  for (const line of lines) {
    const match = line.match(keywordRegex);
    if (match) {
      const numeric = parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isNaN(numeric)) {
        if (!best || numeric >= best.value) {
          best = { value: numeric, source: line };
        }
      }
    }
  }

  if (!best) {
    const fallbackMatch = text.match(/([0-9]+[\.,][0-9]{2})/g);
    if (fallbackMatch) {
      const numeric = Math.max(
        ...fallbackMatch.map((val) => parseFloat(val.replace(/,/g, ''))).filter((val) => !Number.isNaN(val))
      );
      if (Number.isFinite(numeric)) {
        best = { value: numeric, source: null };
      }
    }
  }

  if (!best) return null;

  const currencyMatch = /([£$€₹¥])/.exec(best.source || '');
  const currency = currencyMatch ? currencyMatch[1] : null;

  const currencyMap = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '₹': 'INR',
    '¥': 'JPY',
  };

  return {
    amount: best.value,
    currency: currency ? currencyMap[currency] || null : null,
  };
};

const normalizeDateToISO = (input) => {
  if (!input) return null;
  const separators = /[\/\-.]/;
  const parts = input.split(separators);
  if (parts.length < 3) return null;

  const numbers = parts.map((part) => parseInt(part, 10));
  if (numbers.some((n) => Number.isNaN(n))) return null;

  let year;
  let month;
  let day;

  if (numbers[0] > 31) {
    // YYYY-MM-DD
    [year, month, day] = numbers;
  } else if (numbers[2] > 31) {
    // DD-MM-YYYY or MM-DD-YYYY with four-digit year
    year = numbers[2];
    if (numbers[1] > 12) {
      month = numbers[1];
      day = numbers[0];
    } else if (numbers[0] > 12) {
      month = numbers[1];
      day = numbers[0];
    } else {
      // ambiguous, assume month-day-year (US)
      month = numbers[0];
      day = numbers[1];
    }
  } else {
    // Assume month-day-year
    [month, day, year] = numbers;
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
  }

  if (!year || !month || !day) return null;

  const isoDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(isoDate.getTime())) return null;
  return isoDate.toISOString().split('T')[0];
};

const pickDate = (text) => {
  const patterns = [
    /(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/, // YYYY-MM-DD
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/, // MM-DD-YYYY or DD-MM-YYYY
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const iso = normalizeDateToISO(match[1]);
      if (iso) return iso;
    }
  }

  return null;
};

const detectCategory = (text) => {
  const lowered = text.toLowerCase();
  if (/hotel|stay|lodging|resort/.test(lowered)) return 'Lodging';
  if (/flight|airlines|uber|lyft|taxi|transport|train|bus/.test(lowered)) return 'Travel';
  if (/restaurant|cafe|coffee|food|meal|dining/.test(lowered)) return 'Meals';
  if (/office|suppl(y|ies)|stationery|printer/.test(lowered)) return 'Office Supplies';
  if (/fuel|gas|petrol/.test(lowered)) return 'Fuel';
  if (/software|subscription|license/.test(lowered)) return 'Software';
  return null;
};

const buildDescription = (merchant, category) => {
  if (merchant && category) {
    return `${merchant} - ${category}`.slice(0, 120);
  }
  if (merchant) return merchant.slice(0, 120);
  if (category) return `${category} expense`;
  return 'Expense from receipt';
};

export const analyzeReceipt = async (filePath, mimeType) => {
  const normalizedMime = (mimeType || '').toLowerCase();
  let extraction;

  if (normalizedMime.includes('pdf')) {
    extraction = await extractTextFromPdf(filePath);
  } else if (normalizedMime.startsWith('image/')) {
    extraction = await extractTextFromImage(filePath);
  } else {
    // fallback: try OCR
    extraction = await extractTextFromImage(filePath);
  }

  const text = extraction.text || '';
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const merchant = pickMerchant(lines);
  const amountInfo = pickAmount(text, lines);
  const date = pickDate(text);
  const category = detectCategory(text);
  const description = buildDescription(merchant, category);

  return {
    text,
    confidence: extraction.confidence,
    merchant,
    amount: amountInfo?.amount ?? null,
    currency: amountInfo?.currency ?? null,
    date,
    category,
    description,
  };
};

process.on('exit', () => {
  if (workerPromise) {
    shutdownWorker().catch(() => {});
  }
});

process.on('SIGINT', () => {
  shutdownWorker()
    .catch(() => {})
    .finally(() => process.exit(0));
});
