import { db } from '../db';
import { systemSettingsTable } from '../db/schema';
import { type SystemSetting, type UpdateSystemSettingInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getSystemSettings(): Promise<SystemSetting[]> {
  try {
    const results = await db.select()
      .from(systemSettingsTable)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch system settings:', error);
    throw error;
  }
}

export async function getSystemSetting(key: string): Promise<SystemSetting | null> {
  try {
    const results = await db.select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch system setting:', error);
    throw error;
  }
}

export async function updateSystemSetting(input: UpdateSystemSettingInput): Promise<SystemSetting> {
  try {
    // Check if setting exists
    const existingSetting = await getSystemSetting(input.key);
    
    if (existingSetting) {
      // Update existing setting
      const results = await db.update(systemSettingsTable)
        .set({
          value: input.value,
          description: input.description ?? undefined,
          updated_at: new Date()
        })
        .where(eq(systemSettingsTable.key, input.key))
        .returning()
        .execute();

      return results[0];
    } else {
      // Create new setting
      const results = await db.insert(systemSettingsTable)
        .values({
          key: input.key,
          value: input.value,
          description: input.description ?? null,
          updated_at: new Date()
        })
        .returning()
        .execute();

      return results[0];
    }
  } catch (error) {
    console.error('Failed to update system setting:', error);
    throw error;
  }
}

export async function initializeDefaultSettings(): Promise<SystemSetting[]> {
  try {
    const defaultSettings = [
      {
        key: 'commission_rate',
        value: '0.05',
        description: 'Commission rate for system (5%)'
      },
      {
        key: 'min_coins_per_interaction',
        value: '1',
        description: 'Minimum coins per interaction'
      },
      {
        key: 'max_coins_per_interaction',
        value: '100',
        description: 'Maximum coins per interaction'
      },
      {
        key: 'min_withdrawal_amount',
        value: '100',
        description: 'Minimum withdrawal amount in coins'
      }
    ];

    const createdSettings: SystemSetting[] = [];

    for (const setting of defaultSettings) {
      // Only create if setting doesn't exist
      const existing = await getSystemSetting(setting.key);
      if (!existing) {
        const created = await updateSystemSetting(setting);
        createdSettings.push(created);
      } else {
        createdSettings.push(existing);
      }
    }

    return createdSettings;
  } catch (error) {
    console.error('Failed to initialize default settings:', error);
    throw error;
  }
}

export async function getCommissionRate(): Promise<number> {
  try {
    const setting = await getSystemSetting('commission_rate');
    
    if (!setting) {
      // Initialize with default if not found
      await updateSystemSetting({
        key: 'commission_rate',
        value: '0.05',
        description: 'Commission rate for system (5%)'
      });
      return 0.05;
    }

    const rate = parseFloat(setting.value);
    if (isNaN(rate)) {
      throw new Error('Invalid commission rate value');
    }

    return rate;
  } catch (error) {
    console.error('Failed to get commission rate:', error);
    throw error;
  }
}

export async function getCoinLimits(): Promise<{
  minCoinsPerInteraction: number;
  maxCoinsPerInteraction: number;
  minWithdrawalAmount: number;
}> {
  try {
    const [minCoins, maxCoins, minWithdrawal] = await Promise.all([
      getSystemSetting('min_coins_per_interaction'),
      getSystemSetting('max_coins_per_interaction'),
      getSystemSetting('min_withdrawal_amount')
    ]);

    // Initialize defaults if not found
    const minCoinsValue = minCoins ? parseInt(minCoins.value) : 1;
    const maxCoinsValue = maxCoins ? parseInt(maxCoins.value) : 100;
    const minWithdrawalValue = minWithdrawal ? parseInt(minWithdrawal.value) : 100;

    // Create missing settings with defaults
    if (!minCoins) {
      await updateSystemSetting({
        key: 'min_coins_per_interaction',
        value: '1',
        description: 'Minimum coins per interaction'
      });
    }

    if (!maxCoins) {
      await updateSystemSetting({
        key: 'max_coins_per_interaction',
        value: '100',
        description: 'Maximum coins per interaction'
      });
    }

    if (!minWithdrawal) {
      await updateSystemSetting({
        key: 'min_withdrawal_amount',
        value: '100',
        description: 'Minimum withdrawal amount in coins'
      });
    }

    // Validate parsed values
    if (isNaN(minCoinsValue) || isNaN(maxCoinsValue) || isNaN(minWithdrawalValue)) {
      throw new Error('Invalid coin limit values');
    }

    return {
      minCoinsPerInteraction: minCoinsValue,
      maxCoinsPerInteraction: maxCoinsValue,
      minWithdrawalAmount: minWithdrawalValue
    };
  } catch (error) {
    console.error('Failed to get coin limits:', error);
    throw error;
  }
}