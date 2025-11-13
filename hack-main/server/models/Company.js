import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  country: { type: String, required: true },
  defaultCurrency: { type: String, default: 'USD' }
}, { timestamps: true });

export default mongoose.model('Company', companySchema);
