import { db } from '../db';
import { usersTable, tasksTable, taskWorksTable, transactionsTable } from '../db/schema';
import { type User, type UpdateUserInput } from '../schema';
import { eq, count, sum } from 'drizzle-orm';

export async function getUsers(): Promise<User[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<User | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return results[0] || null;
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update object dynamically
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.email !== undefined) {
      updateData.email = input.email;
    }
    if (input.full_name !== undefined) {
      updateData.full_name = input.full_name;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.coin_balance !== undefined) {
      updateData.coin_balance = input.coin_balance;
    }
    if (input.two_factor_enabled !== undefined) {
      updateData.two_factor_enabled = input.two_factor_enabled;
    }

    const results = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (!results[0]) {
      throw new Error('User not found');
    }

    return results[0];
  } catch (error) {
    console.error('Failed to update user:', error);
    throw error;
  }
}

export async function getUserStats(userId: number): Promise<{
  totalTasksCreated: number;
  totalTasksCompleted: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
}> {
  try {
    // Get total tasks created by user
    const tasksCreatedResult = await db.select({ count: count() })
      .from(tasksTable)
      .where(eq(tasksTable.creator_id, userId))
      .execute();

    // Get total tasks completed by user (task works)
    const tasksCompletedResult = await db.select({ count: count() })
      .from(taskWorksTable)
      .where(eq(taskWorksTable.worker_id, userId))
      .execute();

    // Get total coins earned from task works
    const coinsEarnedResult = await db.select({ 
      total: sum(taskWorksTable.coins_earned) 
    })
      .from(taskWorksTable)
      .where(eq(taskWorksTable.worker_id, userId))
      .execute();

    // Get total coins spent on creating tasks
    const coinsSpentResult = await db.select({ 
      total: sum(tasksTable.total_coins_allocated) 
    })
      .from(tasksTable)
      .where(eq(tasksTable.creator_id, userId))
      .execute();

    return {
      totalTasksCreated: tasksCreatedResult[0]?.count || 0,
      totalTasksCompleted: tasksCompletedResult[0]?.count || 0,
      totalCoinsEarned: parseInt(coinsEarnedResult[0]?.total || '0'),
      totalCoinsSpent: parseInt(coinsSpentResult[0]?.total || '0')
    };
  } catch (error) {
    console.error('Failed to fetch user stats:', error);
    throw error;
  }
}

export async function blockUser(userId: number): Promise<User> {
  try {
    const results = await db.update(usersTable)
      .set({ 
        status: 'blocked',
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    if (!results[0]) {
      throw new Error('User not found');
    }

    return results[0];
  } catch (error) {
    console.error('Failed to block user:', error);
    throw error;
  }
}

export async function suspendUser(userId: number): Promise<User> {
  try {
    const results = await db.update(usersTable)
      .set({ 
        status: 'suspended',
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    if (!results[0]) {
      throw new Error('User not found');
    }

    return results[0];
  } catch (error) {
    console.error('Failed to suspend user:', error);
    throw error;
  }
}