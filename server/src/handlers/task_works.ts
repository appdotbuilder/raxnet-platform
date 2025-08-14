import { db } from '../db';
import { tasksTable, taskWorksTable, usersTable } from '../db/schema';
import { type TaskWork, type CreateTaskWorkInput, type VerifyTaskWorkInput } from '../schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function createTaskWork(input: CreateTaskWorkInput, workerId: number): Promise<TaskWork> {
  try {
    // First, verify the task exists and is active
    const task = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, input.task_id))
      .execute();

    if (task.length === 0) {
      throw new Error('Task not found');
    }

    const taskData = task[0];

    if (taskData.status !== 'active') {
      throw new Error('Task is not active');
    }

    // Check if task has reached target interactions
    if (taskData.completed_interactions >= taskData.target_interactions) {
      throw new Error('Task has already reached target interactions');
    }

    // Verify the worker exists
    const worker = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, workerId))
      .execute();

    if (worker.length === 0) {
      throw new Error('Worker not found');
    }

    // Check if worker has already worked on this task
    const existingWork = await db.select()
      .from(taskWorksTable)
      .where(and(
        eq(taskWorksTable.task_id, input.task_id),
        eq(taskWorksTable.worker_id, workerId)
      ))
      .execute();

    if (existingWork.length > 0) {
      throw new Error('Worker has already completed this task');
    }

    // Prevent task creator from working on their own task
    if (taskData.creator_id === workerId) {
      throw new Error('Task creator cannot work on their own task');
    }

    // Create the task work record
    const result = await db.insert(taskWorksTable)
      .values({
        task_id: input.task_id,
        worker_id: workerId,
        coins_earned: taskData.coins_per_interaction,
        proof_screenshot: input.proof_screenshot ?? null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task work creation failed:', error);
    throw error;
  }
}

export async function getTaskWorksByUser(userId: number): Promise<TaskWork[]> {
  try {
    const results = await db.select()
      .from(taskWorksTable)
      .where(eq(taskWorksTable.worker_id, userId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get task works by user:', error);
    throw error;
  }
}

export async function getTaskWorksByTask(taskId: number): Promise<TaskWork[]> {
  try {
    const results = await db.select()
      .from(taskWorksTable)
      .where(eq(taskWorksTable.task_id, taskId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get task works by task:', error);
    throw error;
  }
}

export async function getPendingTaskWorks(): Promise<TaskWork[]> {
  try {
    const results = await db.select()
      .from(taskWorksTable)
      .where(isNull(taskWorksTable.verified_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get pending task works:', error);
    throw error;
  }
}

export async function verifyTaskWork(input: VerifyTaskWorkInput): Promise<TaskWork> {
  try {
    // Verify the task work exists
    const existingWork = await db.select()
      .from(taskWorksTable)
      .where(eq(taskWorksTable.id, input.id))
      .execute();

    if (existingWork.length === 0) {
      throw new Error('Task work not found');
    }

    if (existingWork[0].verified_at !== null) {
      throw new Error('Task work has already been verified');
    }

    // Update the task work with verification details
    const result = await db.update(taskWorksTable)
      .set({
        verified_at: new Date(),
        verification_method: input.verification_method,
        admin_notes: input.admin_notes || null
      })
      .where(eq(taskWorksTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task work verification failed:', error);
    throw error;
  }
}

export async function rejectTaskWork(taskWorkId: number, reason: string): Promise<TaskWork> {
  try {
    // Verify the task work exists
    const existingWork = await db.select()
      .from(taskWorksTable)
      .where(eq(taskWorksTable.id, taskWorkId))
      .execute();

    if (existingWork.length === 0) {
      throw new Error('Task work not found');
    }

    if (existingWork[0].verified_at !== null) {
      throw new Error('Task work has already been processed');
    }

    // Update with rejection details (no verified_at means rejected)
    const result = await db.update(taskWorksTable)
      .set({
        verification_method: 'manual_rejection',
        admin_notes: reason,
        coins_earned: 0 // No coins earned for rejected work
      })
      .where(eq(taskWorksTable.id, taskWorkId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task work rejection failed:', error);
    throw error;
  }
}

export async function autoVerifyTaskWork(taskWorkId: number): Promise<TaskWork> {
  try {
    // Verify the task work exists
    const existingWork = await db.select()
      .from(taskWorksTable)
      .where(eq(taskWorksTable.id, taskWorkId))
      .execute();

    if (existingWork.length === 0) {
      throw new Error('Task work not found');
    }

    if (existingWork[0].verified_at !== null) {
      throw new Error('Task work has already been verified');
    }

    // Update with automatic verification
    const result = await db.update(taskWorksTable)
      .set({
        verified_at: new Date(),
        verification_method: 'api_automatic',
        admin_notes: 'Automatically verified via API'
      })
      .where(eq(taskWorksTable.id, taskWorkId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Automatic task work verification failed:', error);
    throw error;
  }
}