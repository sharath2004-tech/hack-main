import dotenv from 'dotenv';
import { createConnection } from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnv = () => {
  const potentialPaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const envPath of potentialPaths) {
    try {
      dotenv.config({ path: envPath });
      if (process.env.DB_HOST) {
        return;
      }
    } catch (error) {
      // continue trying other paths
    }
  }
};

const ensureExpenseColumns = async (connection, database) => {
  const columns = [
    ['receipt_url', 'VARCHAR(500) NULL'],
    ['ocr_vendor', 'VARCHAR(255) NULL'],
    ['ocr_amount', 'DECIMAL(12,2) NULL'],
    ['ocr_currency', 'VARCHAR(10) NULL'],
    ['ocr_date', 'DATE NULL'],
    ['ocr_confidence', 'DECIMAL(5,2) NULL'],
    ['ocr_text', 'LONGTEXT NULL'],
  ];

  for (const [name, definition] of columns) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = 'expenses'
          AND COLUMN_NAME = ?`,
      [database, name]
    );

    if (rows[0]?.count === 0) {
      console.log(`Adding missing column \`${name}\` to expenses...`);
      await connection.query(`ALTER TABLE expenses ADD COLUMN \`${name}\` ${definition}`);
    }
  }
};

const ensureApprovalRuleColumns = async (connection, database) => {
  const checks = [
    {
      column: 'rule_type',
      action: async () => {
        console.log('Adding missing column `rule_type` to approval_rules...');
        await connection.query(
          "ALTER TABLE approval_rules ADD COLUMN `rule_type` ENUM('percentage','specific','hybrid') NOT NULL DEFAULT 'percentage' AFTER approvers"
        );
      },
    },
    {
      column: 'approver_sequence',
      action: async () => {
        console.log('Adding missing column `approver_sequence` to approval_rules...');
        await connection.query('ALTER TABLE approval_rules ADD COLUMN `approver_sequence` JSON NULL AFTER approvers');
      },
    },
  ];

  for (const check of checks) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = 'approval_rules'
          AND COLUMN_NAME = ?`,
      [database, check.column]
    );

    if (rows[0]?.count === 0) {
      await check.action();
    }
  }
};

const ensureApprovalsSequenceColumn = async (connection, database) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'approvals'
        AND COLUMN_NAME = 'sequence_order'`,
    [database]
  );

  if (rows[0]?.count === 0) {
    console.log('Adding missing column `sequence_order` to approvals...');
    await connection.query('ALTER TABLE approvals ADD COLUMN `sequence_order` INT NOT NULL DEFAULT 1 AFTER approver_id');
  }
};

const run = async () => {
  loadEnv();

  const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  console.log(`Connecting to MySQL at ${host}:${port}...`);
  const rootConnection = await createConnection({ host, port, user, password });

  console.log(`Ensuring database \`${database}\` exists...`);
  await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await rootConnection.end();

  console.log('Loading schema.sql...');
  const schemaPath = path.resolve(__dirname, '../schema.sql');
  const schemaRaw = await fs.readFile(schemaPath, 'utf8');

  const statements = schemaRaw
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} schema statements...`);
  const dbConnection = await createConnection({ host, port, user, password, database });

  for (const statement of statements) {
    await dbConnection.query(statement);
  }

  await ensureExpenseColumns(dbConnection, database);
  await ensureApprovalRuleColumns(dbConnection, database);
  await ensureApprovalsSequenceColumn(dbConnection, database);

  await dbConnection.end();

  console.log('Database setup completed successfully.');
};

run().catch((error) => {
  console.error('Failed to set up database:', error);
  process.exit(1);
});
