import mongoose from 'mongoose';

const approvalRuleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  ruleName: { type: String, required: true },
  description: { type: String, default: '' },
  ruleType: { type: String, enum: ['percentage', 'specific', 'hybrid'], default: 'percentage' },
  approvers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  minApprovalPercentage: { type: Number, default: 0, min: 0, max: 100 },
  specificApproverRequired: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approverSequence: [{
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: Number, required: true }
  }]
}, { timestamps: true });

approvalRuleSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model('ApprovalRule', approvalRuleSchema);
