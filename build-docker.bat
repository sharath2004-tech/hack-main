@echo off
echo Building Docker images for Expense Management System...

echo.
echo Starting Docker Desktop (if not running)...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
timeout /t 10

echo.
echo Building backend image...
docker build -t expense-backend ./hack-main/server

echo.
echo Building frontend image...
docker build -t expense-frontend ./hack-main

echo.
echo Building complete! Run with: docker-compose up
pause