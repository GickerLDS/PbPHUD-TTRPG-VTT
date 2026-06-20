import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';
import { config } from '../env.js';

const schemaPath = path.join(config.appRoot, 'server', 'db', 'schema.sql');
const schema = await fs.readFile(schemaPath, 'utf8');

let connection;
try {
  connection = await pool.getConnection();
  for (const statement of schema.split(/;\s*(?:\r?\n|$)/)) {
    const sql = statement.trim();
    if (sql) await connection.query(sql);
  }
  console.log('Database schema is up to date.');
} finally {
  if (connection) connection.release();
  await pool.end();
}
