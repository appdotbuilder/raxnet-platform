import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer,
  boolean,
  pgEnum,
  unique,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define PostgreSQL enums
export const platformTypeEnum = pgEnum('platform_type', ['facebook', 'instagram', 'tiktok', 'youtube', 'twitter']);
export const interactionTypeEnum = pgEnum('interaction_type', ['like', 'follow', 'subscribe', 'view', 'comment']);
export const taskStatusEnum = pgEnum('task_status', ['active', 'completed', 'paused', 'cancelled']);
export const transactionTypeEnum = pgEnum('transaction_type', ['topup', 'withdrawal', 'task_payment', 'task_earning', 'system_fee', 'bonus']);
export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'completed', 'failed', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['midtrans', 'xendit', 'duitku', 'manual']);
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'blocked']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  coin_balance: integer('coin_balance').notNull().default(0),
  google_id: text('google_id'),
  facebook_id: text('facebook_id'),
  two_factor_enabled: boolean('two_factor_enabled').notNull().default(false),
  email_verified: boolean('email_verified').notNull().default(false),
  last_login_at: timestamp('last_login_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  emailUnique: unique().on(table.email),
  googleIdIdx: index('users_google_id_idx').on(table.google_id),
  facebookIdIdx: index('users_facebook_id_idx').on(table.facebook_id)
}));

// Tasks table
export const tasksTable = pgTable('tasks', {
  id: serial('id').primaryKey(),
  creator_id: integer('creator_id').notNull().references(() => usersTable.id),
  platform: platformTypeEnum('platform').notNull(),
  interaction_type: interactionTypeEnum('interaction_type').notNull(),
  target_url: text('target_url').notNull(),
  target_interactions: integer('target_interactions').notNull(),
  completed_interactions: integer('completed_interactions').notNull().default(0),
  coins_per_interaction: integer('coins_per_interaction').notNull(),
  total_coins_allocated: integer('total_coins_allocated').notNull(),
  status: taskStatusEnum('status').notNull().default('active'),
  requires_verification: boolean('requires_verification').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  completed_at: timestamp('completed_at')
}, (table) => ({
  creatorIdIdx: index('tasks_creator_id_idx').on(table.creator_id),
  statusIdx: index('tasks_status_idx').on(table.status),
  platformIdx: index('tasks_platform_idx').on(table.platform)
}));

// Task work table (when users complete tasks)
export const taskWorksTable = pgTable('task_works', {
  id: serial('id').primaryKey(),
  task_id: integer('task_id').notNull().references(() => tasksTable.id),
  worker_id: integer('worker_id').notNull().references(() => usersTable.id),
  coins_earned: integer('coins_earned').notNull(),
  completed_at: timestamp('completed_at').notNull().defaultNow(),
  verified_at: timestamp('verified_at'),
  verification_method: text('verification_method'),
  proof_screenshot: text('proof_screenshot'),
  admin_notes: text('admin_notes')
}, (table) => ({
  taskIdIdx: index('task_works_task_id_idx').on(table.task_id),
  workerIdIdx: index('task_works_worker_id_idx').on(table.worker_id),
  taskWorkerUnique: unique().on(table.task_id, table.worker_id)
}));

// Transactions table
export const transactionsTable = pgTable('transactions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  type: transactionTypeEnum('type').notNull(),
  amount: integer('amount').notNull(),
  status: transactionStatusEnum('status').notNull().default('pending'),
  payment_method: paymentMethodEnum('payment_method'),
  external_transaction_id: text('external_transaction_id'),
  description: text('description').notNull(),
  metadata: text('metadata'), // JSON string for additional data
  created_at: timestamp('created_at').notNull().defaultNow(),
  processed_at: timestamp('processed_at')
}, (table) => ({
  userIdIdx: index('transactions_user_id_idx').on(table.user_id),
  typeIdx: index('transactions_type_idx').on(table.type),
  statusIdx: index('transactions_status_idx').on(table.status),
  externalIdIdx: index('transactions_external_id_idx').on(table.external_transaction_id)
}));

// Coin packages table
export const coinPackagesTable = pgTable('coin_packages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  coin_amount: integer('coin_amount').notNull(),
  price: integer('price').notNull(), // Store price in cents to avoid floating point issues
  bonus_coins: integer('bonus_coins').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow()
});

// System settings table
export const systemSettingsTable = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  description: text('description'),
  updated_at: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  keyUnique: unique().on(table.key)
}));

// Activity logs table
export const activityLogsTable = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id),
  action: text('action').notNull(),
  resource_type: text('resource_type').notNull(),
  resource_id: integer('resource_id'),
  details: text('details'),
  ip_address: text('ip_address').notNull(),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  userIdIdx: index('activity_logs_user_id_idx').on(table.user_id),
  actionIdx: index('activity_logs_action_idx').on(table.action),
  createdAtIdx: index('activity_logs_created_at_idx').on(table.created_at)
}));

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  tasks: many(tasksTable),
  taskWorks: many(taskWorksTable),
  transactions: many(transactionsTable),
  activityLogs: many(activityLogsTable)
}));

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [tasksTable.creator_id],
    references: [usersTable.id]
  }),
  taskWorks: many(taskWorksTable)
}));

export const taskWorksRelations = relations(taskWorksTable, ({ one }) => ({
  task: one(tasksTable, {
    fields: [taskWorksTable.task_id],
    references: [tasksTable.id]
  }),
  worker: one(usersTable, {
    fields: [taskWorksTable.worker_id],
    references: [usersTable.id]
  })
}));

export const transactionsRelations = relations(transactionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [transactionsTable.user_id],
    references: [usersTable.id]
  })
}));

export const activityLogsRelations = relations(activityLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [activityLogsTable.user_id],
    references: [usersTable.id]
  })
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  tasks: tasksTable,
  taskWorks: taskWorksTable,
  transactions: transactionsTable,
  coinPackages: coinPackagesTable,
  systemSettings: systemSettingsTable,
  activityLogs: activityLogsTable
};