import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import connectDB from './config/database.js';
import Company from './models/Company.js';
import User from './models/User.js';
import Expense from './models/Expense.js';
import ExpenseCategory from './models/ExpenseCategory.js';
import Approval from './models/Approval.js';
import Notification from './models/Notification.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).populate('companyId');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control
const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'mongodb' });
});

// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, country, role = 'employee' } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    let company = await Company.findOne();
    if (!company) {
      company = new Company({
        name: `${name}'s Company`,
        country,
        defaultCurrency: country === 'United Kingdom' ? 'GBP' : 'USD'
      });
      await company.save();

      // Create default categories
      const categories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other'];
      for (const categoryName of categories) {
        const category = new ExpenseCategory({
          companyId: company._id,
          name: categoryName
        });
        await category.save();
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      companyId: company._id,
      name,
      email,
      passwordHash,
      role: company ? role : 'admin'
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      companyId: req.user.companyId
    }
  });
});

// Expense categories
app.get('/api/expense-categories', authMiddleware, async (req, res) => {
  try {
    const categories = await ExpenseCategory.find({ companyId: req.user.companyId });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses
app.post('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const { description, date, categoryId, paidBy, amount, currency, remarks } = req.body;

    const expense = new Expense({
      companyId: req.user.companyId,
      userId: req.user._id,
      description,
      date,
      categoryId,
      paidBy: paidBy || 'Cash',
      amount: parseFloat(amount),
      currency,
      remarks
    });

    await expense.save();

    // Create approval for managers/admins
    const approvers = await User.find({
      companyId: req.user.companyId,
      role: { $in: ['manager', 'admin'] },
      _id: { $ne: req.user._id }
    });

    for (const approver of approvers) {
      const approval = new Approval({
        expenseId: expense._id,
        approverId: approver._id
      });
      await approval.save();

      // Create notification
      const notification = new Notification({
        userId: approver._id,
        title: 'New Expense Approval',
        message: `${req.user.name} submitted an expense for ${currency} ${amount}`,
        type: 'approval',
        relatedEntityId: expense._id
      });
      await notification.save();
    }

    res.status(201).json({ expense });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/expenses/mine', authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id })
      .populate('categoryId')
      .sort({ createdAt: -1 });
    res.json({ expenses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approvals
app.get('/api/approvals/pending', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const approvals = await Approval.find({
      approverId: req.user._id,
      status: 'pending'
    })
    .populate({
      path: 'expenseId',
      populate: {
        path: 'userId',
        select: 'name email'
      }
    })
    .sort({ createdAt: -1 });

    res.json({ approvals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/:id/decision', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { status, comments } = req.body;
    
    const approval = await Approval.findById(req.params.id).populate('expenseId');
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    approval.status = status;
    approval.comments = comments;
    approval.approvedAt = new Date();
    await approval.save();

    // Update expense status
    const expense = await Expense.findById(approval.expenseId._id);
    expense.status = status;
    await expense.save();

    // Notify expense submitter
    const notification = new Notification({
      userId: expense.userId,
      title: `Expense ${status}`,
      message: `Your expense has been ${status}`,
      type: status === 'approved' ? 'approval' : 'rejection',
      relatedEntityId: expense._id
    });
    await notification.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`MongoDB ExpenseTracker API running on port ${PORT}`);
});