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
import { shutdownWorker } from './lib/receiptParser.js';
import { authMiddleware } from './middleware/auth.js';
import AuditLog from './models/AuditLog.js';
import Company from './models/Company.js';
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

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role, companyName, country, defaultCurrency, adminSignupKey } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    
    let companyId;
    if (role === 'admin') {
      // Admin signup requires admin key and company creation
      if (adminSignupKey !== process.env.ADMIN_SIGNUP_KEY) {
        return res.status(403).json({ error: 'Invalid admin signup key' });
      }
      if (!companyName || !country || !defaultCurrency) {
        return res.status(400).json({ error: 'Company details required for admin signup' });
      }
      const company = await Company.create({ name: companyName, country, defaultCurrency });
      companyId = company._id;
    } else {
      // For employee/manager signup, find an existing company
      // If no companies exist, require them to create one as admin first
      const companies = await Company.find().limit(1);
      if (companies.length === 0) {
        return res.status(400).json({ error: 'No company exists. Please contact an admin or sign up as admin first.' });
      }
      // Use the first company (in a real app, you'd let users select or provide a company code)
      companyId = companies[0]._id;
    }
    
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
