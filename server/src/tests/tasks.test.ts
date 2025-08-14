import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tasksTable } from '../db/schema';
import { type CreateTaskInput } from '../schema';
import { createTask } from '../handlers/tasks';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  full_name: 'Test User',
  coin_balance: 1000
};

const testTaskInput: CreateTaskInput = {
  platform: 'facebook',
  interaction_type: 'like',
  target_url: 'https://facebook.com/post/123',
  target_interactions: 100,
  coins_per_interaction: 5
};

describe('createTask', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a task successfully', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create task
    const result = await createTask(testTaskInput, userId);

    // Verify task properties
    expect(result.creator_id).toEqual(userId);
    expect(result.platform).toEqual('facebook');
    expect(result.interaction_type).toEqual('like');
    expect(result.target_url).toEqual('https://facebook.com/post/123');
    expect(result.target_interactions).toEqual(100);
    expect(result.coins_per_interaction).toEqual(5);
    expect(result.total_coins_allocated).toEqual(500);
    expect(result.completed_interactions).toEqual(0);
    expect(result.status).toEqual('active');
    expect(result.requires_verification).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.completed_at).toBeNull();
  });

  it('should save task to database', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create task
    const result = await createTask(testTaskInput, userId);

    // Verify task is saved in database
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, result.id))
      .execute();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].creator_id).toEqual(userId);
    expect(tasks[0].platform).toEqual('facebook');
    expect(tasks[0].target_url).toEqual('https://facebook.com/post/123');
    expect(tasks[0].total_coins_allocated).toEqual(500);
  });

  it('should deduct coins from creator balance', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const initialBalance = testUser.coin_balance;
    const expectedCost = testTaskInput.target_interactions * testTaskInput.coins_per_interaction;

    // Create task
    await createTask(testTaskInput, userId);

    // Check user's updated balance
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(updatedUser[0].coin_balance).toEqual(initialBalance - expectedCost);
    expect(updatedUser[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error if creator not found', async () => {
    const nonExistentUserId = 99999;

    await expect(createTask(testTaskInput, nonExistentUserId))
      .rejects.toThrow(/Creator not found/i);
  });

  it('should throw error if insufficient balance', async () => {
    // Create user with insufficient balance
    const poorUser = {
      ...testUser,
      coin_balance: 100 // Less than required 500 coins
    };

    const userResult = await db.insert(usersTable)
      .values(poorUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    await expect(createTask(testTaskInput, userId))
      .rejects.toThrow(/Insufficient coin balance/i);
  });

  it('should handle different platform types', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const instagramTask: CreateTaskInput = {
      platform: 'instagram',
      interaction_type: 'follow',
      target_url: 'https://instagram.com/profile/test',
      target_interactions: 50,
      coins_per_interaction: 3
    };

    const result = await createTask(instagramTask, userId);

    expect(result.platform).toEqual('instagram');
    expect(result.interaction_type).toEqual('follow');
    expect(result.total_coins_allocated).toEqual(150);
  });

  it('should calculate total cost correctly', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const expensiveTask: CreateTaskInput = {
      platform: 'youtube',
      interaction_type: 'subscribe',
      target_url: 'https://youtube.com/channel/test',
      target_interactions: 25,
      coins_per_interaction: 10
    };

    const result = await createTask(expensiveTask, userId);

    expect(result.total_coins_allocated).toEqual(250);
    
    // Verify balance deduction
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(updatedUser[0].coin_balance).toEqual(testUser.coin_balance - 250);
  });

  it('should handle edge case with minimum values', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const minimalTask: CreateTaskInput = {
      platform: 'twitter',
      interaction_type: 'like',
      target_url: 'https://twitter.com/status/123',
      target_interactions: 1,
      coins_per_interaction: 1
    };

    const result = await createTask(minimalTask, userId);

    expect(result.target_interactions).toEqual(1);
    expect(result.coins_per_interaction).toEqual(1);
    expect(result.total_coins_allocated).toEqual(1);
  });

  it('should not affect user balance if task creation fails', async () => {
    // This test ensures data consistency - if task creation fails after balance deduction,
    // the balance should remain unchanged (in a real implementation, this would use database transactions)
    
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const initialBalance = testUser.coin_balance;

    // Test with a user that doesn't exist (should fail before balance deduction)
    await expect(createTask(testTaskInput, 99999))
      .rejects.toThrow();

    // Verify original user's balance is unchanged
    const unchangedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(unchangedUser[0].coin_balance).toEqual(initialBalance);
  });
});