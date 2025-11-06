import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Company from '../models/Company.js';
import User from '../models/User.js';
import ExpenseCategory from '../models/ExpenseCategory.js';
import Expense from '../models/Expense.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense_tracker';
    await mongoose.connect(mongoURI);

    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      Company.deleteMany({}),
      User.deleteMany({}),
      ExpenseCategory.deleteMany({}),
      Expense.deleteMany({})
    ]);

    console.log('Cleared existing data');

    // Create company
    const company = new Company({
      name: 'Demo Company',
      country: 'United States',
      defaultCurrency: 'USD'
    });
    await company.save();

    // Create expense categories
    const categories = ['Travel', 'Food', 'Office Supplies', 'Entertainment', 'Other'];
    const categoryDocs = [];
    
    for (const categoryName of categories) {
      const category = new ExpenseCategory({
        companyId: company._id,
        name: categoryName
      });
      await category.save();
      categoryDocs.push(category);
    }

    // Create users
    const passwordHash = await bcrypt.hash('password123', 10);

    const admin = new User({
      companyId: company._id,
      name: 'Admin User',
      email: 'admin@demo.com',
      passwordHash,
      role: 'admin'
    });
    await admin.save();

    const manager = new User({
      companyId: company._id,
      name: 'Manager User',
      email: 'manager@demo.com',
      passwordHash,
      role: 'manager',
      managerId: admin._id
    });
    await manager.save();

    const employee = new User({
      companyId: company._id,
      name: 'Employee User',
      email: 'employee@demo.com',
      passwordHash,
      role: 'employee',
      managerId: manager._id
    });
    await employee.save();

    // Create sample expenses
    const sampleExpenses = [
      {
        companyId: company._id,
        userId: employee._id,
        description: 'Business lunch with client',
        date: new Date('2024-01-15'),
        categoryId: categoryDocs.find(c => c.name === 'Food')._id,
        paidBy: 'Credit Card',
        amount: 85.50,
        currency: 'USD',
        status: 'pending'
      },
      {
        companyId: company._id,
        userId: employee._id,
        description: 'Flight to conference',
        date: new Date('2024-01-10'),
        categoryId: categoryDocs.find(c => c.name === 'Travel')._id,
        paidBy: 'Cash',
        amount: 450.00,
        currency: 'USD',
        status: 'approved'
      }
    ];

    for (const expenseData of sampleExpenses) {
      const expense = new Expense(expenseData);
      await expense.save();
    }

    console.log('Database seeded successfully!');
    console.log('Demo users created:');
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