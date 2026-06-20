import mariadb from 'mariadb';
import { config } from './env.js';

export const pool = mariadb.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4',
  connectTimeout: 2500,
  acquireTimeout: 3000
});

export async function query(sql, params = []) {
  let connection;
  try {
    connection = await pool.getConnection();
    return await connection.query(sql, params);
  } catch (error) {
    throw normalizeDatabaseError(error);
  } finally {
    if (connection) connection.release();
  }
}

export async function transaction(work) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (connection) await connection.rollback();
    throw normalizeDatabaseError(error);
  } finally {
    if (connection) connection.release();
  }
}

export async function checkDatabase() {
  const rows = await query('SELECT 1 AS ok');
  return rows?.[0]?.ok === 1;
}

function normalizeDatabaseError(error) {
  if (error?.code === 'ER_GET_CONNECTION_TIMEOUT' || error?.errno === 45028) {
    const next = new Error(
      'Database connection failed. Check that MariaDB is running and that DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in .env are correct.'
    );
    next.status = 503;
    next.cause = error;
    return next;
  }

  if (error?.code === 'ECONNREFUSED') {
    const next = new Error('MariaDB refused the connection. Start MariaDB or update DB_HOST/DB_PORT in .env.');
    next.status = 503;
    next.cause = error;
    return next;
  }

  if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
    const next = new Error('MariaDB access denied. Check DB_USER and DB_PASSWORD in .env.');
    next.status = 503;
    next.cause = error;
    return next;
  }

  if (error?.code === 'ER_BAD_DB_ERROR') {
    const next = new Error('MariaDB database not found. Create DB_NAME from .env, then run npm.cmd run db:migrate.');
    next.status = 503;
    next.cause = error;
    return next;
  }

  return error;
}
