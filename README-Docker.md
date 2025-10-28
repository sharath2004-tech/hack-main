# Docker Setup for Expense Management System

## Prerequisites
- Docker Desktop installed and running
- At least 4GB RAM available for containers

## Quick Start

1. **Start Docker Desktop** (if not running)

2. **Build images:**
   ```bash
   docker-compose build
   ```

3. **Run the application:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   - Frontend: http://localhost
   - Backend API: http://localhost:4000
   - Database: localhost:3306

## Services

### Frontend (React + Nginx)
- **Port:** 80
- **Build:** Multi-stage build with Vite
- **Proxy:** API requests forwarded to backend

### Backend (Node.js + Express)
- **Port:** 4000
- **Database:** MySQL connection
- **Uploads:** Persistent volume for receipts

### Database (MySQL 8.0)
- **Port:** 3306
- **Credentials:** expense_user/expense_pass
- **Database:** expense_db

## Environment Variables

Backend requires:
- `DB_HOST=db`
- `JWT_SECRET=supersecret`
- `ADMIN_SIGNUP_KEY=adminkey`
- `EXCHANGE_RATE_API_KEY=your_api_key_here`

## Commands

```bash
# Build all services
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build -d
```

## Troubleshooting

- **Port conflicts:** Change ports in docker-compose.yml
- **Build failures:** Ensure Docker Desktop has enough memory
- **Database connection:** Wait for health check to pass