import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema({
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: true
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sequenceOrder: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'escalated'],
    default: 'pending'
  },
  comments: {
    type: String,
    trim: true
  },
  approvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

approvalSchema.index({ expenseId: 1, approverId: 1 }, { unique: true });
approvalSchema.index({ approverId: 1, status: 1 });

export default mongoose.model('Approval', approvalSchema);