import { MongoClient } from 'mongodb';

let client = null;
let db = null;

const uri = process.env.MONGO_URI || '';
const dbName = process.env.MONGO_DB || 'hack';

export const getMongoDb = async () => {
  if (!uri) {
    return null; // Mongo is optional; skip when not configured
  }
  if (db) return db;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  await client.connect();
  db = client.db(dbName);
  return db;
};

export const closeMongo = async () => {
  try {
    if (client) {
      await client.close();
    }
  } finally {
    client = null;
    db = null;
  }
};
