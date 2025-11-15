@echo off
echo Setting up basic data for expense management system...
cd server
node scripts/ensure-data.js
echo Data setup completed!
pause