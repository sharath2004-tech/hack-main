import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Company from '../models/Company.js';
import User from '../models/User.js';
import ExpenseCategory from '../models/ExpenseCategory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'expense-management'
    });

    console.log('Connected to MongoDB');

    await Company.deleteMany({});
    await User.deleteMany({});
    await ExpenseCategory.deleteMany({});

    const company = await Company.create({
      name: 'Demo Company',
      country: 'India',
      defaultCurrency: 'INR'
    });

    const categories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other'];
    for (const categoryName of categories) {
      await ExpenseCategory.create({
        companyId: company._id,
        name: categoryName
      });
    }

    const passwordHash = await bcrypt.hash('password123', 10);

    const admin = await User.create({
      companyId: company._id,
      name: 'Admin User',
      email: 'admin@demo.com',
      passwordHash,
      role: 'admin'
    });

    const manager = await User.create({
      companyId: company._id,
      name: 'Manager User',
      email: 'manager@demo.com',
      passwordHash,
      role: 'manager',
      managerId: admin._id
    });

    await User.create({
      companyId: company._id,
      name: 'Employee User',
      email: 'employee@demo.com',
      passwordHash,
      role: 'employee',
      managerId: manager._id
    });

    console.log('Database seeded successfully!');
    console.log('Demo users:');
    console.log('- Admin: admin@demo.com / password123');
    console.log('- Manager: manager@demo.com / password123');
    console.log('- Employee: employee@demo.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDatabase();