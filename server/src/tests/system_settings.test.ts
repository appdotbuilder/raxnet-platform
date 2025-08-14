import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { systemSettingsTable } from '../db/schema';
import { type UpdateSystemSettingInput } from '../schema';
import {
  getSystemSettings,
  getSystemSetting,
  updateSystemSetting,
  initializeDefaultSettings,
  getCommissionRate,
  getCoinLimits
} from '../handlers/system_settings';
import { eq } from 'drizzle-orm';

describe('SystemSettings Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getSystemSettings', () => {
    it('should return empty array when no settings exist', async () => {
      const result = await getSystemSettings();
      
      expect(result).toEqual([]);
    });

    it('should return all system settings', async () => {
      // Create test settings
      await db.insert(systemSettingsTable)
        .values([
          {
            key: 'test_setting_1',
            value: 'value1',
            description: 'Test setting 1'
          },
          {
            key: 'test_setting_2',
            value: 'value2',
            description: null
          }
        ])
        .execute();

      const result = await getSystemSettings();

      expect(result).toHaveLength(2);
      expect(result[0].key).toEqual('test_setting_1');
      expect(result[0].value).toEqual('value1');
      expect(result[0].description).toEqual('Test setting 1');
      expect(result[1].key).toEqual('test_setting_2');
      expect(result[1].value).toEqual('value2');
      expect(result[1].description).toBeNull();
      expect(result[0].id).toBeDefined();
      expect(result[0].updated_at).toBeInstanceOf(Date);
    });
  });

  describe('getSystemSetting', () => {
    it('should return null when setting does not exist', async () => {
      const result = await getSystemSetting('non_existent_key');
      
      expect(result).toBeNull();
    });

    it('should return specific system setting by key', async () => {
      // Create test setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'test_key',
          value: 'test_value',
          description: 'Test description'
        })
        .execute();

      const result = await getSystemSetting('test_key');

      expect(result).not.toBeNull();
      expect(result!.key).toEqual('test_key');
      expect(result!.value).toEqual('test_value');
      expect(result!.description).toEqual('Test description');
      expect(result!.id).toBeDefined();
      expect(result!.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('updateSystemSetting', () => {
    it('should create new system setting when key does not exist', async () => {
      const input: UpdateSystemSettingInput = {
        key: 'new_setting',
        value: 'new_value',
        description: 'New setting description'
      };

      const result = await updateSystemSetting(input);

      expect(result.key).toEqual('new_setting');
      expect(result.value).toEqual('new_value');
      expect(result.description).toEqual('New setting description');
      expect(result.id).toBeDefined();
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify in database
      const dbResult = await db.select()
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, 'new_setting'))
        .execute();

      expect(dbResult).toHaveLength(1);
      expect(dbResult[0].value).toEqual('new_value');
    });

    it('should update existing system setting', async () => {
      // Create initial setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'existing_setting',
          value: 'old_value',
          description: 'Old description'
        })
        .execute();

      const input: UpdateSystemSettingInput = {
        key: 'existing_setting',
        value: 'updated_value',
        description: 'Updated description'
      };

      const result = await updateSystemSetting(input);

      expect(result.key).toEqual('existing_setting');
      expect(result.value).toEqual('updated_value');
      expect(result.description).toEqual('Updated description');
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify in database
      const dbResult = await db.select()
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, 'existing_setting'))
        .execute();

      expect(dbResult).toHaveLength(1);
      expect(dbResult[0].value).toEqual('updated_value');
    });

    it('should handle null description', async () => {
      const input: UpdateSystemSettingInput = {
        key: 'no_desc_setting',
        value: 'some_value'
      };

      const result = await updateSystemSetting(input);

      expect(result.key).toEqual('no_desc_setting');
      expect(result.value).toEqual('some_value');
      expect(result.description).toBeNull();
    });
  });

  describe('initializeDefaultSettings', () => {
    it('should create all default settings when none exist', async () => {
      const result = await initializeDefaultSettings();

      expect(result).toHaveLength(4);
      
      const keys = result.map(s => s.key);
      expect(keys).toContain('commission_rate');
      expect(keys).toContain('min_coins_per_interaction');
      expect(keys).toContain('max_coins_per_interaction');
      expect(keys).toContain('min_withdrawal_amount');

      // Verify commission rate
      const commissionSetting = result.find(s => s.key === 'commission_rate');
      expect(commissionSetting!.value).toEqual('0.05');
      expect(commissionSetting!.description).toEqual('Commission rate for system (5%)');

      // Verify in database
      const dbSettings = await db.select()
        .from(systemSettingsTable)
        .execute();

      expect(dbSettings).toHaveLength(4);
    });

    it('should not duplicate existing settings', async () => {
      // Create one existing setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'commission_rate',
          value: '0.10',
          description: 'Custom commission rate'
        })
        .execute();

      const result = await initializeDefaultSettings();

      expect(result).toHaveLength(4);

      // Should return existing setting, not create duplicate
      const commissionSetting = result.find(s => s.key === 'commission_rate');
      expect(commissionSetting!.value).toEqual('0.10'); // Original value preserved
      expect(commissionSetting!.description).toEqual('Custom commission rate');

      // Verify total count in database
      const dbSettings = await db.select()
        .from(systemSettingsTable)
        .execute();

      expect(dbSettings).toHaveLength(4);
    });
  });

  describe('getCommissionRate', () => {
    it('should return default commission rate when setting does not exist', async () => {
      const result = await getCommissionRate();

      expect(result).toEqual(0.05);

      // Should also create the setting
      const setting = await getSystemSetting('commission_rate');
      expect(setting).not.toBeNull();
      expect(setting!.value).toEqual('0.05');
    });

    it('should return existing commission rate', async () => {
      // Create commission rate setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'commission_rate',
          value: '0.08',
          description: 'Custom commission rate'
        })
        .execute();

      const result = await getCommissionRate();

      expect(result).toEqual(0.08);
    });

    it('should throw error for invalid commission rate value', async () => {
      // Create invalid commission rate setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'commission_rate',
          value: 'invalid_number',
          description: 'Invalid rate'
        })
        .execute();

      await expect(getCommissionRate()).rejects.toThrow(/invalid commission rate value/i);
    });
  });

  describe('getCoinLimits', () => {
    it('should return default coin limits when settings do not exist', async () => {
      const result = await getCoinLimits();

      expect(result).toEqual({
        minCoinsPerInteraction: 1,
        maxCoinsPerInteraction: 100,
        minWithdrawalAmount: 100
      });

      // Should also create the settings
      const minCoins = await getSystemSetting('min_coins_per_interaction');
      const maxCoins = await getSystemSetting('max_coins_per_interaction');
      const minWithdrawal = await getSystemSetting('min_withdrawal_amount');

      expect(minCoins!.value).toEqual('1');
      expect(maxCoins!.value).toEqual('100');
      expect(minWithdrawal!.value).toEqual('100');
    });

    it('should return existing coin limits', async () => {
      // Create custom coin limit settings
      await db.insert(systemSettingsTable)
        .values([
          {
            key: 'min_coins_per_interaction',
            value: '5',
            description: 'Custom min coins'
          },
          {
            key: 'max_coins_per_interaction',
            value: '200',
            description: 'Custom max coins'
          },
          {
            key: 'min_withdrawal_amount',
            value: '500',
            description: 'Custom min withdrawal'
          }
        ])
        .execute();

      const result = await getCoinLimits();

      expect(result).toEqual({
        minCoinsPerInteraction: 5,
        maxCoinsPerInteraction: 200,
        minWithdrawalAmount: 500
      });
    });

    it('should handle partial existing settings', async () => {
      // Create only min coins setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'min_coins_per_interaction',
          value: '3',
          description: 'Custom min coins'
        })
        .execute();

      const result = await getCoinLimits();

      expect(result).toEqual({
        minCoinsPerInteraction: 3,
        maxCoinsPerInteraction: 100, // Default
        minWithdrawalAmount: 100 // Default
      });

      // Should create missing settings
      const maxCoins = await getSystemSetting('max_coins_per_interaction');
      const minWithdrawal = await getSystemSetting('min_withdrawal_amount');

      expect(maxCoins!.value).toEqual('100');
      expect(minWithdrawal!.value).toEqual('100');
    });

    it('should throw error for invalid coin limit values', async () => {
      // Create invalid coin limit setting
      await db.insert(systemSettingsTable)
        .values({
          key: 'min_coins_per_interaction',
          value: 'invalid_number',
          description: 'Invalid min coins'
        })
        .execute();

      await expect(getCoinLimits()).rejects.toThrow(/invalid coin limit values/i);
    });
  });
});