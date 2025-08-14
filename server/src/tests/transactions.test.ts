import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { transactionsTable, usersTable } from '../db/schema';
import { type CreateTransactionInput, type UpdateTransactionInput } from '../schema';
import {
  createTransaction,
  getTransactionsByUser,
  getTransactionById,
  getAllTransactions,
  updateTransaction,
  processTopup,
  processWithdrawal,
  getTransactionStats
} from '../handlers/transactions';
import { eq, and } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  full_name: 'Test User',
  coin_balance: 1000
};

const testUser2 = {
  email: 'test2@example.com',
  password_hash: 'hashed_password2',
  full_name: 'Test User 2',
  coin_balance: 500
};

// Test transaction input
const testTopupInput: CreateTransactionInput = {
  type: 'topup',
  amount: 500,
  payment_method: 'midtrans',
  description: 'Coin top-up via Midtrans'
};

const testWithdrawalInput: CreateTransactionInput = {
  type: 'withdrawal',
  amount: 300,
  payment_method: 'manual',
  description: 'Withdrawal to bank account'
};

describe('createTransaction', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a topup transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const result = await createTransaction(testTopupInput, userId);

    expect(result.user_id).toEqual(userId);
    expect(result.type).toEqual('topup');
    expect(result.amount).toEqual(500);
    expect(result.status).toEqual('pending');
    expect(result.payment_method).toEqual('midtrans');
    expect(result.description).toEqual('Coin top-up via Midtrans');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.processed_at).toBeNull();
  });

  it('should create a withdrawal transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const result = await createTransaction(testWithdrawalInput, userId);

    expect(result.user_id).toEqual(userId);
    expect(result.type).toEqual('withdrawal');
    expect(result.amount).toEqual(300);
    expect(result.status).toEqual('pending');
    expect(result.payment_method).toEqual('manual');
    expect(result.description).toEqual('Withdrawal to bank account');
  });

  it('should throw error for non-existent user', async () => {
    expect(createTransaction(testTopupInput, 999)).rejects.toThrow(/user not found/i);
  });

  it('should throw error for withdrawal with insufficient balance', async () => {
    // Create user with low balance
    const users = await db.insert(usersTable)
      .values({ ...testUser, coin_balance: 100 })
      .returning()
      .execute();
    const userId = users[0].id;

    expect(createTransaction(testWithdrawalInput, userId)).rejects.toThrow(/insufficient coin balance/i);
  });

  it('should save transaction to database', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const result = await createTransaction(testTopupInput, userId);

    // Verify in database
    const transactions = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, result.id))
      .execute();

    expect(transactions).toHaveLength(1);
    expect(transactions[0].user_id).toEqual(userId);
    expect(transactions[0].type).toEqual('topup');
    expect(transactions[0].amount).toEqual(500);
    expect(transactions[0].status).toEqual('pending');
  });
});

describe('getTransactionsByUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get transactions for a user', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();
    const userId1 = users[0].id;
    const userId2 = users[1].id;

    // Create transactions for both users
    await createTransaction(testTopupInput, userId1);
    await createTransaction(testWithdrawalInput, userId1);
    await createTransaction(testTopupInput, userId2);

    const result = await getTransactionsByUser(userId1);

    expect(result).toHaveLength(2);
    expect(result.every(txn => txn.user_id === userId1)).toBe(true);
    // Should be ordered by created_at desc
    expect(result[0].created_at >= result[1].created_at).toBe(true);
  });

  it('should return empty array for user with no transactions', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const result = await getTransactionsByUser(userId);

    expect(result).toHaveLength(0);
  });

  it('should throw error for non-existent user', async () => {
    expect(getTransactionsByUser(999)).rejects.toThrow(/user not found/i);
  });
});

describe('getTransactionById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get transaction by ID', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testTopupInput, userId);
    const result = await getTransactionById(transaction.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(transaction.id);
    expect(result!.user_id).toEqual(userId);
    expect(result!.type).toEqual('topup');
  });

  it('should return null for non-existent transaction', async () => {
    const result = await getTransactionById(999);
    expect(result).toBeNull();
  });
});

describe('getAllTransactions', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all transactions', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();
    const userId1 = users[0].id;
    const userId2 = users[1].id;

    // Create multiple transactions
    await createTransaction(testTopupInput, userId1);
    await createTransaction(testWithdrawalInput, userId1);
    await createTransaction(testTopupInput, userId2);

    const result = await getAllTransactions();

    expect(result).toHaveLength(3);
    // Should be ordered by created_at desc
    expect(result[0].created_at >= result[1].created_at).toBe(true);
    expect(result[1].created_at >= result[2].created_at).toBe(true);
  });

  it('should return empty array when no transactions exist', async () => {
    const result = await getAllTransactions();
    expect(result).toHaveLength(0);
  });
});

describe('updateTransaction', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update transaction status and external ID', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testTopupInput, userId);

    const updateInput: UpdateTransactionInput = {
      id: transaction.id,
      status: 'completed',
      external_transaction_id: 'ext_12345'
    };

    const result = await updateTransaction(updateInput);

    expect(result.id).toEqual(transaction.id);
    expect(result.status).toEqual('completed');
    expect(result.external_transaction_id).toEqual('ext_12345');
    expect(result.processed_at).toBeInstanceOf(Date);
  });

  it('should update transaction status to failed', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testTopupInput, userId);

    const updateInput: UpdateTransactionInput = {
      id: transaction.id,
      status: 'failed'
    };

    const result = await updateTransaction(updateInput);

    expect(result.status).toEqual('failed');
    expect(result.processed_at).toBeInstanceOf(Date);
  });

  it('should throw error for non-existent transaction', async () => {
    const updateInput: UpdateTransactionInput = {
      id: 999,
      status: 'completed'
    };

    expect(updateTransaction(updateInput)).rejects.toThrow(/transaction not found/i);
  });
});

describe('processTopup', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should process topup and increase user balance', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;
    const initialBalance = testUser.coin_balance;

    const transaction = await createTransaction(testTopupInput, userId);
    const result = await processTopup(transaction.id);

    expect(result.status).toEqual('completed');
    expect(result.processed_at).toBeInstanceOf(Date);

    // Check user balance updated
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(updatedUser[0].coin_balance).toEqual(initialBalance + testTopupInput.amount);
  });

  it('should throw error for non-existent transaction', async () => {
    expect(processTopup(999)).rejects.toThrow(/transaction not found/i);
  });

  it('should throw error for non-topup transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testWithdrawalInput, userId);

    expect(processTopup(transaction.id)).rejects.toThrow(/not a topup/i);
  });

  it('should throw error for non-pending transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testTopupInput, userId);
    
    // Update to completed first
    await updateTransaction({
      id: transaction.id,
      status: 'completed'
    });

    expect(processTopup(transaction.id)).rejects.toThrow(/not pending/i);
  });
});

describe('processWithdrawal', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should process withdrawal and decrease user balance', async () => {
    // Create test user with sufficient balance
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;
    const initialBalance = testUser.coin_balance;

    const transaction = await createTransaction(testWithdrawalInput, userId);
    const result = await processWithdrawal(transaction.id);

    expect(result.status).toEqual('completed');
    expect(result.processed_at).toBeInstanceOf(Date);

    // Check user balance updated
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(updatedUser[0].coin_balance).toEqual(initialBalance - testWithdrawalInput.amount);
  });

  it('should fail withdrawal for insufficient balance', async () => {
    // Create user with low balance
    const users = await db.insert(usersTable)
      .values({ ...testUser, coin_balance: 100 })
      .returning()
      .execute();
    const userId = users[0].id;

    // Create withdrawal transaction directly in DB to bypass createTransaction validation
    const transactions = await db.insert(transactionsTable)
      .values({
        user_id: userId,
        type: 'withdrawal',
        amount: 300,
        status: 'pending',
        payment_method: 'manual',
        description: 'Test withdrawal'
      })
      .returning()
      .execute();

    expect(processWithdrawal(transactions[0].id)).rejects.toThrow(/insufficient coin balance/i);

    // Transaction should be marked as failed
    const failedTransaction = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactions[0].id))
      .execute();

    expect(failedTransaction[0].status).toEqual('failed');
  });

  it('should throw error for non-withdrawal transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testTopupInput, userId);

    expect(processWithdrawal(transaction.id)).rejects.toThrow(/not a withdrawal/i);
  });

  it('should throw error for non-pending transaction', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    const transaction = await createTransaction(testWithdrawalInput, userId);
    
    // Update to completed first
    await updateTransaction({
      id: transaction.id,
      status: 'completed'
    });

    expect(processWithdrawal(transaction.id)).rejects.toThrow(/not pending/i);
  });
});

describe('getTransactionStats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return correct transaction statistics', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();
    const userId1 = users[0].id;
    const userId2 = users[1].id;

    // Create and process multiple transactions
    const topup1 = await createTransaction({ ...testTopupInput, amount: 1000 }, userId1);
    const topup2 = await createTransaction({ ...testTopupInput, amount: 500 }, userId2);
    const withdrawal1 = await createTransaction({ ...testWithdrawalInput, amount: 200 }, userId1);
    
    // Process topups
    await processTopup(topup1.id);
    await processTopup(topup2.id);
    
    // Process withdrawal
    await processWithdrawal(withdrawal1.id);

    // Create pending transaction
    await createTransaction({ ...testTopupInput, amount: 300 }, userId1);

    const stats = await getTransactionStats();

    expect(stats.totalTopups).toEqual(1500); // 1000 + 500
    expect(stats.totalWithdrawals).toEqual(200);
    expect(stats.totalVolume).toEqual(1700); // 1500 + 200
    expect(stats.pendingTransactions).toEqual(1);
  });

  it('should return zero stats when no transactions exist', async () => {
    const stats = await getTransactionStats();

    expect(stats.totalTopups).toEqual(0);
    expect(stats.totalWithdrawals).toEqual(0);
    expect(stats.totalVolume).toEqual(0);
    expect(stats.pendingTransactions).toEqual(0);
  });

  it('should only count completed transactions for totals', async () => {
    // Create test user
    const users = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = users[0].id;

    // Create transactions but don't process them
    await createTransaction({ ...testTopupInput, amount: 1000 }, userId);
    await createTransaction({ ...testWithdrawalInput, amount: 500 }, userId);

    const stats = await getTransactionStats();

    expect(stats.totalTopups).toEqual(0);
    expect(stats.totalWithdrawals).toEqual(0);
    expect(stats.totalVolume).toEqual(0);
    expect(stats.pendingTransactions).toEqual(2);
  });
});