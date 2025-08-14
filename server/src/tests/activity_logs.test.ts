import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { activityLogsTable, usersTable } from '../db/schema';
import { type CreateActivityLogInput } from '../schema';
import {
  createActivityLog,
  getActivityLogs,
  getUserActivityLogs,
  logUserLogin,
  logTaskCreation,
  logTaskWork,
  logTransaction,
  logAdminAction
} from '../handlers/activity_logs';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  full_name: 'Test User'
};

const adminUser = {
  email: 'admin@example.com',
  password_hash: 'hashed_admin_password',
  full_name: 'Admin User',
  role: 'admin' as const
};

// Test activity log input
const testActivityLogInput: CreateActivityLogInput = {
  user_id: 1,
  action: 'test_action',
  resource_type: 'test_resource',
  resource_id: 123,
  details: 'Test activity log details',
  ip_address: '192.168.1.100',
  user_agent: 'Mozilla/5.0 Test Browser'
};

describe('Activity Logs Handler', () => {
  let userId: number;
  let adminId: number;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    const adminResult = await db.insert(usersTable)
      .values(adminUser)
      .returning()
      .execute();
    adminId = adminResult[0].id;
  });

  afterEach(resetDB);

  describe('createActivityLog', () => {
    it('should create an activity log with all fields', async () => {
      const input = { ...testActivityLogInput, user_id: userId };
      const result = await createActivityLog(input);

      expect(result.id).toBeDefined();
      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('test_action');
      expect(result.resource_type).toEqual('test_resource');
      expect(result.resource_id).toEqual(123);
      expect(result.details).toEqual('Test activity log details');
      expect(result.ip_address).toEqual('192.168.1.100');
      expect(result.user_agent).toEqual('Mozilla/5.0 Test Browser');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create an activity log with minimal required fields', async () => {
      const minimalInput: CreateActivityLogInput = {
        action: 'minimal_action',
        resource_type: 'minimal_resource',
        ip_address: '127.0.0.1'
      };

      const result = await createActivityLog(minimalInput);

      expect(result.id).toBeDefined();
      expect(result.user_id).toBeNull();
      expect(result.action).toEqual('minimal_action');
      expect(result.resource_type).toEqual('minimal_resource');
      expect(result.resource_id).toBeNull();
      expect(result.details).toBeNull();
      expect(result.ip_address).toEqual('127.0.0.1');
      expect(result.user_agent).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save activity log to database', async () => {
      const input = { ...testActivityLogInput, user_id: userId };
      const result = await createActivityLog(input);

      const logs = await db.select()
        .from(activityLogsTable)
        .where(eq(activityLogsTable.id, result.id))
        .execute();

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toEqual('test_action');
      expect(logs[0].resource_type).toEqual('test_resource');
      expect(logs[0].ip_address).toEqual('192.168.1.100');
    });
  });

  describe('getActivityLogs', () => {
    beforeEach(async () => {
      // Create multiple activity logs for testing
      await createActivityLog({
        user_id: userId,
        action: 'login',
        resource_type: 'auth',
        ip_address: '192.168.1.1'
      });

      await createActivityLog({
        user_id: userId,
        action: 'logout',
        resource_type: 'auth',
        ip_address: '192.168.1.1'
      });

      await createActivityLog({
        user_id: adminId,
        action: 'admin_update',
        resource_type: 'user',
        resource_id: userId,
        ip_address: '10.0.0.1'
      });

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await createActivityLog({
        user_id: userId,
        action: 'task_created',
        resource_type: 'task',
        resource_id: 1,
        ip_address: '192.168.1.1'
      });
    });

    it('should fetch all activity logs without filters', async () => {
      const logs = await getActivityLogs();

      expect(logs.length).toBeGreaterThanOrEqual(4);
      expect(logs[0].created_at >= logs[1].created_at).toBe(true); // Should be ordered by created_at desc
    });

    it('should filter activity logs by user ID', async () => {
      const logs = await getActivityLogs({ userId });

      expect(logs.length).toEqual(3);
      logs.forEach(log => {
        expect(log.user_id).toEqual(userId);
      });
    });

    it('should filter activity logs by action', async () => {
      const logs = await getActivityLogs({ action: 'login' });

      expect(logs.length).toEqual(1);
      expect(logs[0].action).toEqual('login');
    });

    it('should filter activity logs by resource type', async () => {
      const logs = await getActivityLogs({ resourceType: 'auth' });

      expect(logs.length).toEqual(2);
      logs.forEach(log => {
        expect(log.resource_type).toEqual('auth');
      });
    });

    it('should filter activity logs by date range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const logs = await getActivityLogs({
        startDate: oneHourAgo,
        endDate: oneHourFromNow
      });

      expect(logs.length).toBeGreaterThanOrEqual(4);
      logs.forEach(log => {
        expect(log.created_at >= oneHourAgo).toBe(true);
        expect(log.created_at <= oneHourFromNow).toBe(true);
      });
    });

    it('should limit activity logs results', async () => {
      const logs = await getActivityLogs({ limit: 2 });

      expect(logs.length).toEqual(2);
    });

    it('should apply multiple filters correctly', async () => {
      const logs = await getActivityLogs({
        userId: userId,
        resourceType: 'auth'
      });

      expect(logs.length).toEqual(2);
      logs.forEach(log => {
        expect(log.user_id).toEqual(userId);
        expect(log.resource_type).toEqual('auth');
      });
    });
  });

  describe('getUserActivityLogs', () => {
    beforeEach(async () => {
      // Create activity logs for the test user
      for (let i = 0; i < 5; i++) {
        await createActivityLog({
          user_id: userId,
          action: `action_${i}`,
          resource_type: 'test',
          ip_address: '192.168.1.1'
        });
      }

      // Create activity logs for another user
      await createActivityLog({
        user_id: adminId,
        action: 'admin_action',
        resource_type: 'admin',
        ip_address: '10.0.0.1'
      });
    });

    it('should fetch activity logs for specific user', async () => {
      const logs = await getUserActivityLogs(userId);

      expect(logs.length).toEqual(5);
      logs.forEach(log => {
        expect(log.user_id).toEqual(userId);
      });
    });

    it('should respect limit parameter', async () => {
      const logs = await getUserActivityLogs(userId, 3);

      expect(logs.length).toEqual(3);
      logs.forEach(log => {
        expect(log.user_id).toEqual(userId);
      });
    });

    it('should order logs by created_at desc', async () => {
      const logs = await getUserActivityLogs(userId);

      for (let i = 1; i < logs.length; i++) {
        expect(logs[i - 1].created_at >= logs[i].created_at).toBe(true);
      }
    });
  });

  describe('logUserLogin', () => {
    it('should create a login activity log', async () => {
      const result = await logUserLogin(userId, '192.168.1.1', 'Test Browser');

      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('user_login');
      expect(result.resource_type).toEqual('auth');
      expect(result.resource_id).toEqual(userId);
      expect(result.details).toEqual('User logged in successfully');
      expect(result.ip_address).toEqual('192.168.1.1');
      expect(result.user_agent).toEqual('Test Browser');
    });

    it('should create a login activity log without user agent', async () => {
      const result = await logUserLogin(userId, '192.168.1.1');

      expect(result.user_agent).toBeNull();
    });
  });

  describe('logTaskCreation', () => {
    it('should create a task creation activity log', async () => {
      const taskId = 123;
      const result = await logTaskCreation(userId, taskId, '192.168.1.1');

      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('task_created');
      expect(result.resource_type).toEqual('task');
      expect(result.resource_id).toEqual(taskId);
      expect(result.details).toEqual('User created a new task');
      expect(result.ip_address).toEqual('192.168.1.1');
    });
  });

  describe('logTaskWork', () => {
    it('should create a task work completion activity log', async () => {
      const taskId = 456;
      const result = await logTaskWork(userId, taskId, '192.168.1.1');

      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('task_completed');
      expect(result.resource_type).toEqual('task_work');
      expect(result.resource_id).toEqual(taskId);
      expect(result.details).toEqual('User completed a task');
      expect(result.ip_address).toEqual('192.168.1.1');
    });
  });

  describe('logTransaction', () => {
    it('should create a transaction activity log', async () => {
      const transactionId = 789;
      const result = await logTransaction(userId, transactionId, 'created', '192.168.1.1');

      expect(result.user_id).toEqual(userId);
      expect(result.action).toEqual('transaction_created');
      expect(result.resource_type).toEqual('transaction');
      expect(result.resource_id).toEqual(transactionId);
      expect(result.details).toEqual('Transaction created');
      expect(result.ip_address).toEqual('192.168.1.1');
    });
  });

  describe('logAdminAction', () => {
    it('should create an admin action activity log with all parameters', async () => {
      const result = await logAdminAction(
        adminId,
        'user_update',
        'user',
        userId,
        'Updated user profile',
        '10.0.0.1'
      );

      expect(result.user_id).toEqual(adminId);
      expect(result.action).toEqual('admin_user_update');
      expect(result.resource_type).toEqual('user');
      expect(result.resource_id).toEqual(userId);
      expect(result.details).toEqual('Updated user profile');
      expect(result.ip_address).toEqual('10.0.0.1');
    });

    it('should create an admin action activity log with minimal parameters', async () => {
      const result = await logAdminAction(adminId, 'system_update', 'system');

      expect(result.user_id).toEqual(adminId);
      expect(result.action).toEqual('admin_system_update');
      expect(result.resource_type).toEqual('system');
      expect(result.resource_id).toBeNull();
      expect(result.details).toEqual('Admin performed system_update on system');
      expect(result.ip_address).toEqual('127.0.0.1'); // Default IP
    });
  });

  describe('database queries with date filtering', () => {
    it('should query activity logs within date range correctly', async () => {
      // Create an activity log
      const logResult = await createActivityLog({
        user_id: userId,
        action: 'test_action',
        resource_type: 'test',
        ip_address: '127.0.0.1'
      });

      // Use a wider time range to ensure we capture the created log
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

      const logs = await getActivityLogs({
        startDate: oneHourAgo,
        endDate: oneHourFromNow
      });

      expect(logs.length).toBeGreaterThan(0);
      
      // Verify our specific log is included
      const ourLog = logs.find(log => log.id === logResult.id);
      expect(ourLog).toBeDefined();
      
      logs.forEach(log => {
        expect(log.created_at).toBeInstanceOf(Date);
        expect(log.created_at >= oneHourAgo).toBe(true);
        expect(log.created_at <= oneHourFromNow).toBe(true);
      });
    });
  });
});