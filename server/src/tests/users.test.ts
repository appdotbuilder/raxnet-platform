import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tasksTable, taskWorksTable } from '../db/schema';
import { type UpdateUserInput } from '../schema';
import { 
  getUsers, 
  getUserById, 
  updateUser, 
  getUserStats, 
  blockUser, 
  suspendUser 
} from '../handlers/users';

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users', async () => {
      // Create test users
      await db.insert(usersTable).values([
        {
          email: 'user1@example.com',
          password_hash: 'hash1',
          full_name: 'User One',
          role: 'user',
          status: 'active'
        },
        {
          email: 'user2@example.com',
          password_hash: 'hash2',
          full_name: 'User Two',
          role: 'admin',
          status: 'suspended'
        }
      ]).execute();

      const result = await getUsers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('user1@example.com');
      expect(result[0].full_name).toBe('User One');
      expect(result[0].role).toBe('user');
      expect(result[0].status).toBe('active');
      expect(result[1].email).toBe('user2@example.com');
      expect(result[1].full_name).toBe('User Two');
      expect(result[1].role).toBe('admin');
      expect(result[1].status).toBe('suspended');
    });
  });

  describe('getUserById', () => {
    it('should return null when user does not exist', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user by ID', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed_password',
        full_name: 'Test User',
        role: 'user',
        status: 'active',
        coin_balance: 100,
        two_factor_enabled: true,
        email_verified: true
      }).returning().execute();

      const userId = users[0].id;
      const result = await getUserById(userId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.email).toBe('test@example.com');
      expect(result!.full_name).toBe('Test User');
      expect(result!.role).toBe('user');
      expect(result!.status).toBe('active');
      expect(result!.coin_balance).toBe(100);
      expect(result!.two_factor_enabled).toBe(true);
      expect(result!.email_verified).toBe(true);
    });
  });

  describe('updateUser', () => {
    it('should throw error when user does not exist', async () => {
      const input: UpdateUserInput = {
        id: 999,
        full_name: 'Updated Name'
      };

      await expect(updateUser(input)).rejects.toThrow(/User not found/i);
    });

    it('should update user email', async () => {
      const users = await db.insert(usersTable).values({
        email: 'old@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const input: UpdateUserInput = {
        id: users[0].id,
        email: 'new@example.com'
      };

      const result = await updateUser(input);

      expect(result.id).toBe(users[0].id);
      expect(result.email).toBe('new@example.com');
      expect(result.full_name).toBe('Test User'); // Unchanged
    });

    it('should update user status and coin balance', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active',
        coin_balance: 50
      }).returning().execute();

      const input: UpdateUserInput = {
        id: users[0].id,
        status: 'suspended',
        coin_balance: 200
      };

      const result = await updateUser(input);

      expect(result.status).toBe('suspended');
      expect(result.coin_balance).toBe(200);
      expect(result.email).toBe('test@example.com'); // Unchanged
    });

    it('should update two factor authentication setting', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active',
        two_factor_enabled: false
      }).returning().execute();

      const input: UpdateUserInput = {
        id: users[0].id,
        two_factor_enabled: true
      };

      const result = await updateUser(input);

      expect(result.two_factor_enabled).toBe(true);
    });

    it('should update updated_at timestamp', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const originalUpdatedAt = users[0].updated_at;

      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const input: UpdateUserInput = {
        id: users[0].id,
        full_name: 'Updated Name'
      };

      const result = await updateUser(input);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('getUserStats', () => {
    it('should return zero stats for new user', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const result = await getUserStats(users[0].id);

      expect(result.totalTasksCreated).toBe(0);
      expect(result.totalTasksCompleted).toBe(0);
      expect(result.totalCoinsEarned).toBe(0);
      expect(result.totalCoinsSpent).toBe(0);
    });

    it('should calculate correct stats for user with activities', async () => {
      // Create users
      const users = await db.insert(usersTable).values([
        {
          email: 'creator@example.com',
          password_hash: 'hashed',
          full_name: 'Task Creator',
          role: 'user',
          status: 'active'
        },
        {
          email: 'worker@example.com',
          password_hash: 'hashed',
          full_name: 'Task Worker',
          role: 'user',
          status: 'active'
        }
      ]).returning().execute();

      const creatorId = users[0].id;
      const workerId = users[1].id;

      // Create tasks by the creator
      const tasks = await db.insert(tasksTable).values([
        {
          creator_id: creatorId,
          platform: 'facebook',
          interaction_type: 'like',
          target_url: 'https://facebook.com/post1',
          target_interactions: 100,
          coins_per_interaction: 5,
          total_coins_allocated: 500
        },
        {
          creator_id: creatorId,
          platform: 'instagram',
          interaction_type: 'follow',
          target_url: 'https://instagram.com/account1',
          target_interactions: 50,
          coins_per_interaction: 10,
          total_coins_allocated: 500
        }
      ]).returning().execute();

      // Create task works by the worker
      await db.insert(taskWorksTable).values([
        {
          task_id: tasks[0].id,
          worker_id: workerId,
          coins_earned: 5
        },
        {
          task_id: tasks[1].id,
          worker_id: workerId,
          coins_earned: 10
        }
      ]).execute();

      // Test stats for task creator
      const creatorStats = await getUserStats(creatorId);
      expect(creatorStats.totalTasksCreated).toBe(2);
      expect(creatorStats.totalTasksCompleted).toBe(0);
      expect(creatorStats.totalCoinsEarned).toBe(0);
      expect(creatorStats.totalCoinsSpent).toBe(1000);

      // Test stats for task worker
      const workerStats = await getUserStats(workerId);
      expect(workerStats.totalTasksCreated).toBe(0);
      expect(workerStats.totalTasksCompleted).toBe(2);
      expect(workerStats.totalCoinsEarned).toBe(15);
      expect(workerStats.totalCoinsSpent).toBe(0);
    });
  });

  describe('blockUser', () => {
    it('should throw error when user does not exist', async () => {
      await expect(blockUser(999)).rejects.toThrow(/User not found/i);
    });

    it('should block user successfully', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const result = await blockUser(users[0].id);

      expect(result.id).toBe(users[0].id);
      expect(result.status).toBe('blocked');
      expect(result.email).toBe('test@example.com'); // Other fields unchanged
      expect(result.full_name).toBe('Test User');
    });

    it('should update updated_at timestamp when blocking', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const originalUpdatedAt = users[0].updated_at;

      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await blockUser(users[0].id);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('suspendUser', () => {
    it('should throw error when user does not exist', async () => {
      await expect(suspendUser(999)).rejects.toThrow(/User not found/i);
    });

    it('should suspend user successfully', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const result = await suspendUser(users[0].id);

      expect(result.id).toBe(users[0].id);
      expect(result.status).toBe('suspended');
      expect(result.email).toBe('test@example.com'); // Other fields unchanged
      expect(result.full_name).toBe('Test User');
    });

    it('should update updated_at timestamp when suspending', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'active'
      }).returning().execute();

      const originalUpdatedAt = users[0].updated_at;

      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await suspendUser(users[0].id);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should be able to suspend already blocked user', async () => {
      const users = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hashed',
        full_name: 'Test User',
        role: 'user',
        status: 'blocked'
      }).returning().execute();

      const result = await suspendUser(users[0].id);

      expect(result.status).toBe('suspended');
    });
  });
});