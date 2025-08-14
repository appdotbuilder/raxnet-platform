import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { coinPackagesTable, usersTable, transactionsTable } from '../db/schema';
import { type CreateCoinPackageInput, type UpdateCoinPackageInput } from '../schema';
import {
  getCoinPackages,
  getCoinPackageById,
  createCoinPackage,
  updateCoinPackage,
  deactivateCoinPackage,
  purchaseCoinPackage
} from '../handlers/coin_packages';
import { eq, and } from 'drizzle-orm';

// Test data
const testCoinPackageInput: CreateCoinPackageInput = {
  name: 'Basic Package',
  coin_amount: 1000,
  price: 9.99,
  bonus_coins: 100
};

const testUserData = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  full_name: 'Test User'
};

describe('Coin Packages Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createCoinPackage', () => {
    it('should create a coin package successfully', async () => {
      const result = await createCoinPackage(testCoinPackageInput);

      expect(result.name).toEqual('Basic Package');
      expect(result.coin_amount).toEqual(1000);
      expect(result.price).toEqual(9.99);
      expect(result.bonus_coins).toEqual(100);
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create package with default bonus_coins when not provided', async () => {
      const inputWithoutBonus: CreateCoinPackageInput = {
        name: 'No Bonus Package',
        coin_amount: 500,
        price: 4.99
      };

      const result = await createCoinPackage(inputWithoutBonus);

      expect(result.bonus_coins).toEqual(0);
      expect(result.name).toEqual('No Bonus Package');
      expect(result.coin_amount).toEqual(500);
      expect(result.price).toEqual(4.99);
    });

    it('should save coin package to database with correct price conversion', async () => {
      const result = await createCoinPackage(testCoinPackageInput);

      const packages = await db.select()
        .from(coinPackagesTable)
        .where(eq(coinPackagesTable.id, result.id))
        .execute();

      expect(packages).toHaveLength(1);
      const dbPackage = packages[0];
      expect(dbPackage.name).toEqual('Basic Package');
      expect(dbPackage.price).toEqual(999); // 9.99 * 100 = 999 cents
      expect(dbPackage.coin_amount).toEqual(1000);
      expect(dbPackage.bonus_coins).toEqual(100);
      expect(dbPackage.is_active).toBe(true);
    });
  });

  describe('getCoinPackages', () => {
    it('should return all active coin packages', async () => {
      // Create multiple packages
      await createCoinPackage(testCoinPackageInput);
      await createCoinPackage({
        name: 'Premium Package',
        coin_amount: 5000,
        price: 49.99,
        bonus_coins: 1000
      });

      // Create an inactive package
      const inactivePackage = await createCoinPackage({
        name: 'Inactive Package',
        coin_amount: 2000,
        price: 19.99
      });
      await deactivateCoinPackage(inactivePackage.id);

      const results = await getCoinPackages();

      expect(results).toHaveLength(2);
      expect(results.every(pkg => pkg.is_active)).toBe(true);
      expect(results.find(pkg => pkg.name === 'Basic Package')).toBeDefined();
      expect(results.find(pkg => pkg.name === 'Premium Package')).toBeDefined();
      expect(results.find(pkg => pkg.name === 'Inactive Package')).toBeUndefined();
    });

    it('should return empty array when no active packages exist', async () => {
      const results = await getCoinPackages();
      expect(results).toHaveLength(0);
    });

    it('should convert prices correctly from cents to dollars', async () => {
      await createCoinPackage(testCoinPackageInput);

      const results = await getCoinPackages();

      expect(results).toHaveLength(1);
      expect(typeof results[0].price).toBe('number');
      expect(results[0].price).toEqual(9.99);
    });
  });

  describe('getCoinPackageById', () => {
    it('should return coin package by ID', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      const result = await getCoinPackageById(created.id);

      expect(result).toBeDefined();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Basic Package');
      expect(result!.price).toEqual(9.99);
      expect(result!.coin_amount).toEqual(1000);
      expect(result!.bonus_coins).toEqual(100);
    });

    it('should return null when package does not exist', async () => {
      const result = await getCoinPackageById(999);
      expect(result).toBeNull();
    });

    it('should return inactive package by ID', async () => {
      const created = await createCoinPackage(testCoinPackageInput);
      await deactivateCoinPackage(created.id);

      const result = await getCoinPackageById(created.id);

      expect(result).toBeDefined();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('updateCoinPackage', () => {
    it('should update coin package successfully', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      const updateInput: UpdateCoinPackageInput = {
        id: created.id,
        name: 'Updated Package',
        price: 12.99,
        bonus_coins: 200
      };

      const result = await updateCoinPackage(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Package');
      expect(result.price).toEqual(12.99);
      expect(result.coin_amount).toEqual(1000); // Unchanged
      expect(result.bonus_coins).toEqual(200);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update only specified fields', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      const updateInput: UpdateCoinPackageInput = {
        id: created.id,
        is_active: false
      };

      const result = await updateCoinPackage(updateInput);

      expect(result.name).toEqual('Basic Package'); // Unchanged
      expect(result.price).toEqual(9.99); // Unchanged
      expect(result.is_active).toBe(false); // Updated
    });

    it('should throw error when package does not exist', async () => {
      const updateInput: UpdateCoinPackageInput = {
        id: 999,
        name: 'Non-existent Package'
      };

      await expect(updateCoinPackage(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should save updated data to database with correct price conversion', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      await updateCoinPackage({
        id: created.id,
        price: 15.50
      });

      const packages = await db.select()
        .from(coinPackagesTable)
        .where(eq(coinPackagesTable.id, created.id))
        .execute();

      expect(packages[0].price).toEqual(1550); // 15.50 * 100 = 1550 cents
    });
  });

  describe('deactivateCoinPackage', () => {
    it('should deactivate coin package successfully', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      const result = await deactivateCoinPackage(created.id);

      expect(result.id).toEqual(created.id);
      expect(result.is_active).toBe(false);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error when package does not exist', async () => {
      await expect(deactivateCoinPackage(999)).rejects.toThrow(/not found/i);
    });

    it('should save deactivation to database', async () => {
      const created = await createCoinPackage(testCoinPackageInput);

      await deactivateCoinPackage(created.id);

      const packages = await db.select()
        .from(coinPackagesTable)
        .where(eq(coinPackagesTable.id, created.id))
        .execute();

      expect(packages[0].is_active).toBe(false);
    });
  });

  describe('purchaseCoinPackage', () => {
    it('should create purchase transaction successfully', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      // Create coin package
      const coinPackage = await createCoinPackage(testCoinPackageInput);

      const result = await purchaseCoinPackage(coinPackage.id, testUser.id, 'midtrans');

      expect(result.transaction).toBeDefined();
      expect(result.package).toBeDefined();

      // Check transaction details
      expect(result.transaction.user_id).toEqual(testUser.id);
      expect(result.transaction.type).toEqual('topup');
      expect(result.transaction.amount).toEqual(1100); // 1000 + 100 bonus
      expect(result.transaction.status).toEqual('pending');
      expect(result.transaction.payment_method).toEqual('midtrans');
      expect(result.transaction.description).toEqual('Purchase of Basic Package');

      // Check metadata
      const metadata = JSON.parse(result.transaction.metadata!);
      expect(metadata.package_id).toEqual(coinPackage.id);
      expect(metadata.base_coins).toEqual(1000);
      expect(metadata.bonus_coins).toEqual(100);

      // Check package details
      expect(result.package.id).toEqual(coinPackage.id);
      expect(result.package.name).toEqual('Basic Package');
      expect(result.package.price).toEqual(9.99);
    });

    it('should save transaction to database', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      // Create coin package
      const coinPackage = await createCoinPackage(testCoinPackageInput);

      const result = await purchaseCoinPackage(coinPackage.id, testUser.id, 'xendit');

      // Verify transaction in database
      const transactions = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, result.transaction.id))
        .execute();

      expect(transactions).toHaveLength(1);
      const dbTransaction = transactions[0];
      expect(dbTransaction.user_id).toEqual(testUser.id);
      expect(dbTransaction.type).toEqual('topup');
      expect(dbTransaction.amount).toEqual(1100);
      expect(dbTransaction.payment_method).toEqual('xendit');
    });

    it('should throw error when coin package does not exist', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      await expect(purchaseCoinPackage(999, testUser.id, 'midtrans'))
        .rejects.toThrow(/package not found/i);
    });

    it('should throw error when coin package is inactive', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      // Create and deactivate coin package
      const coinPackage = await createCoinPackage(testCoinPackageInput);
      await deactivateCoinPackage(coinPackage.id);

      await expect(purchaseCoinPackage(coinPackage.id, testUser.id, 'midtrans'))
        .rejects.toThrow(/package not found or inactive/i);
    });

    it('should throw error when user does not exist', async () => {
      const coinPackage = await createCoinPackage(testCoinPackageInput);

      await expect(purchaseCoinPackage(coinPackage.id, 999, 'midtrans'))
        .rejects.toThrow(/user not found/i);
    });

    it('should handle packages with zero bonus coins', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      // Create package without bonus
      const packageWithoutBonus = await createCoinPackage({
        name: 'No Bonus Package',
        coin_amount: 500,
        price: 4.99
      });

      const result = await purchaseCoinPackage(packageWithoutBonus.id, testUser.id, 'duitku');

      expect(result.transaction.amount).toEqual(500); // Only base coins, no bonus
      
      const metadata = JSON.parse(result.transaction.metadata!);
      expect(metadata.base_coins).toEqual(500);
      expect(metadata.bonus_coins).toEqual(0);
    });

    it('should throw error for invalid payment method', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values(testUserData)
        .returning()
        .execute();
      const testUser = userResults[0];

      const coinPackage = await createCoinPackage(testCoinPackageInput);

      await expect(purchaseCoinPackage(coinPackage.id, testUser.id, 'invalid_payment'))
        .rejects.toThrow();
    });
  });
});