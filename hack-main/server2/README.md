# ExpenseTracker - MongoDB Backend

MongoDB-based version of the ExpenseTracker backend using Mongoose ODM.

## Features

- **MongoDB Database** with Mongoose ODM
- **User Authentication** with JWT
- **Role-based Access Control** (Admin, Manager, Employee)
- **Expense Management** with approval workflow
- **Real-time Notifications**
- **RESTful API** endpoints

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or cloud)

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

3. **Start MongoDB** (if running locally):
```bash
mongod
```

4. **Seed database** (optional):
```bash
npm run seed
```

5. **Start server**:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Expenses
- `POST /api/expenses` - Create expense
- `GET /api/expenses/mine` - Get user's expenses

### Approvals
- `GET /api/approvals/pending` - Get pending approvals (Manager/Admin)
- `POST /api/approvals/:id/decision` - Approve/reject expense

### Categories & Notifications
- `GET /api/expense-categories` - Get expense categories
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/:id/read` - Mark notification as read

## Database Models

### Company
- name, country, defaultCurrency

### User
- companyId, name, email, passwordHash, role, managerId

### Expense
- companyId, userId, description, date, categoryId, amount, currency, status

### Approval
- expenseId, approverId, status, comments

### ExpenseCategory
- companyId, name

### Notification
- userId, title, message, type, read

## Demo Users (after seeding)
- **Admin**: admin@demo.com / password123
- **Manager**: manager@demo.com / password123  
- **Employee**: employee@demo.com / password123

## Development

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# Seed database
npm run seed
```

## MongoDB Connection

Default: `mongodb://localhost:27017/expense_tracker`

For MongoDB Atlas or other cloud providers, update `MONGODB_URI` in `.env`.