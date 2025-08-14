import { initTRPC, TRPCError } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  registerInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  createTaskWorkInputSchema,
  verifyTaskWorkInputSchema,
  createTransactionInputSchema,
  updateTransactionInputSchema,
  createCoinPackageInputSchema,
  updateCoinPackageInputSchema,
  updateSystemSettingInputSchema,
  createActivityLogInputSchema,
  updateUserInputSchema,
  PlatformType,
  InteractionType
} from './schema';

// Import handlers
import { login, register, verifyToken } from './handlers/auth';
import { getUsers, getUserById, updateUser, getUserStats, blockUser, suspendUser } from './handlers/users';
import { createTask, getTasks, getTaskById, getUserTasks, updateTask, pauseTask, cancelTask, getTaskStats } from './handlers/tasks';
import { createTaskWork, getTaskWorksByUser, getTaskWorksByTask, getPendingTaskWorks, verifyTaskWork, rejectTaskWork, autoVerifyTaskWork } from './handlers/task_works';
import { createTransaction, getTransactionsByUser, getTransactionById, getAllTransactions, updateTransaction, processTopup, processWithdrawal, getTransactionStats } from './handlers/transactions';
import { getCoinPackages, getCoinPackageById, createCoinPackage, updateCoinPackage, deactivateCoinPackage, purchaseCoinPackage } from './handlers/coin_packages';
import { getSystemSettings, getSystemSetting, updateSystemSetting, initializeDefaultSettings, getCommissionRate, getCoinLimits } from './handlers/system_settings';
import { createActivityLog, getActivityLogs, getUserActivityLogs, logUserLogin, logTaskCreation, logTaskWork, logTransaction, logAdminAction } from './handlers/activity_logs';
import { getUserDashboard, getAdminDashboard, getSystemHealth } from './handlers/dashboard';

// Create context type (placeholder for authentication)
interface Context {
  user?: {
    id: number;
    email: string;
    role: 'user' | 'admin';
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Protected procedure (requires authentication)
const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    
    verifyToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => verifyToken(input.token)),
  }),

  // User management routes
  users: router({
    // User routes
    getProfile: protectedProcedure
      .query(({ ctx }) => getUserById(ctx.user.id)),
    
    updateProfile: protectedProcedure
      .input(updateUserInputSchema)
      .mutation(({ input, ctx }) => {
        if (input.id !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return updateUser(input);
      }),
    
    getStats: protectedProcedure
      .query(({ ctx }) => getUserStats(ctx.user.id)),
    
    getDashboard: protectedProcedure
      .query(({ ctx }) => getUserDashboard(ctx.user.id)),

    // Admin-only user management
    getAll: adminProcedure
      .query(() => getUsers()),
    
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getUserById(input.id)),
    
    update: adminProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    
    block: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => blockUser(input.userId)),
    
    suspend: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => suspendUser(input.userId)),
  }),

  // Task management routes
  tasks: router({
    create: protectedProcedure
      .input(createTaskInputSchema)
      .mutation(({ input, ctx }) => createTask(input, ctx.user.id)),
    
    getAll: publicProcedure
      .input(z.object({
        platform: PlatformType.optional(),
        interaction_type: InteractionType.optional(),
        status: z.enum(['active', 'completed']).optional()
      }).optional())
      .query(({ input }) => getTasks(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTaskById(input.id)),
    
    getMyTasks: protectedProcedure
      .query(({ ctx }) => getUserTasks(ctx.user.id)),
    
    update: protectedProcedure
      .input(updateTaskInputSchema)
      .mutation(({ input }) => updateTask(input)),
    
    pause: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(({ input }) => pauseTask(input.taskId)),
    
    cancel: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(({ input }) => cancelTask(input.taskId)),
    
    getStats: adminProcedure
      .query(() => getTaskStats()),
  }),

  // Task work routes
  taskWorks: router({
    create: protectedProcedure
      .input(createTaskWorkInputSchema)
      .mutation(({ input, ctx }) => createTaskWork(input, ctx.user.id)),
    
    getMyWorks: protectedProcedure
      .query(({ ctx }) => getTaskWorksByUser(ctx.user.id)),
    
    getByTask: publicProcedure
      .input(z.object({ taskId: z.number() }))
      .query(({ input }) => getTaskWorksByTask(input.taskId)),
    
    getPending: adminProcedure
      .query(() => getPendingTaskWorks()),
    
    verify: adminProcedure
      .input(verifyTaskWorkInputSchema)
      .mutation(({ input }) => verifyTaskWork(input)),
    
    reject: adminProcedure
      .input(z.object({ taskWorkId: z.number(), reason: z.string() }))
      .mutation(({ input }) => rejectTaskWork(input.taskWorkId, input.reason)),
    
    autoVerify: adminProcedure
      .input(z.object({ taskWorkId: z.number() }))
      .mutation(({ input }) => autoVerifyTaskWork(input.taskWorkId)),
  }),

  // Transaction routes
  transactions: router({
    create: protectedProcedure
      .input(createTransactionInputSchema)
      .mutation(({ input, ctx }) => createTransaction(input, ctx.user.id)),
    
    getMyTransactions: protectedProcedure
      .query(({ ctx }) => getTransactionsByUser(ctx.user.id)),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTransactionById(input.id)),
    
    getAll: adminProcedure
      .query(() => getAllTransactions()),
    
    update: adminProcedure
      .input(updateTransactionInputSchema)
      .mutation(({ input }) => updateTransaction(input)),
    
    processTopup: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ input }) => processTopup(input.transactionId)),
    
    processWithdrawal: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ input }) => processWithdrawal(input.transactionId)),
    
    getStats: adminProcedure
      .query(() => getTransactionStats()),
  }),

  // Coin package routes
  coinPackages: router({
    getAll: publicProcedure
      .query(() => getCoinPackages()),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getCoinPackageById(input.id)),
    
    create: adminProcedure
      .input(createCoinPackageInputSchema)
      .mutation(({ input }) => createCoinPackage(input)),
    
    update: adminProcedure
      .input(updateCoinPackageInputSchema)
      .mutation(({ input }) => updateCoinPackage(input)),
    
    deactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deactivateCoinPackage(input.id)),
    
    purchase: protectedProcedure
      .input(z.object({ 
        packageId: z.number(), 
        paymentMethod: z.string() 
      }))
      .mutation(({ input, ctx }) => purchaseCoinPackage(input.packageId, ctx.user.id, input.paymentMethod)),
  }),

  // System settings routes
  systemSettings: router({
    getAll: adminProcedure
      .query(() => getSystemSettings()),
    
    get: adminProcedure
      .input(z.object({ key: z.string() }))
      .query(({ input }) => getSystemSetting(input.key)),
    
    update: adminProcedure
      .input(updateSystemSettingInputSchema)
      .mutation(({ input }) => updateSystemSetting(input)),
    
    initialize: adminProcedure
      .mutation(() => initializeDefaultSettings()),
    
    getCommissionRate: publicProcedure
      .query(() => getCommissionRate()),
    
    getCoinLimits: publicProcedure
      .query(() => getCoinLimits()),
  }),

  // Activity logs routes
  activityLogs: router({
    create: publicProcedure
      .input(createActivityLogInputSchema)
      .mutation(({ input }) => createActivityLog(input)),
    
    getAll: adminProcedure
      .input(z.object({
        userId: z.number().optional(),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().default(100)
      }).optional())
      .query(({ input }) => getActivityLogs(input)),
    
    getByUser: protectedProcedure
      .input(z.object({ 
        userId: z.number().optional(),
        limit: z.number().default(50) 
      }).optional())
      .query(({ input, ctx }) => {
        const userId = input?.userId || ctx.user.id;
        // Users can only see their own logs, admins can see any user's logs
        if (userId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return getUserActivityLogs(userId, input?.limit);
      }),
    
    logLogin: publicProcedure
      .input(z.object({ 
        userId: z.number(), 
        ipAddress: z.string(),
        userAgent: z.string().optional()
      }))
      .mutation(({ input }) => logUserLogin(input.userId, input.ipAddress, input.userAgent)),
    
    logTaskCreation: protectedProcedure
      .input(z.object({ taskId: z.number(), ipAddress: z.string() }))
      .mutation(({ input, ctx }) => logTaskCreation(ctx.user.id, input.taskId, input.ipAddress)),
    
    logTaskWork: protectedProcedure
      .input(z.object({ taskId: z.number(), ipAddress: z.string() }))
      .mutation(({ input, ctx }) => logTaskWork(ctx.user.id, input.taskId, input.ipAddress)),
    
    logTransaction: protectedProcedure
      .input(z.object({ 
        transactionId: z.number(), 
        action: z.string(),
        ipAddress: z.string() 
      }))
      .mutation(({ input, ctx }) => logTransaction(ctx.user.id, input.transactionId, input.action, input.ipAddress)),
    
    logAdminAction: adminProcedure
      .input(z.object({
        action: z.string(),
        resourceType: z.string(),
        resourceId: z.number().optional(),
        details: z.string().optional(),
        ipAddress: z.string().default('127.0.0.1')
      }))
      .mutation(({ input, ctx }) => logAdminAction(ctx.user.id, input.action, input.resourceType, input.resourceId, input.details, input.ipAddress)),
  }),

  // Dashboard routes
  dashboard: router({
    user: protectedProcedure
      .query(({ ctx }) => getUserDashboard(ctx.user.id)),
    
    admin: adminProcedure
      .query(() => getAdminDashboard()),
    
    systemHealth: adminProcedure
      .query(() => getSystemHealth()),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext(): Context {
      // This is a placeholder context creation
      // In real implementation, you would extract JWT token from headers,
      // verify it, and populate user information
      return {
        user: undefined // Will be populated by authentication middleware
      };
    },
  });
  server.listen(port);
  console.log(`RAXNET tRPC server listening at port: ${port}`);
  console.log('Available routes:');
  console.log('  - auth.login, auth.register, auth.verifyToken');
  console.log('  - users.* (profile management, admin user management)');
  console.log('  - tasks.* (task creation, management, stats)');
  console.log('  - taskWorks.* (task completion, verification)');
  console.log('  - transactions.* (payments, withdrawals, stats)');
  console.log('  - coinPackages.* (package management, purchases)');
  console.log('  - systemSettings.* (admin configuration)');
  console.log('  - activityLogs.* (audit logging)');
  console.log('  - dashboard.* (user and admin dashboards)');
}

start();