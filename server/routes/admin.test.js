import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../db.js';
import { adminRouter } from './admin.js';

test.after(async () => {
  await pool.end();
});

test('admin demo assignment save routes are registered', () => {
  const demoAssignmentRoutes = adminRouter.stack
    .filter((layer) => layer.route?.path === '/demo-assignment')
    .flatMap((layer) => Object.keys(layer.route.methods));

  assert.ok(demoAssignmentRoutes.includes('get'));
  assert.ok(demoAssignmentRoutes.includes('patch'));
  assert.ok(demoAssignmentRoutes.includes('post'));
});
