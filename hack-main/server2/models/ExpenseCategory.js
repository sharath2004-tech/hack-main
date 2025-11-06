import mongoose from 'mongoose';

const expenseCategorySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

expenseCategorySchema.index({ companyId: 1, name: 1 }, { unique: true });

export default mongoose.model('ExpenseCategory', expenseCategorySchema);