import { createWorker } from 'tesseract.js';

let worker = null;

const getWorker = async () => {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
};

export const analyzeReceipt = async (imagePath) => {
  try {
    const tesseractWorker = await getWorker();
    const result = await tesseractWorker.recognize(imagePath);
    const text = result.data.text;
    const confidence = result.data.confidence;
    const amountRegex = /\$?\d+[.,]\d{2}/g;
    const amounts = text.match(amountRegex) || [];
    const dateRegex = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
    const dates = text.match(dateRegex) || [];
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const merchant = lines.length > 0 ? lines[0].trim() : null;
    return { text, amounts: amounts.map(a => a.replace(/[,$]/g, '')), dates, merchant, confidence };
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