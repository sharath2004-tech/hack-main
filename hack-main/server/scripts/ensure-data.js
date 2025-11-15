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

const ensureBasicData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'expense-management'
    });

    console.log('Connected to MongoDB');

    // Check if company exists
    let company = await Company.findOne();
    if (!company) {
      company = await Company.create({
        name: 'Default Company',
        country: 'India',
        defaultCurrency: 'INR'
      });
      console.log('Created default company');
    }

    // Ensure default categories exist
    const defaultCategories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other', 'Accommodation', 'Transportation', 'Meals', 'Equipment', 'Software'];
    
    for (const categoryName of defaultCategories) {
      const existingCategory = await ExpenseCategory.findOne({
        companyId: company._id,
        name: categoryName
      });
      
      if (!existingCategory) {
        await ExpenseCategory.create({
          companyId: company._id,
          name: categoryName
        });
        console.log(`Created category: ${categoryName}`);
      }
    }

    // Ensure at least one admin exists
    const adminCount = await User.countDocuments({ 
      companyId: company._id, 
      role: 'admin' 
    });

    if (adminCount === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await User.create({
        companyId: company._id,
        name: 'System Admin',
        email: 'admin@company.com',
        passwordHash,
        role: 'admin'
      });
      console.log('Created default admin user: admin@company.com / admin123');
    }

    // Ensure at least one manager exists
    const managerCount = await User.countDocuments({ 
      companyId: company._id, 
      role: 'manager' 
    });

    if (managerCount === 0) {
      const admin = await User.findOne({ companyId: company._id, role: 'admin' });
      const passwordHash = await bcrypt.hash('manager123', 10);
      await User.create({
        companyId: company._id,
        name: 'Default Manager',
        email: 'manager@company.com',
        passwordHash,
        role: 'manager',
        managerId: admin._id
      });
      console.log('Created default manager user: manager@company.com / manager123');
    }

    console.log('Basic data setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
};

ensureBasicData();