import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';

let worker = null;

const getWorker = async () => {
  if (!worker) {
    worker = await createWorker('eng');
    // Slightly nudge OCR behavior for receipts
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300'
    });
  }
  return worker;
};

const normalizeAmount = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/[, ]/g, '').replace(/[A-Za-z$€£₹]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const monthMap = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const tryParseDate = (text) => {
  if (!text) return null;
  // 1) 2025-11-14 or 2025/11/14
  const iso = text.match(/\b(20\d{2})[\/-](0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;

  // 2) 14/11/2025 or 11/14/2025 (ambiguous). Prefer dd/mm/yyyy when both <=12 with keywords
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](\d{2,4})\b/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`;
  }

  const mdy = text.match(/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](\d{2,4})\b/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${String(mdy[1]).padStart(2,'0')}-${String(mdy[2]).padStart(2,'0')}`;
  }

  // 3) 14 Nov 2025 / Nov 14, 2025
  const mon = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})\b|\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (mon) {
    // Two alternative groups
    if (mon[1] && mon[2] && mon[3]) {
      const d = mon[1];
      const m = (monthMap[mon[2].slice(0,3).toLowerCase()] || '').padStart(2,'0');
      const y = mon[3].length === 2 ? `20${mon[3]}` : mon[3];
      if (m) return `${y}-${m}-${String(d).padStart(2,'0')}`;
    } else if (mon[4] && mon[5] && mon[6]) {
      const m = (monthMap[mon[4].slice(0,3).toLowerCase()] || '').padStart(2,'0');
      const d = mon[5];
      const y = mon[6].length === 2 ? `20${mon[6]}` : mon[6];
      if (m) return `${y}-${m}-${String(d).padStart(2,'0')}`;
    }
  }
  return null;
};

const extractFieldsFromText = (rawText) => {
  const text = (rawText || '').replace(/\u00A0/g, ' ').replace(/[\t\r]+/g, ' ');
  const lines = text
    .split(/\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Currency detection
  let currency = null;
  if (/[₹]/.test(text)) currency = 'INR';
  else if (/[€]/.test(text)) currency = 'EUR';
  else if (/[£]/.test(text)) currency = 'GBP';
  else if (/[\$]/.test(text)) currency = 'USD';
  else {
    const iso = text.match(/\b(USD|EUR|GBP|INR|CAD|AUD|SGD|JPY)\b/i);
    if (iso) currency = iso[1].toUpperCase();
  }

  // Amount near TOTAL/AMOUNT DUE/etc.
  let amount = null;
  let amountScore = 0;
  const amountLine = lines.find((l) => /(grand\s*total|amount\s*due|total\b|balance\s*due)/i.test(l));
  if (amountLine) {
    const m = amountLine.match(/([€£₹$]?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/);
    amount = normalizeAmount(m?.[1] || '');
    if (amount !== null) amountScore = 0.7;
  }
  if (amount === null) {
    const m = text.match(/([€£₹$]?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})(?!(?:[\d,\.]))/);
    amount = normalizeAmount(m?.[1] || '');
    if (amount !== null) amountScore = Math.max(amountScore, 0.4);
  }

  // Date extraction
  let date = null;
  for (const l of lines) {
    date = tryParseDate(l);
    if (date) break;
  }

  // Merchant: top meaningful line not containing common headers
  const blacklist = /(receipt|invoice|tax\s*invoice|gst|thank you|total|amount|date|cashier|order|transaction|pos|merchant|store\s*id)/i;
  let merchant = null;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const l = lines[i];
    if (!blacklist.test(l) && /[A-Za-z]/.test(l)) {
      merchant = l.replace(/\s{2,}/g, ' ').slice(0, 80);
      break;
    }
  }

  // Confidence heuristic
  let confidence = 50;
  if (amount !== null) confidence += amountScore * 30;
  if (date) confidence += 10;
  if (merchant) confidence += 10;
  confidence = Math.max(1, Math.min(99, Math.round(confidence)));

  // Description suggestion
  let description = merchant || (lines[0] || '').slice(0, 120);

  return { text, merchant, amount, currency, date, description, confidence };
};

export const analyzeReceipt = async (imagePath) => {
  try {
    // If PDF, extract text using pdf-parse instead of OCR
    if (imagePath.toLowerCase().endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(imagePath);
      const parser = new PDFParse({ data: dataBuffer });
      const pdfTextResult = await parser.getText();
      const text = pdfTextResult?.text || '';
      await parser.destroy?.();
      const parsed = extractFieldsFromText(text);
      return { ...parsed, info: 'Parsed from PDF (text extraction)' };
    }
    
    const tesseractWorker = await getWorker();
    const result = await tesseractWorker.recognize(imagePath);
    const text = result.data.text || '';
    const baseConfidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 50;
    const parsed = extractFieldsFromText(text);
    // Blend OCR confidence with heuristic score
    const confidence = Math.round((parsed.confidence * 0.5) + (Math.max(1, Math.min(99, baseConfidence)) * 0.5));
    return { ...parsed, confidence };
  } catch (error) {
    console.error('Receipt analysis error:', error);
    return { text: '', amounts: [], dates: [], merchant: null, confidence: 0, error: error.message };
  }
};

export const shutdownWorker = async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
};