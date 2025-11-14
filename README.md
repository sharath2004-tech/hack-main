# Expense Management System

A full-stack expense management application with MongoDB backend and React frontend. Built for companies to track, approve, and manage employee expenses efficiently.

## 🚀 Features

- **User Authentication**: Secure JWT-based authentication with role-based access control
- **Multi-Role Support**: Admin, Manager, and Employee roles with different permissions
- **Expense Management**: Create, track, and manage expenses with receipt uploads
- **Approval Workflow**: Multi-stage approval process with customizable rules
- **Receipt OCR**: Automatic text extraction from receipt images using Tesseract.js
- **Currency Conversion**: Real-time currency exchange rates and conversion
- **Notifications**: Real-time notifications for expense approvals and rejections
- **Audit Logging**: Complete audit trail of all system activities
- **Company Management**: Multi-company support with customizable settings

## 📋 Prerequisites

- **Node.js**: v18 or higher
- **MongoDB**: v5.0 or higher (local or Atlas)
- **npm**: v9 or higher

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/sharath2004-tech/hack-main.git
cd hack-main/hack-main
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Install Backend Dependencies

```bash
cd server
npm install
cd ..
```

### 4. Configure Environment Variables

#### Frontend `.env` (root directory)
```properties
VITE_API_URL=http://localhost:4001
```

#### Backend `server/.env`
```properties
# Server Configuration
PORT=4001
CLIENT_ORIGIN=http://localhost:5173

# JWT Secret
JWT_SECRET=your-secret-key-here
ADMIN_SIGNUP_KEY=dev-admin-key

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/expense-management
MONGO_DB_NAME=expense-management

# Exchange Rate API
EXCHANGE_RATE_API_KEY=your-api-key-here
```

### 5. Start MongoDB

**Windows:**
```powershell
net start MongoDB
```

**macOS/Linux:**
```bash
sudo systemctl start mongod
```

**Docker:**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 6. Start the Application

#### Terminal 1 - Backend Server
```bash
cd server
npm start
```

#### Terminal 2 - Frontend Development Server
```bash
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4001
- **API Health Check**: http://localhost:4001/health

## 👤 First-Time Setup

### Create Admin Account

1. Navigate to http://localhost:5173
2. Click "Create Account"
3. Fill in the signup form:
   - **Name**: Your name
   - **Email**: Your email address
   - **Country**: Select your country
   - **Role**: Select "Admin"
   - **Admin Access Code**: `dev-admin-key`
   - **Password**: Create a secure password (min 6 characters)
4. Click "Sign Up"

### Add Employees/Managers

Once logged in as admin:
1. Go to "User Management" in the admin panel
2. Click "Add User"
3. Fill in user details (no admin key required for employees/managers)

## 📁 Project Structure

```
hack-main/
├── src/                          # Frontend React application
│   ├── components/              # Reusable React components
│   │   └── Navigation.tsx      # Main navigation component
│   ├── contexts/               # React contexts
│   │   └── AuthContext.tsx    # Authentication context
│   ├── lib/                    # Utility libraries
│   │   └── supabase.ts        # API client configuration
│   ├── pages/                  # Page components
│   │   ├── admin/             # Admin-only pages
│   │   ├── employee/          # Employee pages
│   │   ├── manager/           # Manager pages
│   │   ├── Login.tsx          # Login page
│   │   ├── Signup.tsx         # Signup page
│   │   └── Notifications.tsx  # Notifications page
│   ├── types/                  # TypeScript type definitions
│   ├── App.tsx                 # Main app component
│   └── main.tsx               # Application entry point
├── server/                      # Backend Node.js/Express server
│   ├── config/                 # Configuration files
│   │   └── database.js        # MongoDB connection
│   ├── middleware/             # Express middleware
│   │   └── auth.js            # JWT authentication middleware
│   ├── models/                 # Mongoose schemas
│   │   ├── User.js            # User model
│   │   ├── Company.js         # Company model
│   │   ├── Expense.js         # Expense model
│   │   ├── Approval.js        # Approval model
│   │   ├── Notification.js    # Notification model
│   │   ├── ExpenseCategory.js # Category model
│   │   ├── ApprovalRule.js    # Approval rule model
│   │   └── AuditLog.js        # Audit log model
│   ├── lib/                    # Utility libraries
│   │   ├── receiptParser.js   # OCR receipt analysis
│   │   └── currencyRates.js   # Currency conversion
│   ├── uploads/                # Uploaded files storage
│   │   └── receipts/          # Receipt images
│   ├── index.js               # Server entry point
│   ├── package.json           # Backend dependencies
│   └── .env                   # Backend environment variables
├── package.json                # Frontend dependencies
├── vite.config.ts             # Vite configuration
├── tailwind.config.js         # Tailwind CSS configuration
└── README.md                  # This file
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Expenses
- `GET /api/expenses` - Get all expenses (filtered by role)
- `GET /api/expenses/mine` - Get my expenses
- `GET /api/expenses/:id` - Get single expense
- `POST /api/expenses` - Create expense (with file upload)
- `PATCH /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Approvals
- `GET /api/approvals/pending` - Get pending approvals
- `POST /api/approvals/:id/decision` - Approve/reject expense

### Notifications
- `GET /api/notifications` - Get notifications
- `GET /api/notifications/unread-count` - Get unread count
- `POST /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all as read

### Admin - Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Admin - Categories
- `GET /api/expense-categories` - Get categories
- `POST /api/expense-categories` - Create category
- `PATCH /api/expense-categories/:id` - Update category
- `DELETE /api/expense-categories/:id` - Delete category

### Admin - Company
- `GET /api/company` - Get company settings
- `PATCH /api/company` - Update company settings

### Admin - Approval Rules
- `GET /api/approval-rules` - Get approval rules
- `POST /api/approval-rules` - Create rule
- `PATCH /api/approval-rules/:id` - Update rule
- `DELETE /api/approval-rules/:id` - Delete rule

### Admin - Audit Logs
- `GET /api/audit-logs` - Get audit logs
- `GET /api/audit-logs/users/:userId` - Get user audit logs

### Utilities
- `GET /api/currency/rates` - Get exchange rates
- `GET /api/currency/list` - List supported currencies
- `GET /api/currency/convert` - Convert currency
- `POST /api/receipts/analyze` - Analyze receipt with OCR
- `GET /health` - Health check

## 🎨 Tech Stack

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling
- **Lucide React**: Icons

### Backend
- **Node.js**: Runtime
- **Express**: Web framework
- **MongoDB**: Database
- **Mongoose**: ODM
- **JWT**: Authentication
- **Multer**: File uploads
- **Tesseract.js**: OCR
- **bcryptjs**: Password hashing

## 🔒 Security Features

- JWT-based authentication with 7-day expiry
- Password hashing with bcrypt (10 rounds)
- Role-based access control (RBAC)
- Admin signup key protection
- Input validation and sanitization
- CORS configuration
- Secure file upload handling

## 🧪 Development

### Run in Development Mode

**Backend with auto-reload:**
```bash
cd server
npm run dev
```

**Frontend with hot reload:**
```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## 📝 Environment Variables

### Required Backend Variables
- `PORT` - Server port (default: 4001)
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT signing
- `ADMIN_SIGNUP_KEY` - Key required for admin signup

### Optional Backend Variables
- `MONGO_DB_NAME` - Database name (default: expense-management)
- `CLIENT_ORIGIN` - CORS origin (default: http://localhost:5173)
- `EXCHANGE_RATE_API_KEY` - API key for currency conversion

### Required Frontend Variables
- `VITE_API_URL` - Backend API URL

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongo --eval "db.runCommand({ ping: 1 })"

# Start MongoDB service
net start MongoDB  # Windows
sudo systemctl start mongod  # Linux/macOS
```

### Port Already in Use
```bash
# Find process using port 4001
netstat -ano | findstr :4001  # Windows
lsof -i :4001  # macOS/Linux

# Kill the process or change PORT in .env
```

### Module Not Found Errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📄 License

This project is licensed under the MIT License.

## 👥 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📧 Support

For support, email 2004sharath@gmail.com or open an issue on GitHub.

---

Built with ❤️ by sharath2004-tech
