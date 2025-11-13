# MongoDB Backend Server

MongoDB-based backend for Expense Management System.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **MongoDB** installed locally

## MongoDB Local Setup

### Windows:

1. **Download MongoDB Community Server**:
   - Visit: https://www.mongodb.com/try/download/community
   - Download the Windows installer (MSI)

2. **Install MongoDB**:
   - Run the installer
   - Choose "Complete" installation
   - Install as a Windows Service (recommended)
   - Install MongoDB Compass (optional GUI)

3. **Verify Installation**:
   ```powershell
   mongod --version
   ```

4. **Start MongoDB Service** (if not auto-started):
   ```powershell
   net start MongoDB
   ```

5. **Create Database Directory** (if using manual start):
   ```powershell
   mkdir C:\data\db
   ```

### Alternative: MongoDB with Docker

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

## Installation

1. **Install dependencies**:
   ```bash
   cd server
   npm install
   ```

2. **Configure environment**:
   - Copy `.env` and adjust if needed
   - Default: `mongodb://localhost:27017/expense-management`

3. **Start the server**:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Expenses
- `GET /api/expenses` - List all expenses (admin/manager)
- `GET /api/expenses/mine` - Get my expenses
- `GET /api/expenses/:id` - Get expense details
- `POST /api/expenses` - Create expense (with file upload)
- `PATCH /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Approvals
- `GET /api/approvals/pending` - Get pending approvals
- `POST /api/approvals/:id/decision` - Approve/reject expense

### Notifications
- `GET /api/notifications` - Get my notifications
- `GET /api/notifications/unread-count` - Get unread count
- `POST /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all as read

### Categories
- `GET /api/expense-categories` - List categories
- `POST /api/expense-categories` - Create category (admin)
- `PATCH /api/expense-categories/:id` - Update category (admin)
- `DELETE /api/expense-categories/:id` - Delete category (admin)

### Users (Admin)
- `GET /api/users` - List all users
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Company
- `GET /api/company/profile` - Get company profile
- `GET /api/company` - Get full company data (admin)
- `PATCH /api/company` - Update company (admin)

### Approval Rules (Admin)
- `GET /api/approval-rules` - List rules
- `POST /api/approval-rules` - Create rule
- `PATCH /api/approval-rules/:id` - Update rule
- `DELETE /api/approval-rules/:id` - Delete rule

### Currency
- `GET /api/currency/rates` - Get exchange rates
- `GET /api/currency/convert` - Convert currency

### Audit Logs (Admin/Manager)
- `GET /api/audit-logs` - Get audit logs
- `GET /api/audit-logs/users` - Get users for filtering

### OCR
- `POST /api/receipts/analyze` - Analyze receipt image

### Health
- `GET /health` - Server health check

## Default Port

Server runs on port **4001** by default.

## MongoDB Connection String

**Local**: `mongodb://localhost:27017/expense-management`

To change, update `MONGO_URI` in `.env` file.
