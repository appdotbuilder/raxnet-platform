import { db } from '../db';
import { transactionsTable, usersTable } from '../db/schema';
import { type Transaction, type CreateTransactionInput, type UpdateTransactionInput } from '../schema';
import { eq, desc, and, sum, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export async function createTransaction(input: CreateTransactionInput, userId: number): Promise<Transaction> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // For withdrawal transactions, check if user has sufficient balance
    if (input.type === 'withdrawal') {
      const currentBalance = user[0].coin_balance;
      if (currentBalance < input.amount) {
        throw new Error('Insufficient coin balance');
      }
    }

    // Create transaction record
    const result = await db.insert(transactionsTable)
      .values({
        user_id: userId,
        type: input.type,
        amount: input.amount,
        status: 'pending',
        payment_method: input.payment_method || null,
        description: input.description,
        metadata: input.metadata || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Transaction creation failed:', error);
    throw error;
  }
}

export async function getTransactionsByUser(userId: number): Promise<Transaction[]> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    const result = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.user_id, userId))
      .orderBy(desc(transactionsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Get user transactions failed:', error);
    throw error;
  }
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  try {
    const result = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Get transaction by ID failed:', error);
    throw error;
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  try {
    const result = await db.select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Get all transactions failed:', error);
    throw error;
  }
}

export async function updateTransaction(input: UpdateTransactionInput): Promise<Transaction> {
  try {
    // First verify transaction exists
    const existing = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, input.id))
      .execute();

    if (existing.length === 0) {
      throw new Error('Transaction not found');
    }

    // Update transaction
    const updateData: any = {
      status: input.status,
      updated_at: new Date()
    };

    if (input.external_transaction_id !== undefined) {
      updateData.external_transaction_id = input.external_transaction_id;
    }

    if (input.status === 'completed' || input.status === 'failed') {
      updateData.processed_at = new Date();
    }

    const result = await db.update(transactionsTable)
      .set(updateData)
      .where(eq(transactionsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Transaction update failed:', error);
    throw error;
  }
}

export async function processTopup(transactionId: number): Promise<Transaction> {
  try {
    // Get transaction details
    const transaction = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId))
      .execute();

    if (transaction.length === 0) {
      throw new Error('Transaction not found');
    }

    const txn = transaction[0];

    // Verify it's a topup transaction and pending
    if (txn.type !== 'topup') {
      throw new Error('Transaction is not a topup');
    }

    if (txn.status !== 'pending') {
      throw new Error('Transaction is not pending');
    }

    // Get current user balance and update it
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, txn.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Update user balance
    await db.update(usersTable)
      .set({
        coin_balance: user[0].coin_balance + txn.amount,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, txn.user_id))
      .execute();

    // Update transaction status
    const result = await db.update(transactionsTable)
      .set({
        status: 'completed',
        processed_at: new Date()
      })
      .where(eq(transactionsTable.id, transactionId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Topup processing failed:', error);
    throw error;
  }
}

export async function processWithdrawal(transactionId: number): Promise<Transaction> {
  try {
    // Get transaction details
    const transaction = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId))
      .execute();

    if (transaction.length === 0) {
      throw new Error('Transaction not found');
    }

    const txn = transaction[0];

    // Verify it's a withdrawal transaction and pending
    if (txn.type !== 'withdrawal') {
      throw new Error('Transaction is not a withdrawal');
    }

    if (txn.status !== 'pending') {
      throw new Error('Transaction is not pending');
    }

    // Get user current balance
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, txn.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    if (user[0].coin_balance < txn.amount) {
      // Mark transaction as failed
      await db.update(transactionsTable)
        .set({
          status: 'failed',
          processed_at: new Date()
        })
        .where(eq(transactionsTable.id, transactionId))
        .execute();

      throw new Error('Insufficient coin balance');
    }

    // Update user balance
    await db.update(usersTable)
      .set({
        coin_balance: user[0].coin_balance - txn.amount,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, txn.user_id))
      .execute();

    // Update transaction status
    const result = await db.update(transactionsTable)
      .set({
        status: 'completed',
        processed_at: new Date()
      })
      .where(eq(transactionsTable.id, transactionId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Withdrawal processing failed:', error);
    throw error;
  }
}

export async function getTransactionStats(): Promise<{
  totalTopups: number;
  totalWithdrawals: number;
  totalVolume: number;
  pendingTransactions: number;
}> {
  try {
    // Get topup statistics
    const topupStats = await db.select({
      total: sum(transactionsTable.amount),
      count: count(transactionsTable.id)
    })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, 'topup'),
        eq(transactionsTable.status, 'completed')
      ))
      .execute();

    // Get withdrawal statistics
    const withdrawalStats = await db.select({
      total: sum(transactionsTable.amount),
      count: count(transactionsTable.id)
    })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, 'withdrawal'),
        eq(transactionsTable.status, 'completed')
      ))
      .execute();

    // Get pending transaction count
    const pendingStats = await db.select({
      count: count(transactionsTable.id)
    })
      .from(transactionsTable)
      .where(eq(transactionsTable.status, 'pending'))
      .execute();

    const totalTopups = Number(topupStats[0]?.total || 0);
    const totalWithdrawals = Number(withdrawalStats[0]?.total || 0);

    return {
      totalTopups,
      totalWithdrawals,
      totalVolume: totalTopups + totalWithdrawals,
      pendingTransactions: pendingStats[0]?.count || 0
    };
  } catch (error) {
    console.error('Get transaction stats failed:', error);
    throw error;
  }
}