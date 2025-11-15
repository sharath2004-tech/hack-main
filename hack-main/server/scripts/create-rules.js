import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ApprovalRule from '../models/ApprovalRule.js';
import User from '../models/User.js';
import Company from '../models/Company.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const createRules = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'expense-management'
    });

    const company = await Company.findOne();
    if (!company) {
      console.log('No company found');
      process.exit(1);
    }

    const admin = await User.findOne({ companyId: company._id, role: 'admin' });
    const manager = await User.findOne({ companyId: company._id, role: 'manager' });

    if (!admin) {
      console.log('No admin found');
      process.exit(1);
    }

    // Clear existing rules
    await ApprovalRule.deleteMany({ companyId: company._id });

    // Rule 1: Admin approval required
    await ApprovalRule.create({
      companyId: company._id,
      ruleName: 'Admin Approval Required',
      description: 'All expenses must be approved by an admin',
      ruleType: 'specific',
      approvers: [],
      minApprovalPercentage: 0,
      specificApproverRequired: admin._id,
      approverSequence: [{ approverId: admin._id, order: 1 }]
    });

    // Rule 2: Manager approval for small expenses
    if (manager) {
      await ApprovalRule.create({
        companyId: company._id,
        ruleName: 'Manager Approval',
        description: 'Manager can approve routine expenses',
        ruleType: 'specific',
        approvers: [],
        minApprovalPercentage: 0,
        specificApproverRequired: manager._id,
        approverSequence: [{ approverId: manager._id, order: 1 }]
      });
    }

    // Rule 3: Any admin or manager (50% threshold)
    const approvers = [admin._id];
    if (manager) approvers.push(manager._id);

    await ApprovalRule.create({
      companyId: company._id,
      ruleName: 'Standard Approval',
      description: 'Any manager or admin can approve',
      ruleType: 'percentage',
      approvers: approvers,
      minApprovalPercentage: 50,
      specificApproverRequired: null,
      approverSequence: approvers.map((id, index) => ({ approverId: id, order: index + 1 }))
    });

    console.log('Created 3 approval rules successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createRules();