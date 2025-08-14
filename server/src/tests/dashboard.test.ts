import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  tasksTable, 
  taskWorksTable, 
  transactionsTable, 
  activityLogsTable 
} from '../db/schema';
import { 
  getUserDashboard, 
  getAdminDashboard, 
  getSystemHealth 
} from '../handlers/dashboard';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getUserDashboard', () => {
    it('should return user dashboard data for existing user', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          full_name: 'Test User',
          coin_balance: 1500
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      // Create test tasks created by user
      const taskResult = await db.insert(tasksTable)
        .values({
          creator_id: userId,
          platform: 'facebook',
          interaction_type: 'like',
          target_url: 'https://facebook.com/post1',
          target_interactions: 100,
          coins_per_interaction: 5,
          total_coins_allocated: 500
        })
        .returning()
        .execute();

      // Create test task work (tasks completed by user)
      await db.insert(taskWorksTable)
        .values({
          task_id: taskResult[0].id,
          worker_id: userId,
          coins_earned: 50
        })
        .execute();

      // Create test transactions
      await db.insert(transactionsTable)
        .values({
          user_id: userId,
          type: 'task_earning',
          amount: 50,
          status: 'completed',
          description: 'Task completion reward'
        })
        .execute();

      // Create test activity log
      await db.insert(activityLogsTable)
        .values({
          user_id: userId,
          action: 'task_completed',
          resource_type: 'task',
          resource_id: taskResult[0].id,
          ip_address: '127.0.0.1'
        })
        .execute();

      const result = await getUserDashboard(userId);

      // Verify user data
      expect(result.user.id).toBe(userId);
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.full_name).toBe('Test User');
      expect(result.coinBalance).toBe(1500);

      // Verify stats
      expect(result.stats.tasksCreated).toBe(1);
      expect(result.stats.tasksCompleted).toBe(1);
      expect(result.stats.totalCoinsEarned).toBe(50);
      expect(result.stats.totalCoinsSpent).toBe(500);

      // Verify arrays exist
      expect(Array.isArray(result.recentTransactions)).toBe(true);
      expect(Array.isArray(result.recentActivities)).toBe(true);
      expect(result.recentTransactions.length).toBe(1);
      expect(result.recentActivities.length).toBe(1);

      // Verify transaction data
      expect(result.recentTransactions[0].type).toBe('task_earning');
      expect(result.recentTransactions[0].amount).toBe(50);
      expect(result.recentTransactions[0].description).toBe('Task completion reward');

      // Verify activity data
      expect(result.recentActivities[0].action).toBe('task_completed');
      expect(result.recentActivities[0].resource_type).toBe('task');
      expect(result.recentActivities[0].ip_address).toBe('127.0.0.1');
    });

    it('should return zero stats for user with no activity', async () => {
      // Create test user with no activity
      const userResult = await db.insert(usersTable)
        .values({
          email: 'inactive@example.com',
          password_hash: 'hashed_password',
          full_name: 'Inactive User',
          coin_balance: 0
        })
        .returning()
        .execute();

      const result = await getUserDashboard(userResult[0].id);

      expect(result.stats.tasksCreated).toBe(0);
      expect(result.stats.tasksCompleted).toBe(0);
      expect(result.stats.totalCoinsEarned).toBe(0);
      expect(result.stats.totalCoinsSpent).toBe(0);
      expect(result.recentTransactions).toHaveLength(0);
      expect(result.recentActivities).toHaveLength(0);
    });

    it('should throw error for non-existent user', async () => {
      await expect(getUserDashboard(99999)).rejects.toThrow(/user not found/i);
    });

    it('should limit recent transactions and activities to 10 items', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          full_name: 'Test User',
          coin_balance: 1000
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      // Create 15 transactions
      for (let i = 0; i < 15; i++) {
        await db.insert(transactionsTable)
          .values({
            user_id: userId,
            type: 'task_earning',
            amount: 10,
            status: 'completed',
            description: `Transaction ${i + 1}`
          })
          .execute();
      }

      // Create 15 activity logs
      for (let i = 0; i < 15; i++) {
        await db.insert(activityLogsTable)
          .values({
            user_id: userId,
            action: 'test_action',
            resource_type: 'test',
            ip_address: '127.0.0.1'
          })
          .execute();
      }

      const result = await getUserDashboard(userId);

      expect(result.recentTransactions).toHaveLength(10);
      expect(result.recentActivities).toHaveLength(10);
    });
  });

  describe('getAdminDashboard', () => {
    it('should return admin dashboard data with correct stats', async () => {
      // Create test users
      const user1 = await db.insert(usersTable)
        .values({
          email: 'user1@example.com',
          password_hash: 'hashed_password',
          full_name: 'User 1',
          status: 'active'
        })
        .returning()
        .execute();

      const user2 = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hashed_password',
          full_name: 'User 2',
          status: 'suspended'
        })
        .returning()
        .execute();

      // Create test tasks
      const task1 = await db.insert(tasksTable)
        .values({
          creator_id: user1[0].id,
          platform: 'facebook',
          interaction_type: 'like',
          target_url: 'https://facebook.com/post1',
          target_interactions: 100,
          coins_per_interaction: 5,
          total_coins_allocated: 500,
          status: 'active'
        })
        .returning()
        .execute();

      const task2 = await db.insert(tasksTable)
        .values({
          creator_id: user2[0].id,
          platform: 'instagram',
          interaction_type: 'follow',
          target_url: 'https://instagram.com/profile1',
          target_interactions: 50,
          coins_per_interaction: 10,
          total_coins_allocated: 500,
          status: 'completed'
        })
        .returning()
        .execute();

      // Create test transactions
      await db.insert(transactionsTable)
        .values({
          user_id: user1[0].id,
          type: 'topup',
          amount: 1000,
          status: 'completed',
          description: 'Coin purchase'
        })
        .execute();

      await db.insert(transactionsTable)
        .values({
          user_id: user2[0].id,
          type: 'task_payment',
          amount: 500,
          status: 'completed',
          description: 'Task payment'
        })
        .execute();

      // Create test task works (some verified, some pending)
      await db.insert(taskWorksTable)
        .values({
          task_id: task1[0].id,
          worker_id: user2[0].id,
          coins_earned: 50,
          verified_at: new Date()
        })
        .execute();

      await db.insert(taskWorksTable)
        .values({
          task_id: task2[0].id,
          worker_id: user1[0].id,
          coins_earned: 100
          // No verified_at - pending verification
        })
        .execute();

      // Create test activity logs
      await db.insert(activityLogsTable)
        .values({
          user_id: user1[0].id,
          action: 'login',
          resource_type: 'user',
          ip_address: '127.0.0.1'
        })
        .execute();

      const result = await getAdminDashboard();

      // Verify basic stats
      expect(result.stats.totalUsers).toBe(2);
      expect(result.stats.activeUsers).toBe(1); // Only user1 is active
      expect(result.stats.totalTasks).toBe(2);
      expect(result.stats.activeTasks).toBe(1); // Only task1 is active
      expect(result.stats.totalTransactionValue).toBe(1500); // 1000 + 500
      expect(result.stats.pendingVerifications).toBe(1); // One task work without verified_at

      // Verify data arrays exist
      expect(Array.isArray(result.userGrowthData)).toBe(true);
      expect(Array.isArray(result.transactionData)).toBe(true);
      expect(Array.isArray(result.recentActivities)).toBe(true);

      // Verify platform stats
      expect(typeof result.platformStats).toBe('object');
      expect(result.platformStats['facebook']).toBe(1);
      expect(result.platformStats['instagram']).toBe(1);

      // Verify activities
      expect(result.recentActivities.length).toBeGreaterThan(0);
    });

    it('should return empty stats when no data exists', async () => {
      const result = await getAdminDashboard();

      expect(result.stats.totalUsers).toBe(0);
      expect(result.stats.activeUsers).toBe(0);
      expect(result.stats.totalTasks).toBe(0);
      expect(result.stats.activeTasks).toBe(0);
      expect(result.stats.totalTransactionValue).toBe(0);
      expect(result.stats.pendingVerifications).toBe(0);

      expect(result.userGrowthData).toHaveLength(0);
      expect(result.transactionData).toHaveLength(0);
      expect(result.recentActivities).toHaveLength(0);
      expect(Object.keys(result.platformStats)).toHaveLength(0);
    });

    it('should process growth and transaction data correctly', async () => {
      // Create user with specific creation date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await db.insert(usersTable)
        .values({
          email: 'user@example.com',
          password_hash: 'hashed_password',
          full_name: 'Test User',
          created_at: yesterday
        })
        .execute();

      const result = await getAdminDashboard();

      // Should have growth data
      expect(result.userGrowthData.length).toBeGreaterThan(0);
      
      // Verify date format
      if (result.userGrowthData.length > 0) {
        expect(result.userGrowthData[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof result.userGrowthData[0].count).toBe('number');
      }
    });

    it('should limit recent activities to 20 items', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          full_name: 'Test User'
        })
        .returning()
        .execute();

      // Create 25 activity logs
      for (let i = 0; i < 25; i++) {
        await db.insert(activityLogsTable)
          .values({
            user_id: userResult[0].id,
            action: 'test_action',
            resource_type: 'test',
            ip_address: '127.0.0.1'
          })
          .execute();
      }

      const result = await getAdminDashboard();

      expect(result.recentActivities).toHaveLength(20);
    });
  });

  describe('getSystemHealth', () => {
    it('should return healthy status when database is accessible', async () => {
      const result = await getSystemHealth();

      expect(result.status).toBe('healthy');
      expect(result.checks.database).toBe(true);
      expect(typeof result.checks.paymentGateway).toBe('boolean');
      expect(typeof result.checks.socialMediaApis).toBe('boolean');
      expect(typeof result.uptime).toBe('number');
      expect(result.version).toBe('1.0.0');
    });

    it('should have consistent return structure', async () => {
      const result = await getSystemHealth();

      // Verify structure
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('version');

      expect(result.checks).toHaveProperty('database');
      expect(result.checks).toHaveProperty('paymentGateway');
      expect(result.checks).toHaveProperty('socialMediaApis');

      // Verify types
      expect(['healthy', 'warning', 'critical']).toContain(result.status);
      expect(typeof result.uptime).toBe('number');
      expect(typeof result.version).toBe('string');
    });
  });
});