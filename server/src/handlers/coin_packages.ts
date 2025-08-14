import { db } from '../db';
import { coinPackagesTable, transactionsTable, usersTable } from '../db/schema';
import { type CoinPackage, type CreateCoinPackageInput, type UpdateCoinPackageInput, type Transaction, PaymentMethod } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getCoinPackages(): Promise<CoinPackage[]> {
  try {
    const results = await db.select()
      .from(coinPackagesTable)
      .where(eq(coinPackagesTable.is_active, true))
      .execute();

    return results.map(pkg => ({
      ...pkg,
      price: parseFloat((pkg.price / 100).toFixed(2)) // Convert cents to dollars
    }));
  } catch (error) {
    console.error('Get coin packages failed:', error);
    throw error;
  }
}

export async function getCoinPackageById(id: number): Promise<CoinPackage | null> {
  try {
    const results = await db.select()
      .from(coinPackagesTable)
      .where(eq(coinPackagesTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const pkg = results[0];
    return {
      ...pkg,
      price: parseFloat((pkg.price / 100).toFixed(2)) // Convert cents to dollars
    };
  } catch (error) {
    console.error('Get coin package by ID failed:', error);
    throw error;
  }
}

export async function createCoinPackage(input: CreateCoinPackageInput): Promise<CoinPackage> {
  try {
    const results = await db.insert(coinPackagesTable)
      .values({
        name: input.name,
        coin_amount: input.coin_amount,
        price: Math.round(input.price * 100), // Convert dollars to cents
        bonus_coins: input.bonus_coins || 0
      })
      .returning()
      .execute();

    const pkg = results[0];
    return {
      ...pkg,
      price: parseFloat((pkg.price / 100).toFixed(2)) // Convert cents back to dollars
    };
  } catch (error) {
    console.error('Create coin package failed:', error);
    throw error;
  }
}

export async function updateCoinPackage(input: UpdateCoinPackageInput): Promise<CoinPackage> {
  try {
    const updateData: any = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.coin_amount !== undefined) updateData.coin_amount = input.coin_amount;
    if (input.price !== undefined) updateData.price = Math.round(input.price * 100); // Convert dollars to cents
    if (input.bonus_coins !== undefined) updateData.bonus_coins = input.bonus_coins;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    
    updateData.updated_at = new Date();

    const results = await db.update(coinPackagesTable)
      .set(updateData)
      .where(eq(coinPackagesTable.id, input.id))
      .returning()
      .execute();

    if (results.length === 0) {
      throw new Error('Coin package not found');
    }

    const pkg = results[0];
    return {
      ...pkg,
      price: parseFloat((pkg.price / 100).toFixed(2)) // Convert cents back to dollars
    };
  } catch (error) {
    console.error('Update coin package failed:', error);
    throw error;
  }
}

export async function deactivateCoinPackage(id: number): Promise<CoinPackage> {
  try {
    const results = await db.update(coinPackagesTable)
      .set({
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(coinPackagesTable.id, id))
      .returning()
      .execute();

    if (results.length === 0) {
      throw new Error('Coin package not found');
    }

    const pkg = results[0];
    return {
      ...pkg,
      price: parseFloat((pkg.price / 100).toFixed(2)) // Convert cents back to dollars
    };
  } catch (error) {
    console.error('Deactivate coin package failed:', error);
    throw error;
  }
}

export async function purchaseCoinPackage(packageId: number, userId: number, paymentMethod: string): Promise<{
  transaction: Transaction;
  package: CoinPackage;
}> {
  try {
    // Validate payment method
    const validPaymentMethod = PaymentMethod.parse(paymentMethod);

    // First, verify the coin package exists and is active
    const packageResults = await db.select()
      .from(coinPackagesTable)
      .where(and(
        eq(coinPackagesTable.id, packageId),
        eq(coinPackagesTable.is_active, true)
      ))
      .execute();

    if (packageResults.length === 0) {
      throw new Error('Coin package not found or inactive');
    }

    // Verify the user exists
    const userResults = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (userResults.length === 0) {
      throw new Error('User not found');
    }

    const coinPackage = packageResults[0];
    
    // Create pending transaction
    const transactionResults = await db.insert(transactionsTable)
      .values({
        user_id: userId,
        type: 'topup',
        amount: coinPackage.coin_amount + coinPackage.bonus_coins,
        status: 'pending',
        payment_method: validPaymentMethod,
        description: `Purchase of ${coinPackage.name}`,
        metadata: JSON.stringify({ 
          package_id: packageId,
          package_price: coinPackage.price,
          base_coins: coinPackage.coin_amount,
          bonus_coins: coinPackage.bonus_coins
        })
      })
      .returning()
      .execute();

    const transaction = transactionResults[0];

    return {
      transaction,
      package: {
        ...coinPackage,
        price: parseFloat((coinPackage.price / 100).toFixed(2)) // Convert cents to dollars
      }
    };
  } catch (error) {
    console.error('Purchase coin package failed:', error);
    throw error;
  }
}