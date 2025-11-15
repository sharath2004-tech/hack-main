import fetch from 'node-fetch';

const API_URL = 'http://localhost:4001';
let authToken = '';
let testExpenseId = '';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const test = async (name, fn) => {
  try {
    await fn();
    log(`✓ ${name}`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${name}: ${error.message}`, 'red');
    return false;
  }
};

// Test 1: Health Check
await test('Health Check', async () => {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error('Health check failed');
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('Invalid health status');
});

// Test 2: Login
await test('Login', async () => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employee@demo.com', password: 'password123' })
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  authToken = data.token;
  if (!authToken) throw new Error('No token received');
});

// Test 3: Get Categories
await test('Get Expense Categories', async () => {
  const res = await fetch(`${API_URL}/api/expense-categories`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get categories');
  const data = await res.json();
  if (!data.categories || data.categories.length === 0) throw new Error('No categories found');
  log(`  Found ${data.categories.length} categories`, 'yellow');
});

// Test 4: Create Expense
await test('Create Expense', async () => {
  // Get a real category ID first
  const catRes = await fetch(`${API_URL}/api/expense-categories`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const catData = await catRes.json();
  const categoryId = catData.categories[0].id;
  
  const formData = new FormData();
  formData.append('description', 'Test Expense');
  formData.append('date', new Date().toISOString().split('T')[0]);
  formData.append('category_id', categoryId);
  formData.append('paid_by', 'Cash');
  formData.append('amount', '100.50');
  formData.append('currency', 'INR');
  formData.append('remarks', 'Test expense from API test');
  
  const res = await fetch(`${API_URL}/api/expenses`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: formData
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create expense');
  }
  
  const data = await res.json();
  testExpenseId = data.expense._id || data.expense.id;
  log(`  Created expense ID: ${testExpenseId}`, 'yellow');
});

// Test 5: Get My Expenses
await test('Get My Expenses', async () => {
  const res = await fetch(`${API_URL}/api/expenses/mine`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get expenses');
  const data = await res.json();
  if (!data.expenses) throw new Error('No expenses array in response');
  log(`  Found ${data.expenses.length} expenses`, 'yellow');
});

// Test 6: Get Notifications
await test('Get Notifications', async () => {
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get notifications');
  const data = await res.json();
  log(`  Found ${data.notifications.length} notifications`, 'yellow');
});

// Test 7: Login as Admin
await test('Login as Admin', async () => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'password123' })
  });
  if (!res.ok) throw new Error('Admin login failed');
  const data = await res.json();
  authToken = data.token;
});

// Test 8: Get Audit Logs
await test('Get Audit Logs', async () => {
  const res = await fetch(`${API_URL}/api/audit-logs`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get audit logs');
  const data = await res.json();
  if (!data.logs) throw new Error('No logs array in response');
  log(`  Found ${data.logs.length} audit logs`, 'yellow');
});

// Test 9: Get Users for Audit Logs
await test('Get Audit Log Users', async () => {
  const res = await fetch(`${API_URL}/api/audit-logs/users`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get users');
  const data = await res.json();
  if (!data.users) throw new Error('No users array in response');
  log(`  Found ${data.users.length} users`, 'yellow');
});

// Test 10: Get Company Profile
await test('Get Company Profile', async () => {
  const res = await fetch(`${API_URL}/api/company/profile`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) throw new Error('Failed to get company profile');
  const data = await res.json();
  if (!data.company) throw new Error('No company in response');
  log(`  Company: ${data.company.name} (${data.company.default_currency})`, 'yellow');
});

log('\n=== Test Summary ===', 'yellow');
log('All critical API endpoints tested', 'green');