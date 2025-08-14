import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tasksTable, taskWorksTable } from '../db/schema';
import { type CreateTaskWorkInput, type VerifyTaskWorkInput } from '../schema';
import { 
  createTaskWork, 
  getTaskWorksByUser, 
  getTaskWorksByTask, 
  getPendingTaskWorks, 
  verifyTaskWork, 
  rejectTaskWork, 
  autoVerifyTaskWork 
} from '../handlers/task_works';
import { eq, and } from 'drizzle-orm';

describe('Task Works Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  let testUser: any;
  let testWorker: any;
  let testTask: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'creator@test.com',
          password_hash: 'hash123',
          full_name: 'Task Creator',
          role: 'user',
          status: 'active',
          coin_balance: 1000
        },
        {
          email: 'worker@test.com',
          password_hash: 'hash123',
          full_name: 'Task Worker',
          role: 'user',
          status: 'active',
          coin_balance: 0
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    testWorker = users[1];

    // Create test task
    const tasks = await db.insert(tasksTable)
      .values({
        creator_id: testUser.id,
        platform: 'instagram',
        interaction_type: 'like',
        target_url: 'https://instagram.com/test',
        target_interactions: 100,
        coins_per_interaction: 10,
        total_coins_allocated: 1000,
        status: 'active'
      })
      .returning()
      .execute();

    testTask = tasks[0];
  });

  describe('createTaskWork', () => {
    const validInput: CreateTaskWorkInput = {
      task_id: 1,
      proof_screenshot: 'https://example.com/screenshot.jpg'
    };

    it('should create a task work successfully', async () => {
      const input = { ...validInput, task_id: testTask.id };
      const result = await createTaskWork(input, testWorker.id);

      expect(result.id).toBeDefined();
      expect(result.task_id).toEqual(testTask.id);
      expect(result.worker_id).toEqual(testWorker.id);
      expect(result.coins_earned).toEqual(testTask.coins_per_interaction);
      expect(result.proof_screenshot).toEqual(input.proof_screenshot ?? null);
      expect(result.completed_at).toBeInstanceOf(Date);
      expect(result.verified_at).toBeNull();
      expect(result.verification_method).toBeNull();
      expect(result.admin_notes).toBeNull();
    });

    it('should save task work to database', async () => {
      const input = { ...validInput, task_id: testTask.id };
      const result = await createTaskWork(input, testWorker.id);

      const saved = await db.select()
        .from(taskWorksTable)
        .where(eq(taskWorksTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].task_id).toEqual(testTask.id);
      expect(saved[0].worker_id).toEqual(testWorker.id);
      expect(saved[0].coins_earned).toEqual(testTask.coins_per_interaction);
    });

    it('should work without proof screenshot', async () => {
      const input = { task_id: testTask.id };
      const result = await createTaskWork(input, testWorker.id);

      expect(result.proof_screenshot).toBeNull();
    });

    it('should reject if task does not exist', async () => {
      const input = { task_id: 999999 };

      await expect(createTaskWork(input, testWorker.id))
        .rejects.toThrow(/task not found/i);
    });

    it('should reject if worker does not exist', async () => {
      const input = { task_id: testTask.id };

      await expect(createTaskWork(input, 999999))
        .rejects.toThrow(/worker not found/i);
    });

    it('should reject if task is not active', async () => {
      // Update task to be completed
      await db.update(tasksTable)
        .set({ status: 'completed' })
        .where(eq(tasksTable.id, testTask.id))
        .execute();

      const input = { task_id: testTask.id };

      await expect(createTaskWork(input, testWorker.id))
        .rejects.toThrow(/task is not active/i);
    });

    it('should reject if task has reached target interactions', async () => {
      // Update task to have reached target
      await db.update(tasksTable)
        .set({ completed_interactions: testTask.target_interactions })
        .where(eq(tasksTable.id, testTask.id))
        .execute();

      const input = { task_id: testTask.id };

      await expect(createTaskWork(input, testWorker.id))
        .rejects.toThrow(/already reached target interactions/i);
    });

    it('should reject if worker has already worked on this task', async () => {
      const input = { task_id: testTask.id };
      
      // Create first work
      await createTaskWork(input, testWorker.id);

      // Try to create second work
      await expect(createTaskWork(input, testWorker.id))
        .rejects.toThrow(/already completed this task/i);
    });

    it('should reject if task creator tries to work on their own task', async () => {
      const input = { task_id: testTask.id };

      await expect(createTaskWork(input, testUser.id))
        .rejects.toThrow(/creator cannot work on their own task/i);
    });
  });

  describe('getTaskWorksByUser', () => {
    it('should return empty array for user with no task works', async () => {
      const result = await getTaskWorksByUser(testWorker.id);
      expect(result).toHaveLength(0);
    });

    it('should return task works for user', async () => {
      // Create task work
      await createTaskWork({ task_id: testTask.id }, testWorker.id);

      const result = await getTaskWorksByUser(testWorker.id);
      
      expect(result).toHaveLength(1);
      expect(result[0].worker_id).toEqual(testWorker.id);
      expect(result[0].task_id).toEqual(testTask.id);
    });

    it('should return multiple task works for user', async () => {
      // Create second task
      const secondTask = await db.insert(tasksTable)
        .values({
          creator_id: testUser.id,
          platform: 'facebook',
          interaction_type: 'follow',
          target_url: 'https://facebook.com/test',
          target_interactions: 50,
          coins_per_interaction: 5,
          total_coins_allocated: 250,
          status: 'active'
        })
        .returning()
        .execute();

      // Create task works
      await createTaskWork({ task_id: testTask.id }, testWorker.id);
      await createTaskWork({ task_id: secondTask[0].id }, testWorker.id);

      const result = await getTaskWorksByUser(testWorker.id);
      
      expect(result).toHaveLength(2);
    });
  });

  describe('getTaskWorksByTask', () => {
    it('should return empty array for task with no works', async () => {
      const result = await getTaskWorksByTask(testTask.id);
      expect(result).toHaveLength(0);
    });

    it('should return task works for specific task', async () => {
      await createTaskWork({ task_id: testTask.id }, testWorker.id);

      const result = await getTaskWorksByTask(testTask.id);
      
      expect(result).toHaveLength(1);
      expect(result[0].task_id).toEqual(testTask.id);
    });
  });

  describe('getPendingTaskWorks', () => {
    it('should return empty array when no pending works', async () => {
      const result = await getPendingTaskWorks();
      expect(result).toHaveLength(0);
    });

    it('should return pending task works', async () => {
      await createTaskWork({ task_id: testTask.id }, testWorker.id);

      const result = await getPendingTaskWorks();
      
      expect(result).toHaveLength(1);
      expect(result[0].verified_at).toBeNull();
    });

    it('should not return verified task works', async () => {
      const taskWork = await createTaskWork({ task_id: testTask.id }, testWorker.id);
      
      // Verify the work
      await verifyTaskWork({
        id: taskWork.id,
        verification_method: 'manual'
      });

      const result = await getPendingTaskWorks();
      expect(result).toHaveLength(0);
    });
  });

  describe('verifyTaskWork', () => {
    let taskWork: any;

    beforeEach(async () => {
      taskWork = await createTaskWork({ task_id: testTask.id }, testWorker.id);
    });

    it('should verify task work successfully', async () => {
      const input: VerifyTaskWorkInput = {
        id: taskWork.id,
        verification_method: 'manual',
        admin_notes: 'Verified by admin'
      };

      const result = await verifyTaskWork(input);

      expect(result.id).toEqual(taskWork.id);
      expect(result.verified_at).toBeInstanceOf(Date);
      expect(result.verification_method).toEqual('manual');
      expect(result.admin_notes).toEqual('Verified by admin');
    });

    it('should work without admin notes', async () => {
      const input: VerifyTaskWorkInput = {
        id: taskWork.id,
        verification_method: 'automatic'
      };

      const result = await verifyTaskWork(input);

      expect(result.verification_method).toEqual('automatic');
      expect(result.admin_notes).toBeNull();
    });

    it('should reject if task work does not exist', async () => {
      const input: VerifyTaskWorkInput = {
        id: 999999,
        verification_method: 'manual'
      };

      await expect(verifyTaskWork(input))
        .rejects.toThrow(/task work not found/i);
    });

    it('should reject if task work is already verified', async () => {
      // First verification
      await verifyTaskWork({
        id: taskWork.id,
        verification_method: 'manual'
      });

      // Second verification attempt
      await expect(verifyTaskWork({
        id: taskWork.id,
        verification_method: 'manual'
      })).rejects.toThrow(/already been verified/i);
    });
  });

  describe('rejectTaskWork', () => {
    let taskWork: any;

    beforeEach(async () => {
      taskWork = await createTaskWork({ task_id: testTask.id }, testWorker.id);
    });

    it('should reject task work successfully', async () => {
      const reason = 'Invalid proof screenshot';
      const result = await rejectTaskWork(taskWork.id, reason);

      expect(result.id).toEqual(taskWork.id);
      expect(result.verification_method).toEqual('manual_rejection');
      expect(result.admin_notes).toEqual(reason);
      expect(result.coins_earned).toEqual(0);
      expect(result.verified_at).toBeNull();
    });

    it('should reject if task work does not exist', async () => {
      await expect(rejectTaskWork(999999, 'Invalid'))
        .rejects.toThrow(/task work not found/i);
    });

    it('should reject if task work is already processed', async () => {
      // First verify the work
      await verifyTaskWork({
        id: taskWork.id,
        verification_method: 'manual'
      });

      // Try to reject verified work
      await expect(rejectTaskWork(taskWork.id, 'Invalid'))
        .rejects.toThrow(/already been processed/i);
    });
  });

  describe('autoVerifyTaskWork', () => {
    let taskWork: any;

    beforeEach(async () => {
      taskWork = await createTaskWork({ task_id: testTask.id }, testWorker.id);
    });

    it('should auto-verify task work successfully', async () => {
      const result = await autoVerifyTaskWork(taskWork.id);

      expect(result.id).toEqual(taskWork.id);
      expect(result.verified_at).toBeInstanceOf(Date);
      expect(result.verification_method).toEqual('api_automatic');
      expect(result.admin_notes).toEqual('Automatically verified via API');
    });

    it('should reject if task work does not exist', async () => {
      await expect(autoVerifyTaskWork(999999))
        .rejects.toThrow(/task work not found/i);
    });

    it('should reject if task work is already verified', async () => {
      // First verification
      await autoVerifyTaskWork(taskWork.id);

      // Second verification attempt
      await expect(autoVerifyTaskWork(taskWork.id))
        .rejects.toThrow(/already been verified/i);
    });
  });
});