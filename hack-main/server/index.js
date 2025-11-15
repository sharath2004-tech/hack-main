import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/database.js';
import { convertCurrency, fetchRates } from './lib/currencyRates.js';
import { analyzeReceipt, shutdownWorker } from './lib/receiptParser.js';
import { assertRole, authMiddleware } from './middleware/auth.js';
import Approval from './models/Approval.js';
import ApprovalRule from './models/ApprovalRule.js';
import AuditLog from './models/AuditLog.js';
import Company from './models/Company.js';
import Expense from './models/Expense.js';
import ExpenseCategory from './models/ExpenseCategory.js';
import Notification from './models/Notification.js';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the server directory with absolute path
const envPath = path.resolve(__dirname, '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('Error loading .env:', result.error);
} else {
  console.log('.env loaded successfully');
}

console.log('Loaded ADMIN_SIGNUP_KEY:', process.env.ADMIN_SIGNUP_KEY);
console.log('Loaded MONGO_URI:', process.env.MONGO_URI?.substring(0, 30) + '...');

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Configure multer for receipt uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'receipts');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `receipt-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only image files and PDFs are allowed'));
  }
});

// Helper functions
async function createAuditLog(userId, companyId, action, entityType, entityId, details = {}) {
  try {
    await AuditLog.create({ userId, companyId, action, entityType, entityId, details });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

async function createNotification(userId, title, message, type = 'info', relatedEntityId = null) {
  try {
    await Notification.create({ userId, title, message, type, relatedEntityId });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

function mapCompany(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    country: doc.country,
    default_currency: doc.defaultCurrency,
    created_at: doc.createdAt,
  };
}

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role, companyName, country, defaultCurrency, adminSignupKey } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    
    // Check if any companies exist
    let company = await Company.findOne();
    
    if (!company) {
      // First user becomes admin and creates company
      if (role !== 'admin') {
        return res.status(400).json({ error: 'First user must be admin to create company' });
      }
      if (adminSignupKey !== process.env.ADMIN_SIGNUP_KEY) {
        return res.status(403).json({ error: 'Invalid admin signup key' });
      }
      
      company = await Company.create({
        name: companyName || `${name}'s Company`,
        country: country || 'India',
        defaultCurrency: defaultCurrency || 'INR'
      });
      
      // Create default categories
      const categories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other'];
      for (const categoryName of categories) {
        await ExpenseCategory.create({
          companyId: company._id,
          name: categoryName
        });
      }
    } else {
      // Company exists, validate admin signup if needed
      if (role === 'admin' && adminSignupKey !== process.env.ADMIN_SIGNUP_KEY) {
        return res.status(403).json({ error: 'Invalid admin signup key' });
      }
    }
    
    const companyId = company._id;
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ companyId, name, email: email.toLowerCase(), passwordHash, role });
    await createAuditLog(user._id, companyId, 'USER_CREATED', 'User', user._id, { email, role });
    
    res.status(201).json({ message: 'User created successfully', user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    
    const user = await User.findOne({ email: email.toLowerCase() }).populate('companyId');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ userId: user._id, role: user.role, companyId: user.companyId._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    await createAuditLog(user._id, user.companyId._id, 'USER_LOGIN', 'User', user._id, { email });
    
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, company: { id: user.companyId._id, name: user.companyId.name, country: user.companyId.country, defaultCurrency: user.companyId.defaultCurrency } } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, company: { id: req.user.companyId._id, name: req.user.companyId.name, country: req.user.companyId.country, defaultCurrency: req.user.companyId.defaultCurrency } } });
});

// Expense Category Routes
app.get('/api/expense-categories', authMiddleware, async (req, res) => {
  try {
    const categories = await ExpenseCategory.find({ companyId: req.user.companyId._id }).sort({ name: 1 });
    const payload = categories.map((c) => ({
      id: c._id,
      company_id: c.companyId,
      name: c.name,
      created_at: c.createdAt,
    }));
    res.json({ categories: payload });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/expense-categories', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    
    const category = await ExpenseCategory.create({ companyId: req.user.companyId._id, name });
    await createAuditLog(req.user._id, req.user.companyId._id, 'CATEGORY_CREATED', 'ExpenseCategory', category._id, { name });
    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Category already exists' });
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Expense Routes
app.get('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const { status, categoryId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = { companyId: req.user.companyId._id };
    
    if (req.user.role === 'employee') {
      query.userId = req.user._id;
    } else if (req.user.role === 'manager') {
      const teamMembers = await User.find({ managerId: req.user._id }).select('_id');
      const teamIds = teamMembers.map(u => u._id);
      query.$or = [{ userId: req.user._id }, { userId: { $in: teamIds } }];
    }
    
    if (status) query.status = status;
    if (categoryId) query.categoryId = categoryId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(query).populate('userId', 'name email').populate('categoryId', 'name').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Expense.countDocuments(query)
    ]);
    
    res.json({ expenses, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/expenses', authMiddleware, upload.single('receipt'), async (req, res) => {
  try {
    // Accept both camelCase and snake_case from clients
    const description = req.body.description;
    const date = req.body.date;
    const categoryId = req.body.categoryId || req.body.category_id;
    const paidBy = req.body.paidBy || req.body.paid_by || 'Cash';
    const amount = req.body.amount;
    const currency = req.body.currency;
    const remarks = req.body.remarks;

    if (!description || !date || !categoryId || !amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : null;
    const expense = await Expense.create({
      companyId: req.user.companyId._id,
      userId: req.user._id,
      description,
      date: new Date(date),
      categoryId,
      paidBy: paidBy || 'Cash',
      amount: parseFloat(amount),
      currency,
      remarks,
      receiptUrl,
      status: 'pending'
    });
    
    await createAuditLog(req.user._id, req.user.companyId._id, 'EXPENSE_CREATED', 'Expense', expense._id, { amount, currency, description });
    
    // Find all managers and admins in the company (except the submitter)
    const approvers = await User.find({ 
      companyId: req.user.companyId._id, 
      role: { $in: ['manager', 'admin'] },
      _id: { $ne: req.user._id }
    });
    
    if (approvers.length > 0) {
      // Create approval for the first available approver
      const primaryApprover = approvers[0];
      await Approval.create({ expenseId: expense._id, approverId: primaryApprover._id, sequenceOrder: 1, status: 'pending' });
      await createNotification(primaryApprover._id, 'New Expense Awaiting Approval', `${req.user.name} submitted an expense: ${description} (${currency} ${amount})`, 'approval', expense._id);
      console.log(`Approval created for expense ${expense._id} with approver ${primaryApprover._id}`);
    } else {
      // No approvers found, create approval without specific approver
      await Approval.create({ expenseId: expense._id, approverId: null, sequenceOrder: 1, status: 'pending' });
      console.log(`Approval created for expense ${expense._id} without specific approver - admin review needed`);
    }
    
    const populatedExpense = await Expense.findById(expense._id).populate('userId', 'name email').populate('categoryId', 'name');
    res.status(201).json({ expense: populatedExpense });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/expenses/mine', authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id })
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 });
    
    const formattedExpenses = expenses.map(exp => ({
      id: exp._id,
      company_id: exp.companyId,
      user_id: exp.userId,
      description: exp.description,
      date: exp.date,
      category_id: exp.categoryId?._id,
      paid_by: exp.paidBy,
      amount: exp.amount,
      currency: exp.currency,
      remarks: exp.remarks,
      receipt_url: exp.receiptUrl,
      status: exp.status,
      created_at: exp.createdAt,
      updated_at: exp.updatedAt
    }));
    
    res.json({ expenses: formattedExpenses });
  } catch (error) {
    console.error('Get my expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, companyId: req.user.companyId._id }).populate('userId', 'name email').populate('categoryId', 'name');
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    
    if (req.user.role === 'employee' && expense.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const approvals = await Approval.find({ expenseId: expense._id }).populate('approverId', 'name email').sort({ sequenceOrder: 1 });
    res.json({ expense, approvals });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approval Routes
app.get('/api/approvals/pending', authMiddleware, async (req, res) => {
  try {
    let query;
    
    if (req.user.role === 'admin') {
      // Admins see ALL approvals in their company
      query = {};
    } else if (req.user.role === 'manager') {
      // Managers see ALL approvals in their company
      query = {};
    } else {
      // Employees see only their assigned approvals
      query = { approverId: req.user._id };
    }
    
    const approvals = await Approval.find(query).populate({ 
      path: 'expenseId', 
      match: { companyId: req.user.companyId._id },
      populate: [{ path: 'userId', select: 'name email' }, { path: 'categoryId', select: 'name' }] 
    }).sort({ createdAt: -1 });
    
    // Filter out user's own expenses and invalid approvals
    const validApprovals = approvals.filter(a => 
      a.expenseId && a.expenseId.userId._id.toString() !== req.user._id.toString()
    );
    
    // Sort by status: pending first, then others
    validApprovals.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    // Map to match frontend expectations
    const formattedApprovals = validApprovals.map(approval => ({
      id: approval._id,
      expense_id: approval.expenseId._id,
      approver_id: approval.approverId,
      sequence_order: approval.sequenceOrder,
      status: approval.status,
      comments: approval.comments,
      approved_at: approval.approvedAt,
      created_at: approval.createdAt,
      expense: {
        id: approval.expenseId._id,
        description: approval.expenseId.description,
        date: approval.expenseId.date,
        category_id: approval.expenseId.categoryId?._id,
        paid_by: approval.expenseId.paidBy,
        amount: approval.expenseId.amount,
        currency: approval.expenseId.currency,
        remarks: approval.expenseId.remarks,
        receipt_url: approval.expenseId.receiptUrl,
        status: approval.expenseId.status
      },
      requester: {
        id: approval.expenseId.userId._id,
        name: approval.expenseId.userId.name
      }
    }));
    
    res.json({ approvals: formattedApprovals });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/approvals/:id/decision', authMiddleware, async (req, res) => {
  try {
    const { decision, status, comments } = req.body;
    const approvalDecision = decision || status;
    if (!['approved', 'rejected'].includes(approvalDecision)) {
      return res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
    }
    
    let approval;
    if (req.user.role === 'admin') {
      // Admins can approve any pending approval in their company
      approval = await Approval.findOne({ 
        _id: req.params.id, 
        status: 'pending'
      }).populate({
        path: 'expenseId',
        match: { companyId: req.user.companyId._id }
      });
    } else if (req.user.role === 'manager') {
      // Managers can approve any pending approval in their company
      approval = await Approval.findOne({ 
        _id: req.params.id,
        status: 'pending'
      }).populate({
        path: 'expenseId',
        match: { companyId: req.user.companyId._id }
      });
    } else {
      // Employees can only approve their assigned approvals
      approval = await Approval.findOne({ 
        _id: req.params.id, 
        approverId: req.user._id,
        status: 'pending'
      }).populate('expenseId');
    }
    
    if (!approval || !approval.expenseId) return res.status(404).json({ error: 'Approval not found' });
    
    const expense = approval.expenseId;
    if (expense.status !== 'pending') return res.status(400).json({ error: 'Expense is not pending' });
    
    approval.status = approvalDecision;
    approval.comments = comments;
    approval.approvedAt = new Date();
    await approval.save();
    
    await createAuditLog(req.user._id, req.user.companyId._id, approvalDecision === 'approved' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED', 'Approval', approval._id, { expenseId: expense._id, comments });
    
    if (approvalDecision === 'rejected') {
      expense.status = 'rejected';
      await expense.save();
      await createNotification(expense.userId, 'Expense Rejected', `Your expense "${expense.description}" was rejected by ${req.user.name}. ${comments ? `Reason: ${comments}` : ''}`, 'rejection', expense._id);
    } else {
      const allApprovals = await Approval.find({ expenseId: expense._id });
      if (allApprovals.every(a => a.status === 'approved')) {
        expense.status = 'approved';
        await expense.save();
        await createNotification(expense.userId, 'Expense Approved', `Your expense "${expense.description}" has been approved!`, 'approval', expense._id);
      }
    }
    
    res.json({ message: 'Approval recorded', approval, expense });
  } catch (error) {
    console.error('Approval decision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notification Routes
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const query = { userId: req.user._id };
    if (unreadOnly === 'true') query.read = false;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Notification.countDocuments(query)
    ]);
    
    res.json({ notifications, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    
    notification.read = true;
    await notification.save();
    res.json({ notification });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Receipt OCR Route
app.post('/api/receipts/analyze', authMiddleware, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Receipt file is required' });
    
    const analysis = await analyzeReceipt(req.file.path);
    res.json({ receiptUrl: `/uploads/receipts/${req.file.filename}`, analysis });
  } catch (error) {
    console.error('Analyze receipt error:', error);
    res.status(500).json({ error: 'Failed to analyze receipt' });
  }
});

// Company Routes
app.get('/api/company/profile', authMiddleware, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId._id);
    res.json({ company: mapCompany(company) });
  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Currency Routes
app.get('/api/currency/convert', authMiddleware, async (req, res) => {
  try {
    const { from, to, amount } = req.query;
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'Query params from, to, amount are required' });
    }
    
    const fromCurrency = String(from).toUpperCase();
    const toCurrency = String(to).toUpperCase();
    const amountValue = parseFloat(amount);
    
    if (isNaN(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const conv = await convertCurrency(amountValue, fromCurrency, toCurrency);
    return res.json({ quote: {
      base: conv.from,
      target: conv.to,
      rate: conv.rate,
      amount: Number(conv.amount),
      converted_amount: conv.converted,
      updated_at: new Date().toISOString(),
      provider: 'ExchangeRate-API'
    }});
  } catch (error) {
    console.error('Currency convert error:', error);
    res.status(500).json({ error: error.message || 'Failed to convert currency' });
  }
});

app.get('/api/currency/rates', authMiddleware, async (req, res) => {
  try {
    const base = (req.query.base || 'USD').toString().toUpperCase();
    const rates = await fetchRates(base);
    res.json(rates);
  } catch (error) {
    console.error('Currency rates error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch currency rates' });
  }
});

app.get('/api/company', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId._id);
    res.json({ company: mapCompany(company) });
  } catch (error) {
    console.error('Get company settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/company', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { name, country } = req.body;
    const defaultCurrency = req.body.defaultCurrency || req.body.default_currency;
    const company = await Company.findById(req.user.companyId._id);
    
    if (name !== undefined) company.name = name;
    if (country !== undefined) company.country = country;
    if (defaultCurrency !== undefined) company.defaultCurrency = defaultCurrency;
    
    await company.save();
    await createAuditLog(req.user._id, req.user.companyId._id, 'COMPANY_UPDATED', 'Company', company._id, { changes: req.body });
    
    res.json({ company });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Management Routes (Admin)
app.get('/api/users', authMiddleware, assertRole(['admin', 'manager']), async (req, res) => {
  try {
    const users = await User.find({ companyId: req.user.companyId._id }).select('-passwordHash').populate('managerId', 'name email').sort({ name: 1 });
    const formattedUsers = users.map(user => ({
      id: user._id,
      company_id: user.companyId,
      name: user.name,
      email: user.email,
      role: user.role,
      manager_id: user.managerId,
      created_at: user.createdAt
    }));
    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { name, email, password, role, managerId } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ companyId: req.user.companyId._id, name, email: email.toLowerCase(), passwordHash, role, managerId: managerId || null });
    
    await createAuditLog(req.user._id, req.user.companyId._id, 'USER_CREATED', 'User', user._id, { email, role });
    
    const userResponse = await User.findById(user._id).select('-passwordHash').populate('managerId', 'name email');
    res.status(201).json({ user: userResponse });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/users/:id', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { name, email, role, managerId, password } = req.body;
    const user = await User.findOne({ _id: req.params.id, companyId: req.user.companyId._id });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email.toLowerCase();
    if (role !== undefined) user.role = role;
    if (managerId !== undefined) user.managerId = managerId;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    
    await user.save();
    await createAuditLog(req.user._id, req.user.companyId._id, 'USER_UPDATED', 'User', user._id, { changes: req.body });
    
    const userResponse = await User.findById(user._id).select('-passwordHash').populate('managerId', 'name email');
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, companyId: req.user.companyId._id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const expenseCount = await Expense.countDocuments({ userId: user._id });
    if (expenseCount > 0) {
      return res.status(400).json({ error: 'Cannot delete user with existing expenses' });
    }
    
    await User.deleteOne({ _id: user._id });
    await createAuditLog(req.user._id, req.user.companyId._id, 'USER_DELETED', 'User', user._id, { email: user.email });
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approval Rules Routes
app.get('/api/approval-rules', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const rules = await ApprovalRule.find({ companyId: req.user.companyId._id })
      .populate('approvers', 'name email role')
      .populate('specificApproverRequired', 'name email role')
      .sort({ createdAt: -1 });
    
    const formattedRules = rules.map(rule => ({
      id: rule._id,
      company_id: rule.companyId,
      rule_name: rule.ruleName,
      description: rule.description,
      rule_type: rule.ruleType,
      approvers: rule.approvers.map(a => a._id),
      min_approval_percentage: rule.minApprovalPercentage,
      specific_approver_required: rule.specificApproverRequired?._id || null,
      approver_sequence: rule.approverSequence.map(seq => ({
        approver_id: seq.approverId,
        order: seq.order
      })),
      created_at: rule.createdAt
    }));
    
    res.json({ rules: formattedRules });
  } catch (error) {
    console.error('Get approval rules error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/approval-rules', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { rule_name, description, rule_type, approvers, min_approval_percentage, specific_approver_required, approver_sequence } = req.body;
    
    if (!rule_name || !rule_type) {
      return res.status(400).json({ error: 'Rule name and type are required' });
    }
    
    const rule = await ApprovalRule.create({
      companyId: req.user.companyId._id,
      ruleName: rule_name,
      description: description || '',
      ruleType: rule_type,
      approvers: approvers || [],
      minApprovalPercentage: min_approval_percentage || 0,
      specificApproverRequired: specific_approver_required || null,
      approverSequence: (approver_sequence || []).map(seq => ({
        approverId: seq.approver_id,
        order: seq.order
      }))
    });
    
    await createAuditLog(req.user._id, req.user.companyId._id, 'APPROVAL_RULE_CREATED', 'ApprovalRule', rule._id, { ruleName: rule_name });
    
    res.status(201).json({ rule });
  } catch (error) {
    console.error('Create approval rule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/approval-rules/:id', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const { rule_name, description, rule_type, approvers, min_approval_percentage, specific_approver_required, approver_sequence } = req.body;
    
    const rule = await ApprovalRule.findOne({ _id: req.params.id, companyId: req.user.companyId._id });
    if (!rule) return res.status(404).json({ error: 'Approval rule not found' });
    
    if (rule_name !== undefined) rule.ruleName = rule_name;
    if (description !== undefined) rule.description = description;
    if (rule_type !== undefined) rule.ruleType = rule_type;
    if (approvers !== undefined) rule.approvers = approvers;
    if (min_approval_percentage !== undefined) rule.minApprovalPercentage = min_approval_percentage;
    if (specific_approver_required !== undefined) rule.specificApproverRequired = specific_approver_required;
    if (approver_sequence !== undefined) rule.approverSequence = approver_sequence;
    
    await rule.save();
    await createAuditLog(req.user._id, req.user.companyId._id, 'APPROVAL_RULE_UPDATED', 'ApprovalRule', rule._id, { changes: req.body });
    
    res.json({ rule });
  } catch (error) {
    console.error('Update approval rule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/approval-rules/:id', authMiddleware, assertRole(['admin']), async (req, res) => {
  try {
    const rule = await ApprovalRule.findOne({ _id: req.params.id, companyId: req.user.companyId._id });
    if (!rule) return res.status(404).json({ error: 'Approval rule not found' });
    
    await ApprovalRule.deleteOne({ _id: rule._id });
    await createAuditLog(req.user._id, req.user.companyId._id, 'APPROVAL_RULE_DELETED', 'ApprovalRule', rule._id, { ruleName: rule.ruleName });
    
    res.json({ message: 'Approval rule deleted successfully' });
  } catch (error) {
    console.error('Delete approval rule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Audit Logs Routes
app.get('/api/audit-logs', authMiddleware, assertRole(['admin', 'manager']), async (req, res) => {
  try {
    const { action, entityType, userId } = req.query;
    const query = { companyId: req.user.companyId._id };
    
    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (userId) query.userId = userId;
    
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(200);
    
    const formattedLogs = logs.map(log => ({
      id: log._id,
      company_id: log.companyId,
      user_id: log.userId,
      action: log.action,
      entity_type: log.entityType,
      entity_id: log.entityId,
      details: log.details,
      created_at: log.createdAt
    }));
    
    res.json({ logs: formattedLogs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/audit-logs/users', authMiddleware, assertRole(['admin', 'manager']), async (req, res) => {
  try {
    const users = await User.find({ companyId: req.user.companyId._id })
      .select('_id name')
      .sort({ name: 1 });
    
    const formattedUsers = users.map(u => ({
      id: u._id,
      name: u.name
    }));
    
    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('Get audit users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check approval status
app.get('/api/debug/approvals', authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ companyId: req.user.companyId._id })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);
    
    const approvals = await Approval.find({ 
      expenseId: { $in: expenses.map(e => e._id) }
    }).populate('approverId', 'name email');
    
    const users = await User.find({ companyId: req.user.companyId._id })
      .select('name email role managerId');
    
    res.json({ 
      expenses: expenses.map(e => ({
        id: e._id,
        description: e.description,
        amount: e.amount,
        status: e.status,
        userId: e.userId._id,
        userName: e.userId.name,
        createdAt: e.createdAt
      })),
      approvals: approvals.map(a => ({
        id: a._id,
        expenseId: a.expenseId,
        approverId: a.approverId,
        approverName: a.approverId ? a.approverId.name : 'No Approver',
        status: a.status,
        createdAt: a.createdAt
      })),
      users: users.map(u => ({
        id: u._id,
        name: u.name,
        role: u.role,
        managerId: u.managerId
      }))
    });
  } catch (error) {
    console.error('Debug approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    console.log(' MongoDB connected');
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await shutdownWorker();
  process.exit(0);
});

startServer();
