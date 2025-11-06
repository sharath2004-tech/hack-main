import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseCategory'
  },
  paidBy: {
    type: String,
    required: true,
    default: 'Cash'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  remarks: {
    type: String,
    trim: true
  },
  receiptUrl: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

expenseSchema.index({ companyId: 1, userId: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ date: -1 });

export default mongoose.model('Expense', expenseSchema);