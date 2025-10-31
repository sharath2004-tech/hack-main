import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import multer from 'multer';
import { createPool } from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertCurrency, getActiveCurrencyProvider, listSupportedCurrencies } from './lib/currencyRates.js';
import { analyzeReceipt, shutdownWorker } from './lib/receiptParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnv = () => {
  const potentialPaths = [
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];

  for (const envPath of potentialPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
};

loadEnv();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'ADMIN_SIGNUP_KEY'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;

const uploadsRoot = path.join(__dirname, 'uploads');
const receiptsDir = path.join(uploadsRoot, 'receipts');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir(uploadsRoot);
ensureDir(receiptsDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, receiptsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadReceipt = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const removeFileQuietly = async (filePath) => {
  if (!filePath) return;
  try {
    await fsPromises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to remove file ${filePath}`, error);
    }
  }
};

const pool = createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
});

const app = express();

const currencyProviderMeta = getActiveCurrencyProvider();
console.log(
  `Using ${currencyProviderMeta.label} for FX rates${
    currencyProviderMeta.requiresKey ? ' (API key configured)' : ''
  }`
);

const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length === 0 ? '*' : allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsRoot));

const mapUserRow = (row) => ({
  id: row.id,
  company_id: row.company_id,
  name: row.name,
  email: row.email,
  role: row.role,
  manager_id: row.manager_id,
  created_at: row.created_at,
});

const sanitizeUser = (row) => mapUserRow(row);

const createToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      companyId: user.company_id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const attachUser = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.auth.userId]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    req.user = mapUserRow(rows[0]);
    next();
  } catch (error) {
    next(error);
  }
};

const assertRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const currentSqlTimestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const VALID_RULE_TYPES = new Set(['percentage', 'specific', 'hybrid']);

const normalizeApproverList = (value) => {
  const parsed = parseJsonField(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const unique = new Set();
  for (const entry of parsed) {
    if (!entry) continue;
    const normalized = String(entry).trim();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
};

const parseApproverSequence = (value) => {
  const parsed = parseJsonField(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const interim = [];

  for (const entry of parsed) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      interim.push({ approver_id: String(entry).trim(), order: interim.length + 1 });
      continue;
    }
    const id = entry.approver_id ?? entry.id ?? entry.user_id ?? entry.value;
    if (!id) continue;
    const normalizedId = String(id).trim();
    if (!normalizedId) continue;
    const rawOrder = Number(entry.order ?? entry.sequence ?? entry.step ?? interim.length + 1);
    const order = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.floor(rawOrder) : interim.length + 1;
    interim.push({ approver_id: normalizedId, order });
  }

  interim.sort((a, b) => {
    if (a.order === b.order) {
      return a.approver_id.localeCompare(b.approver_id);
    }
    return a.order - b.order;
  });

  const unique = [];
  const seen = new Set();
  for (const item of interim) {
    if (!item.approver_id || seen.has(item.approver_id)) continue;
    seen.add(item.approver_id);
    unique.push(item);
  }

  return unique.map((item, index) => ({ approver_id: item.approver_id, order: index + 1 }));
};

const normalizeRulePayload = (raw) => {
  const ruleTypeRaw = typeof raw.rule_type === 'string' ? raw.rule_type.toLowerCase() : 'percentage';
  if (!VALID_RULE_TYPES.has(ruleTypeRaw)) {
    const error = new Error('Invalid rule type.');
    error.status = 400;
    throw error;
  }

  const approvers = Array.isArray(raw.approvers) ? raw.approvers : [];
  const normalizedApprovers = Array.from(
    new Set(
      approvers
        .map((id) => (id ? String(id).trim() : ''))
        .filter((id) => id.length > 0)
    )
  );

  const minApprovalPercentage = Number(raw.min_approval_percentage ?? 0);
  if (Number.isNaN(minApprovalPercentage) || minApprovalPercentage < 0 || minApprovalPercentage > 100) {
    const error = new Error('Minimum approval percentage must be between 0 and 100.');
    error.status = 400;
    throw error;
  }

  const specificApprover = raw.specific_approver_required
    ? String(raw.specific_approver_required).trim() || null
    : null;

  if (ruleTypeRaw === 'percentage' && normalizedApprovers.length === 0) {
    const error = new Error('Percentage rules require at least one approver.');
    error.status = 400;
    throw error;
  }

  if (ruleTypeRaw === 'percentage' && minApprovalPercentage <= 0) {
    const error = new Error('Percentage rules require a minimum approval percentage greater than 0.');
    error.status = 400;
    throw error;
  }

  if (ruleTypeRaw === 'specific' && !specificApprover) {
    const error = new Error('Specific approver rules require a specific approver.');
    error.status = 400;
    throw error;
  }

  if (ruleTypeRaw === 'hybrid') {
    if (!specificApprover) {
      const error = new Error('Hybrid rules require a specific approver.');
      error.status = 400;
      throw error;
    }
    if (normalizedApprovers.length === 0) {
      const error = new Error('Hybrid rules require at least one approver for the percentage threshold.');
      error.status = 400;
      throw error;
    }
    if (minApprovalPercentage <= 0) {
      const error = new Error('Hybrid rules require a positive minimum approval percentage.');
      error.status = 400;
      throw error;
    }
  }

  const rawSequence = Array.isArray(raw.approver_sequence) ? raw.approver_sequence : [];
  const sequenceIds = [];
  const pushUnique = (id) => {
    const normalized = id ? String(id).trim() : '';
    if (!normalized) return;
    if (!sequenceIds.includes(normalized)) {
      sequenceIds.push(normalized);
    }
  };

  if (rawSequence.length > 0) {
    for (const entry of rawSequence) {
      if (!entry) continue;
      if (typeof entry === 'string') {
        pushUnique(entry);
        continue;
      }
      pushUnique(entry.approver_id ?? entry.id ?? entry.user_id ?? entry.value);
    }
  }

  if (ruleTypeRaw !== 'specific') {
    for (const id of normalizedApprovers) {
      pushUnique(id);
    }
  }

  if (specificApprover) {
    pushUnique(specificApprover);
  }

  const normalizedSequence = sequenceIds.map((id, index) => ({
    approver_id: id,
    order: index + 1,
  }));

  return {
    rule_type: ruleTypeRaw,
    approvers: normalizedApprovers,
    min_approval_percentage: ruleTypeRaw === 'specific' ? 0 : Math.round(minApprovalPercentage),
    specific_approver_required: specificApprover,
    approver_sequence: normalizedSequence,
  };
};

const fetchCompanyApprovalRules = async (connection, companyId) => {
  const [rows] = await connection.query('SELECT * FROM approval_rules WHERE company_id = ?', [companyId]);
  return rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    rule_name: row.rule_name,
    description: row.description,
    rule_type: row.rule_type || 'percentage',
    approvers: normalizeApproverList(row.approvers),
    min_approval_percentage: Number(row.min_approval_percentage ?? 0),
    specific_approver_required: row.specific_approver_required || null,
    created_at: row.created_at,
    approver_sequence: parseApproverSequence(row.approver_sequence),
  }));
};

const gatherApproverIdsFromRules = (rules) => {
  const ids = new Set();
  for (const rule of rules) {
    for (const approverId of rule.approvers || []) {
      if (approverId) ids.add(approverId);
    }
    if (Array.isArray(rule.approver_sequence)) {
      for (const step of rule.approver_sequence) {
        if (step?.approver_id) {
          ids.add(step.approver_id);
        }
      }
    }
    if (rule.specific_approver_required) {
      ids.add(rule.specific_approver_required);
    }
  }
  return Array.from(ids);
};

const buildApprovalWorkflow = (rules) => {
  const stageMap = new Map();

  const addToStage = (order, approverId) => {
    if (!approverId) return;
    const normalized = String(approverId).trim();
    if (!normalized) return;
    const stageOrder = Number.isFinite(order) && order > 0 ? Math.floor(order) : stageMap.size + 1;
    if (!stageMap.has(stageOrder)) {
      stageMap.set(stageOrder, new Set());
    }
    stageMap.get(stageOrder).add(normalized);
  };

  for (const rule of rules) {
    const hasSequence = Array.isArray(rule.approver_sequence) && rule.approver_sequence.length > 0;

    if (hasSequence) {
      for (const step of rule.approver_sequence) {
        if (!step) continue;
        addToStage(step.order, step.approver_id);
      }
    }

    if (!hasSequence && Array.isArray(rule.approvers)) {
      rule.approvers.forEach((approverId, index) => {
        addToStage(index + 1, approverId);
      });
    }

    if (rule.specific_approver_required) {
      const alreadyIncluded = (!!rule.approver_sequence && rule.approver_sequence.some((step) => step?.approver_id === rule.specific_approver_required))
        || (Array.isArray(rule.approvers) && rule.approvers.includes(rule.specific_approver_required));

      if (!alreadyIncluded) {
        const maxExistingOrder = stageMap.size > 0 ? Math.max(...stageMap.keys()) : 0;
        addToStage(maxExistingOrder + 1, rule.specific_approver_required);
      }
    }
  }

  const sortedOrders = [...stageMap.keys()].sort((a, b) => a - b);
  const seenGlobal = new Set();
  const steps = [];
  let nextOrder = 1;

  for (const order of sortedOrders) {
    const stageApprovers = Array.from(stageMap.get(order) || []);
    const filtered = stageApprovers.filter((id) => {
      if (seenGlobal.has(id)) return false;
      seenGlobal.add(id);
      return true;
    });

    if (filtered.length > 0) {
      steps.push({ order: nextOrder++, approverIds: filtered });
    }
  }

  return steps;
};

const resolveApproverIds = async (connection, companyId, candidateIds, excludeUserId) => {
  const uniqueCandidates = Array.from(
    new Set(
      (candidateIds || [])
        .map((id) => (id ? String(id).trim() : ''))
        .filter((id) => id.length > 0 && id !== excludeUserId)
    )
  );

  if (uniqueCandidates.length === 0) {
    return [];
  }

  const placeholders = uniqueCandidates.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM users WHERE company_id = ? AND id IN (${placeholders})`,
    [companyId, ...uniqueCandidates]
  );

  return rows.map((row) => row.id).filter((id) => id !== excludeUserId);
};

const createApprovalsForStage = async (connection, {
  expenseId,
  approverIds,
  stageOrder,
  now,
  notificationBuilder,
}) => {
  const inserted = [];

  for (const approverId of approverIds) {
    if (!approverId) continue;
    const approvalId = crypto.randomUUID();
    await connection.query(
      'INSERT INTO approvals (id, expense_id, approver_id, sequence_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [approvalId, expenseId, approverId, stageOrder, 'pending', now]
    );

    if (typeof notificationBuilder === 'function') {
      const notification = notificationBuilder(approverId, stageOrder);
      if (notification && notification.title && notification.message) {
        await connection.query(
          'INSERT INTO notifications (id, user_id, title, message, type, related_entity_id, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            crypto.randomUUID(),
            approverId,
            notification.title,
            notification.message,
            notification.type || 'approval',
            expenseId,
            0,
            now,
          ]
        );
      }
    }

    inserted.push({ approver_id: approverId, sequence_order: stageOrder, status: 'pending' });
  }

  return inserted;
};

const maybeActivateNextApprovalStage = async (connection, {
  expense,
  rules,
  approvals,
  now,
}) => {
  if (!Array.isArray(approvals) || approvals.length === 0) {
    return approvals;
  }

  if (approvals.some((record) => record.status === 'rejected')) {
    return approvals;
  }

  const workflow = buildApprovalWorkflow(rules);
  if (workflow.length === 0) {
    return approvals;
  }

  const expenseCurrency = expense?.currency ? String(expense.currency).toUpperCase() : 'USD';
  const expenseAmountNumber = Number(expense?.amount ?? 0);

  const approvalsByStage = new Map();
  for (const approval of approvals) {
    const stageOrder = Number.isFinite(approval.sequence_order) && approval.sequence_order > 0 ? Math.floor(approval.sequence_order) : 1;
    if (!approvalsByStage.has(stageOrder)) {
      approvalsByStage.set(stageOrder, []);
    }
    approvalsByStage.get(stageOrder).push(approval);
  }

  const createdStages = new Set(approvals.map((approval) => (Number.isFinite(approval.sequence_order) && approval.sequence_order > 0 ? Math.floor(approval.sequence_order) : 1)));
  const sortedWorkflow = [...workflow].sort((a, b) => a.order - b.order);

  for (const stage of sortedWorkflow) {
    if (!createdStages.has(stage.order)) {
      const previousStages = sortedWorkflow.filter((candidate) => candidate.order < stage.order);
      const previousComplete = previousStages.every((prevStage) => {
        const prevApprovals = approvalsByStage.get(prevStage.order) || [];
        if (prevApprovals.length === 0) {
          return false;
        }
        return prevApprovals.every((record) => record.status === 'approved');
      });

      if (!previousComplete) {
        break;
      }

      const resolvedApprovers = await resolveApproverIds(connection, expense.company_id, stage.approverIds, expense.user_id);
      const filtered = resolvedApprovers.filter(
        (approverId) => !approvals.some((record) => record.approver_id === approverId && record.sequence_order === stage.order)
      );

      if (filtered.length === 0) {
        continue;
      }

      await createApprovalsForStage(connection, {
        expenseId: expense.id,
        approverIds: filtered,
        stageOrder: stage.order,
        now,
        notificationBuilder: (_approverId, stepOrder) => ({
          title: 'Expense Approval Needed',
          message: `${expenseCurrency} ${expenseAmountNumber.toFixed(2)} requires your approval (Step ${stepOrder}).`,
          type: 'approval',
        }),
      });

      const [updatedApprovals] = await connection.query(
        'SELECT approver_id, status, sequence_order FROM approvals WHERE expense_id = ?',
        [expense.id]
      );

      return updatedApprovals;
    }

    const currentStageApprovals = approvalsByStage.get(stage.order) || [];
    if (currentStageApprovals.some((record) => record.status === 'pending')) {
      break;
    }
  }

  return approvals;
};

const evaluateRulesOutcome = (rules, approvalRecords) => {
  if (!Array.isArray(approvalRecords) || approvalRecords.length === 0) {
    return 'pending';
  }

  if (!Array.isArray(rules) || rules.length === 0) {
    const anyRejected = approvalRecords.some((record) => record.status === 'rejected');
    if (anyRejected) {
      return 'rejected';
    }
    const allApproved = approvalRecords.length > 0 && approvalRecords.every((record) => record.status === 'approved');
    return allApproved ? 'approved' : 'pending';
  }

  if (approvalRecords.some((record) => record.status === 'rejected')) {
    return 'rejected';
  }

  const approvalsByApprover = new Map();
  for (const record of approvalRecords) {
    approvalsByApprover.set(record.approver_id, record);
  }

  const allApproverIds = Array.from(approvalsByApprover.keys());

  const evaluatePercentage = (rule) => {
    const candidateIds = (rule.approvers && rule.approvers.length > 0) ? rule.approvers : allApproverIds;
    const uniqueIds = Array.from(new Set(candidateIds));

    if (uniqueIds.length === 0) {
      return { satisfied: false };
    }

    let approvedCount = 0;
    for (const id of uniqueIds) {
      const approval = approvalsByApprover.get(id);
      if (approval?.status === 'approved') {
        approvedCount += 1;
      }
      if (approval?.status === 'rejected') {
        return { rejected: true };
      }
    }

    const required = Math.ceil((Number(rule.min_approval_percentage || 0) / 100) * uniqueIds.length);
    const satisfied = required === 0 ? approvedCount > 0 : approvedCount >= required;

    return { satisfied };
  };

  for (const rule of rules) {
    const type = rule.rule_type || 'percentage';

    if (type === 'specific' || type === 'hybrid') {
      if (rule.specific_approver_required) {
        const specificApproval = approvalsByApprover.get(rule.specific_approver_required);
        if (specificApproval?.status === 'approved') {
          return 'approved';
        }
        if (specificApproval?.status === 'rejected') {
          return 'rejected';
        }
      }
    }

    if (type === 'percentage' || type === 'hybrid') {
      const { satisfied, rejected } = evaluatePercentage(rule);
      if (rejected) {
        return 'rejected';
      }
      if (satisfied) {
        return 'approved';
      }
    }
  }

  const allApproved = approvalRecords.length > 0 && approvalRecords.every((record) => record.status === 'approved');
  return allApproved ? 'approved' : 'pending';
};

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

const ALLOWED_SIGNUP_ROLES = new Set(['admin', 'manager', 'employee']);

app.post('/api/auth/signup', async (req, res, next) => {
  const { name, email, password, country, role: requestedRoleRaw, adminKey } = req.body;

  if (!name || !email || !password || !country) {
    return res.status(400).json({ error: 'Name, email, password and country are required' });
  }

  const requestedRole = typeof requestedRoleRaw === 'string' ? requestedRoleRaw.toLowerCase() : 'employee';
  const adminSignupKey = process.env.ADMIN_SIGNUP_KEY;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUsers] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Email already in use' });
    }

    const [existingCompanies] = await connection.query('SELECT * FROM companies LIMIT 1');

    let companyId;
    if (existingCompanies.length === 0) {
      companyId = crypto.randomUUID();
      const defaultCurrency =
        country === 'United Kingdom'
          ? 'GBP'
          : country === 'European Union'
          ? 'EUR'
          : country === 'India'
          ? 'INR'
          : country === 'Canada'
          ? 'CAD'
          : country === 'Australia'
          ? 'AUD'
          : 'USD';

      await connection.query('INSERT INTO companies (id, name, country, default_currency) VALUES (?, ?, ?, ?)', [
        companyId,
        `${name}'s Company`,
        country,
        defaultCurrency,
      ]);

      const defaultCategories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other'];
      for (const category of defaultCategories) {
        await connection.query('INSERT INTO expense_categories (id, company_id, name) VALUES (?, ?, ?)', [
          crypto.randomUUID(),
          companyId,
          category,
        ]);
      }
    } else {
      companyId = existingCompanies[0].id;
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    let roleToAssign = 'employee';

    if (existingCompanies.length === 0) {
      roleToAssign = 'admin';
    } else if (requestedRole === 'manager' && ALLOWED_SIGNUP_ROLES.has('manager')) {
      roleToAssign = 'manager';
    } else if (requestedRole === 'admin' && ALLOWED_SIGNUP_ROLES.has('admin')) {
      if (!adminSignupKey) {
        await connection.rollback();
        return res.status(500).json({ error: 'Admin signup is not configured. Contact your administrator.' });
      }

      if (adminSignupKey !== adminKey) {
        await connection.rollback();
        return res.status(403).json({ error: 'Invalid admin access code' });
      }

      roleToAssign = 'admin';
    }

    await connection.query(
      'INSERT INTO users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, companyId, name, email, passwordHash, roleToAssign]
    );

    const token = createToken({ id: userId, company_id: companyId, role: roleToAssign });
    await connection.commit();

    res.status(201).json({
      token,
      user: {
        id: userId,
        company_id: companyId,
        name,
        email,
        role: roleToAssign,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createToken(user);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', authMiddleware, attachUser, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/expense-categories', authMiddleware, attachUser, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM expense_categories WHERE company_id = ? ORDER BY name ASC', [
      req.user.company_id,
    ]);
    res.json({ categories: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/receipts/analyze', authMiddleware, attachUser, uploadReceipt.single('receipt'), async (req, res, next) => {
  const receiptFile = req.file;

  if (!receiptFile) {
    return res.status(400).json({ error: 'Receipt file is required' });
  }

  const receiptDiskPath = path.join(receiptsDir, receiptFile.filename);

  try {
    const analysis = await analyzeReceipt(receiptDiskPath, receiptFile.mimetype);
    await removeFileQuietly(receiptDiskPath);

    res.json({
      analysis,
    });
  } catch (error) {
    await removeFileQuietly(receiptDiskPath);
    next(error);
  }
});

app.post('/api/expenses', authMiddleware, attachUser, uploadReceipt.single('receipt'), async (req, res, next) => {
  const { description, date, category_id, paid_by, amount, currency, remarks } = req.body;
  const receiptFile = req.file || null;
  const receiptDiskPath = receiptFile ? path.join(receiptsDir, receiptFile.filename) : null;

  if (!description || !date || !category_id || !amount || !currency) {
    await removeFileQuietly(receiptDiskPath);
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalizedAmount = Number(amount);
  if (Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
    await removeFileQuietly(receiptDiskPath);
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const receiptUrl = receiptFile ? `/uploads/receipts/${receiptFile.filename}` : null;
  // We no longer persist OCR-specific columns on expenses. Any OCR happens
  // client-side via /api/receipts/analyze and is used only to prefill fields.
  // Keep a lightweight server-side analysis for future heuristics if needed,
  // but do not store the results separately.
  let ocrAnalysis = null;
  if (receiptFile) {
    try {
      ocrAnalysis = await analyzeReceipt(receiptDiskPath, receiptFile.mimetype);
    } catch (error) {
      console.warn('Receipt analysis skipped (non-blocking):', error);
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const expenseId = crypto.randomUUID();
    const now = currentSqlTimestamp();

    await connection.query(
      `INSERT INTO expenses (id, company_id, user_id, description, date, category_id, paid_by, amount, currency, remarks, receipt_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expenseId,
        req.user.company_id,
        req.user.id,
        description,
        date,
        category_id,
        paid_by || 'Cash',
        normalizedAmount,
        currency,
        remarks ? remarks : null,
        receiptUrl,
        'pending',
        now,
        now,
      ]
    );

    const rules = await fetchCompanyApprovalRules(connection, req.user.company_id);
    const workflow = buildApprovalWorkflow(rules);

    let activeStage = null;
    let activeApproverIds = [];

    for (const stage of workflow) {
      const resolvedIds = await resolveApproverIds(
        connection,
        req.user.company_id,
        stage.approverIds,
        req.user.id
      );
      if (resolvedIds.length > 0) {
        activeStage = stage;
        activeApproverIds = resolvedIds;
        break;
      }
    }

    if (activeApproverIds.length === 0) {
      const [managerRows] = await connection.query(
        'SELECT id FROM users WHERE company_id = ? AND role IN ("manager", "admin")',
        [req.user.company_id]
      );
      activeApproverIds = managerRows.map((row) => row.id).filter((id) => id !== req.user.id);
      if (activeApproverIds.length > 0) {
        activeStage = { order: 1, approverIds: activeApproverIds };
      }
    }

    const uniqueApproverIds = Array.from(new Set(activeApproverIds));

    if (uniqueApproverIds.length > 0) {
      await createApprovalsForStage(connection, {
        expenseId,
        approverIds: uniqueApproverIds,
        stageOrder: activeStage?.order || 1,
        now,
        notificationBuilder: (_approverId, stepOrder) => ({
          title: 'New Expense Approval',
          message: `${req.user.name} submitted an expense for ${currency} ${normalizedAmount.toFixed(2)} (Step ${stepOrder}).`,
          type: 'approval',
        }),
      });
    }

    await connection.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'create',
        'expense',
        expenseId,
        JSON.stringify({ amount: normalizedAmount, description, receipt_url: receiptUrl }),
        now,
      ]
    );

    await connection.commit();

    res.status(201).json({
      expense: {
        id: expenseId,
        company_id: req.user.company_id,
        user_id: req.user.id,
        description,
        date,
        category_id,
        paid_by: paid_by || 'Cash',
        amount: normalizedAmount,
        currency,
        remarks: remarks ? remarks : null,
        receipt_url: receiptUrl,
        status: 'pending',
        created_at: now,
        updated_at: now,
      },
    });
  } catch (error) {
    await connection.rollback();
    await removeFileQuietly(receiptDiskPath);
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/expenses/mine', authMiddleware, attachUser, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, company_id, user_id, description, date, category_id, paid_by, amount, currency, remarks, receipt_url, status, created_at, updated_at
         FROM expenses
        WHERE user_id = ?
        ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ expenses: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/notifications', authMiddleware, attachUser, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [
      req.user.id,
    ]);
    res.json({ notifications: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/:id/read', authMiddleware, attachUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE notifications SET `read` = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/read-all', authMiddleware, attachUser, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET `read` = 1 WHERE user_id = ? AND `read` = 0', [req.user.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, company_id, name, email, role, manager_id, created_at FROM users WHERE company_id = ? ORDER BY created_at DESC',
      [req.user.company_id]
    );
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/users/:id', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { id } = req.params;
  const { name, role, manager_id } = req.body;

  try {
    await pool.query('UPDATE users SET name = ?, role = ?, manager_id = ? WHERE id = ? AND company_id = ?', [
      name,
      role,
      manager_id || null,
      id,
      req.user.company_id,
    ]);

    await pool.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'update',
        'user',
        id,
        JSON.stringify({ name, role, manager_id: manager_id || null }),
        currentSqlTimestamp(),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/users/:id', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { id } = req.params;
  const rawReassignTo = typeof req.body?.reassign_to === 'string' ? req.body.reassign_to.trim() : '';
  const reassignTo = rawReassignTo.length > 0 ? rawReassignTo : null;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [[userRow]] = await connection.query(
      'SELECT id, role FROM users WHERE id = ? AND company_id = ?',
      [id, req.user.company_id]
    );

    if (!userRow) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    if (reassignTo === id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cannot reassign resources to the user being deleted.' });
    }

    let reassignTarget = null;
    if (reassignTo) {
      const [[targetRow]] = await connection.query(
        'SELECT id, role FROM users WHERE id = ? AND company_id = ?',
        [reassignTo, req.user.company_id]
      );

      if (!targetRow) {
        await connection.rollback();
        return res.status(400).json({ error: 'Reassignment target was not found in this company.' });
      }
      reassignTarget = targetRow;
    }

    const [[directReportCount]] = await connection.query(
      'SELECT COUNT(*) AS count FROM users WHERE manager_id = ? AND company_id = ?',
      [id, req.user.company_id]
    );
    const directs = Number(directReportCount?.count ?? 0);

    if (directs > 0) {
      if (!reassignTarget) {
        await connection.rollback();
        return res.status(409).json({
          error:
            'This user manages active employees. Pick a new manager to transfer their direct reports to before deleting the account.',
        });
      }

      if (reassignTarget.role === 'employee') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Direct reports can only be reassigned to a manager or admin.',
        });
      }

      await connection.query(
        'UPDATE users SET manager_id = ? WHERE manager_id = ? AND company_id = ?',
        [reassignTarget.id, id, req.user.company_id]
      );
    }

    const [[pendingApprovals]] = await connection.query(
      "SELECT COUNT(*) AS count FROM approvals WHERE approver_id = ? AND status IN ('pending', 'escalated')",
      [id]
    );
    const pendingApprovalCount = Number(pendingApprovals?.count ?? 0);

    if (pendingApprovalCount > 0 && !reassignTarget) {
      await connection.rollback();
      return res.status(409).json({
        error:
          'This user has approvals awaiting their action. Select another approver to take over those approvals before deleting.',
      });
    }

    const [[approvalCount]] = await connection.query('SELECT COUNT(*) AS count FROM approvals WHERE approver_id = ?', [
      id,
    ]);
    const totalApprovals = Number(approvalCount?.count ?? 0);

    if (totalApprovals > 0 && reassignTarget) {
      await connection.query('UPDATE approvals SET approver_id = ? WHERE approver_id = ?', [reassignTarget.id, id]);
    }

    const [[ownedExpenses]] = await connection.query('SELECT COUNT(*) AS count FROM expenses WHERE user_id = ?', [id]);
    const expenseCount = Number(ownedExpenses?.count ?? 0);

    if (expenseCount > 0 && !reassignTarget) {
      await connection.rollback();
      return res.status(409).json({
        error:
          'This user has submitted expenses. Select a new owner for those expenses or archive them before deleting the account.',
      });
    }

    if (expenseCount > 0 && reassignTarget) {
      await connection.query('UPDATE expenses SET user_id = ? WHERE user_id = ?', [reassignTarget.id, id]);
    }

    await connection.query('DELETE FROM notifications WHERE user_id = ?', [id]);

    await connection.query('DELETE FROM users WHERE id = ? AND company_id = ?', [id, req.user.company_id]);

    await connection.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'delete',
        'user',
        id,
        JSON.stringify({ reassigned_to: reassignTarget?.id ?? null }),
        currentSqlTimestamp(),
      ]
    );

    await connection.commit();

    res.json({ success: true, reassigned_to: reassignTarget?.id ?? null });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }

    if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error:
          'This user is still referenced by other records. Provide a reassignment target or archive related data before deleting.',
      });
    }

    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/approval-rules', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM approval_rules WHERE company_id = ? ORDER BY created_at DESC', [
      req.user.company_id,
    ]);
    res.json({
      rules: rows.map((row) => ({
        ...row,
        approvers: normalizeApproverList(row.approvers),
        approver_sequence: parseApproverSequence(row.approver_sequence),
        rule_type: row.rule_type || 'percentage',
        min_approval_percentage: Number(row.min_approval_percentage ?? 0),
        specific_approver_required: row.specific_approver_required || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/approval-rules', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { rule_name, description } = req.body;

  if (!rule_name) {
    return res.status(400).json({ error: 'Rule name is required' });
  }

  let normalized;
  try {
    normalized = normalizeRulePayload(req.body);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }

  try {
    const id = crypto.randomUUID();
    const now = currentSqlTimestamp();

    await pool.query(
      'INSERT INTO approval_rules (id, company_id, rule_name, description, approvers, approver_sequence, rule_type, min_approval_percentage, specific_approver_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        req.user.company_id,
        rule_name,
        description || null,
        JSON.stringify(normalized.approvers),
        JSON.stringify(normalized.approver_sequence || []),
        normalized.rule_type,
        normalized.min_approval_percentage,
        normalized.specific_approver_required,
        now,
      ]
    );

    await pool.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'create',
        'approval_rule',
        id,
        JSON.stringify({
          rule_name,
          description: description || null,
          ...normalized,
        }),
        now,
      ]
    );

    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/approval-rules/:id', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { id } = req.params;
  const { rule_name, description } = req.body;

  if (!rule_name) {
    return res.status(400).json({ error: 'Rule name is required' });
  }

  let normalized;
  try {
    normalized = normalizeRulePayload(req.body);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }

  try {
    await pool.query(
      'UPDATE approval_rules SET rule_name = ?, description = ?, approvers = ?, approver_sequence = ?, rule_type = ?, min_approval_percentage = ?, specific_approver_required = ? WHERE id = ? AND company_id = ?',
      [
        rule_name,
        description || null,
        JSON.stringify(normalized.approvers),
        JSON.stringify(normalized.approver_sequence || []),
        normalized.rule_type,
        normalized.min_approval_percentage,
        normalized.specific_approver_required,
        id,
        req.user.company_id,
      ]
    );

    await pool.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'update',
        'approval_rule',
        id,
        JSON.stringify({
          rule_name,
          description: description || null,
          ...normalized,
        }),
        currentSqlTimestamp(),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/approval-rules/:id', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM approval_rules WHERE id = ? AND company_id = ?', [id, req.user.company_id]);

    await pool.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'delete',
        'approval_rule',
        id,
        JSON.stringify({}),
        currentSqlTimestamp(),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/company/profile', authMiddleware, attachUser, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, country, default_currency, created_at FROM companies WHERE id = ?', [
      req.user.company_id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ company: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/company', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM companies WHERE id = ?', [req.user.company_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({ company: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/company', authMiddleware, attachUser, assertRole(['admin']), async (req, res, next) => {
  const { name, country, default_currency } = req.body;
  try {
    await pool.query('UPDATE companies SET name = ?, country = ?, default_currency = ? WHERE id = ?', [
      name,
      country,
      default_currency,
      req.user.company_id,
    ]);

    await pool.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        'update',
        'company',
        req.user.company_id,
        JSON.stringify(req.body),
        currentSqlTimestamp(),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/currency/rates', authMiddleware, attachUser, async (req, res) => {
  const base = typeof req.query.base === 'string' ? req.query.base : undefined;

  try {
    const result = await listSupportedCurrencies(base || 'USD');
    res.json({
      base: result.base,
      rates: result.rates,
      updated_at: result.updated_at,
      provider: result.provider,
    });
  } catch (error) {
    console.error('Failed to fetch currency rates', error);
    res.status(502).json({ error: 'Failed to fetch currency rates' });
  }
});

app.get('/api/currency/convert', authMiddleware, attachUser, async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to || amount === undefined) {
    return res.status(400).json({ error: 'Missing required query parameters: from, to, amount' });
  }

  try {
    const quote = await convertCurrency(amount, from, to);
    res.json({ quote });
  } catch (error) {
    console.error('Currency conversion failed', error);
    res.status(400).json({ error: error.message || 'Failed to convert currency' });
  }
});

app.get('/api/audit-logs', authMiddleware, attachUser, assertRole(['admin', 'manager']), async (req, res, next) => {
  const { action, entityType, userId } = req.query;

  try {
    let query = 'SELECT * FROM audit_logs WHERE company_id = ?';
    const params = [req.user.company_id];

    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }
    if (entityType) {
      query += ' AND entity_type = ?';
      params.push(entityType);
    }
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT 200';

    const [rows] = await pool.query(query, params);

    res.json({
      logs: rows.map((row) => ({
        ...row,
        details: parseJsonField(row.details) || {},
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit-logs/users', authMiddleware, attachUser, assertRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM users WHERE company_id = ? ORDER BY name ASC', [
      req.user.company_id,
    ]);
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/approvals/pending', authMiddleware, attachUser, assertRole(['manager', 'admin']), async (req, res, next) => {
  try {
    let query, params;
    
    if (req.user.role === 'admin') {
      // Admins see all company expenses that need approval
      query = `SELECT a.*, e.description, e.date, e.category_id, e.paid_by, e.amount, e.currency, e.remarks, e.status AS expense_status, e.receipt_url,
                      e.user_id AS requester_id, u.name AS requester_name
               FROM approvals a
               JOIN expenses e ON a.expense_id = e.id
               JOIN users u ON e.user_id = u.id
               WHERE e.company_id = ?
               ORDER BY a.created_at DESC`;
      params = [req.user.company_id];
    } else {
      // Managers see only their assigned approvals
      query = `SELECT a.*, e.description, e.date, e.category_id, e.paid_by, e.amount, e.currency, e.remarks, e.status AS expense_status, e.receipt_url,
                      e.user_id AS requester_id, u.name AS requester_name
               FROM approvals a
               JOIN expenses e ON a.expense_id = e.id
               JOIN users u ON e.user_id = u.id
               WHERE a.approver_id = ?
               ORDER BY a.created_at DESC`;
      params = [req.user.id];
    }
    
    const [rows] = await pool.query(query, params);

    res.json({
      approvals: rows.map((row) => ({
        id: row.id,
        expense_id: row.expense_id,
        status: row.status,
        comments: row.comments,
        created_at: row.created_at,
        approved_at: row.approved_at,
        expense: {
          id: row.expense_id,
          description: row.description,
          date: row.date,
          category_id: row.category_id,
          paid_by: row.paid_by,
          amount: Number(row.amount),
          currency: row.currency,
          remarks: row.remarks,
          status: row.expense_status,
          receipt_url: row.receipt_url,
        },
        requester: {
          id: row.requester_id,
          name: row.requester_name,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/approvals/:id/decision', authMiddleware, attachUser, assertRole(['manager', 'admin']), async (req, res, next) => {
  const { id } = req.params;
  const { status, comments } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [approvalRows] = await connection.query('SELECT * FROM approvals WHERE id = ? AND approver_id = ? FOR UPDATE', [
      id,
      req.user.id,
    ]);

    if (approvalRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Approval not found' });
    }

    const approval = approvalRows[0];

    const [expenseRows] = await connection.query('SELECT * FROM expenses WHERE id = ? FOR UPDATE', [
      approval.expense_id,
    ]);

    if (expenseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Expense not found' });
    }

    const existingExpense = expenseRows[0];

    await connection.query('UPDATE approvals SET status = ?, comments = ?, approved_at = ? WHERE id = ?', [
      status,
      comments || null,
      currentSqlTimestamp(),
      id,
    ]);

    let [allApprovals] = await connection.query(
      'SELECT approver_id, status, sequence_order FROM approvals WHERE expense_id = ?',
      [approval.expense_id]
    );

    const rules = await fetchCompanyApprovalRules(connection, req.user.company_id);

    allApprovals = await maybeActivateNextApprovalStage(connection, {
      expense: {
        id: existingExpense.id,
        company_id: req.user.company_id,
        user_id: existingExpense.user_id,
        amount: existingExpense.amount,
        currency: existingExpense.currency,
      },
      rules,
      approvals: allApprovals,
      now: currentSqlTimestamp(),
    });

    const expenseStatus = evaluateRulesOutcome(rules, allApprovals);

    await connection.query('UPDATE expenses SET status = ?, updated_at = ? WHERE id = ?', [
      expenseStatus,
      currentSqlTimestamp(),
      approval.expense_id,
    ]);

    if (
      expenseStatus !== existingExpense.status &&
      (expenseStatus === 'approved' || expenseStatus === 'rejected')
    ) {
      await connection.query(
        'INSERT INTO notifications (id, user_id, title, message, type, related_entity_id, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          crypto.randomUUID(),
          existingExpense.user_id,
          `Expense ${expenseStatus}`,
          `Your expense for ${existingExpense.currency} ${Number(existingExpense.amount).toFixed(2)} has been ${expenseStatus}`,
          expenseStatus === 'approved' ? 'approval' : 'rejection',
          existingExpense.id,
          0,
          currentSqlTimestamp(),
        ]
      );
    }

    await connection.query(
      'INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        req.user.company_id,
        req.user.id,
        status,
        'expense',
        existingExpense.id,
        JSON.stringify({
          comments: comments || null,
          decision: status,
          resulting_status: expenseStatus,
        }),
        currentSqlTimestamp(),
      ]
    );

    await connection.commit();

    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});

const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await shutdownWorker();
    } catch (error) {
      console.warn('Failed to stop OCR worker cleanly', error);
    }
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

process.on('exit', (code) => {
  console.log(`Process exiting with code ${code}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  gracefulShutdown('unhandledRejection');
});
