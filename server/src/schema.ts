import { z } from 'zod';

// Enums for various platform types and statuses
export const PlatformType = z.enum(['facebook', 'instagram', 'tiktok', 'youtube', 'twitter']);
export type PlatformType = z.infer<typeof PlatformType>;

export const InteractionType = z.enum(['like', 'follow', 'subscribe', 'view', 'comment']);
export type InteractionType = z.infer<typeof InteractionType>;

export const TaskStatus = z.enum(['active', 'completed', 'paused', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TransactionType = z.enum(['topup', 'withdrawal', 'task_payment', 'task_earning', 'system_fee', 'bonus']);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionStatus = z.enum(['pending', 'completed', 'failed', 'cancelled']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const PaymentMethod = z.enum(['midtrans', 'xendit', 'duitku', 'manual']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const UserRole = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const UserStatus = z.enum(['active', 'suspended', 'blocked']);
export type UserStatus = z.infer<typeof UserStatus>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  full_name: z.string(),
  role: UserRole,
  status: UserStatus,
  coin_balance: z.number().int().nonnegative(),
  google_id: z.string().nullable(),
  facebook_id: z.string().nullable(),
  two_factor_enabled: z.boolean(),
  email_verified: z.boolean(),
  last_login_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Task schema
export const taskSchema = z.object({
  id: z.number(),
  creator_id: z.number(),
  platform: PlatformType,
  interaction_type: InteractionType,
  target_url: z.string().url(),
  target_interactions: z.number().int().positive(),
  completed_interactions: z.number().int().nonnegative(),
  coins_per_interaction: z.number().int().positive(),
  total_coins_allocated: z.number().int().positive(),
  status: TaskStatus,
  requires_verification: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable()
});

export type Task = z.infer<typeof taskSchema>;

// Task work schema (when users work on tasks)
export const taskWorkSchema = z.object({
  id: z.number(),
  task_id: z.number(),
  worker_id: z.number(),
  coins_earned: z.number().int().positive(),
  completed_at: z.coerce.date(),
  verified_at: z.coerce.date().nullable(),
  verification_method: z.string().nullable(),
  proof_screenshot: z.string().nullable(),
  admin_notes: z.string().nullable()
});

export type TaskWork = z.infer<typeof taskWorkSchema>;

// Transaction schema
export const transactionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: TransactionType,
  amount: z.number().int(),
  status: TransactionStatus,
  payment_method: PaymentMethod.nullable(),
  external_transaction_id: z.string().nullable(),
  description: z.string(),
  metadata: z.string().nullable(), // JSON string for additional data
  created_at: z.coerce.date(),
  processed_at: z.coerce.date().nullable()
});

export type Transaction = z.infer<typeof transactionSchema>;

// Coin package schema
export const coinPackageSchema = z.object({
  id: z.number(),
  name: z.string(),
  coin_amount: z.number().int().positive(),
  price: z.number().positive(),
  bonus_coins: z.number().int().nonnegative(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type CoinPackage = z.infer<typeof coinPackageSchema>;

// System settings schema
export const systemSettingSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  updated_at: z.coerce.date()
});

export type SystemSetting = z.infer<typeof systemSettingSchema>;

// Activity log schema
export const activityLogSchema = z.object({
  id: z.number(),
  user_id: z.number().nullable(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  details: z.string().nullable(),
  ip_address: z.string(),
  user_agent: z.string().nullable(),
  created_at: z.coerce.date()
});

export type ActivityLog = z.infer<typeof activityLogSchema>;

// Input schemas for creating/updating entities

// User input schemas
export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  google_id: z.string().nullable().optional(),
  facebook_id: z.string().nullable().optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  full_name: z.string().min(1).optional(),
  status: UserStatus.optional(),
  coin_balance: z.number().int().nonnegative().optional(),
  two_factor_enabled: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Task input schemas
export const createTaskInputSchema = z.object({
  platform: PlatformType,
  interaction_type: InteractionType,
  target_url: z.string().url(),
  target_interactions: z.number().int().positive(),
  coins_per_interaction: z.number().int().positive()
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z.object({
  id: z.number(),
  status: TaskStatus.optional(),
  target_interactions: z.number().int().positive().optional(),
  coins_per_interaction: z.number().int().positive().optional()
});

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

// Task work input schemas
export const createTaskWorkInputSchema = z.object({
  task_id: z.number(),
  proof_screenshot: z.string().url().optional()
});

export type CreateTaskWorkInput = z.infer<typeof createTaskWorkInputSchema>;

export const verifyTaskWorkInputSchema = z.object({
  id: z.number(),
  verification_method: z.string(),
  admin_notes: z.string().nullable().optional()
});

export type VerifyTaskWorkInput = z.infer<typeof verifyTaskWorkInputSchema>;

// Transaction input schemas
export const createTransactionInputSchema = z.object({
  type: TransactionType,
  amount: z.number().int(),
  payment_method: PaymentMethod.nullable().optional(),
  description: z.string(),
  metadata: z.string().nullable().optional()
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

export const updateTransactionInputSchema = z.object({
  id: z.number(),
  status: TransactionStatus,
  external_transaction_id: z.string().nullable().optional()
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

// Coin package input schemas
export const createCoinPackageInputSchema = z.object({
  name: z.string().min(1),
  coin_amount: z.number().int().positive(),
  price: z.number().positive(),
  bonus_coins: z.number().int().nonnegative().optional()
});

export type CreateCoinPackageInput = z.infer<typeof createCoinPackageInputSchema>;

export const updateCoinPackageInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  coin_amount: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  bonus_coins: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional()
});

export type UpdateCoinPackageInput = z.infer<typeof updateCoinPackageInputSchema>;

// System setting input schemas
export const updateSystemSettingInputSchema = z.object({
  key: z.string(),
  value: z.string(),
  description: z.string().nullable().optional()
});

export type UpdateSystemSettingInput = z.infer<typeof updateSystemSettingInputSchema>;

// Auth input schemas
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const registerInputSchema = createUserInputSchema;
export type RegisterInput = CreateUserInput;

// Activity log input schema
export const createActivityLogInputSchema = z.object({
  user_id: z.number().nullable().optional(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.number().nullable().optional(),
  details: z.string().nullable().optional(),
  ip_address: z.string(),
  user_agent: z.string().nullable().optional()
});

export type CreateActivityLogInput = z.infer<typeof createActivityLogInputSchema>;