import { db } from '../db';
import { 
  usersTable, 
  tasksTable, 
  taskWorksTable, 
  transactionsTable, 
  activityLogsTable 
} from '../db/schema';
import { 
  type User, 
  type Transaction, 
  type ActivityLog,
  type PlatformType
} from '../schema';
import { eq, count, sum, desc, gte, and, isNull } from 'drizzle-orm';

export async function getUserDashboard(userId: number): Promise<{
    user: User;
    coinBalance: number;
    stats: {
        tasksCreated: number;
        tasksCompleted: number;
        totalCoinsEarned: number;
        totalCoinsSpent: number;
    };
    recentTransactions: Transaction[];
    recentActivities: ActivityLog[];
}> {
    try {
        // Get user info
        const userResults = await db.select()
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .execute();

        if (userResults.length === 0) {
            throw new Error('User not found');
        }

        const user = userResults[0];

        // Get tasks created by user count
        const tasksCreatedResults = await db.select({ count: count() })
            .from(tasksTable)
            .where(eq(tasksTable.creator_id, userId))
            .execute();

        // Get tasks completed by user count
        const tasksCompletedResults = await db.select({ count: count() })
            .from(taskWorksTable)
            .where(eq(taskWorksTable.worker_id, userId))
            .execute();

        // Get total coins earned (sum of coins from completed task works)
        const coinsEarnedResults = await db.select({ total: sum(taskWorksTable.coins_earned) })
            .from(taskWorksTable)
            .where(eq(taskWorksTable.worker_id, userId))
            .execute();

        // Get total coins spent (sum of coins from tasks created)
        const coinsSpentResults = await db.select({ total: sum(tasksTable.total_coins_allocated) })
            .from(tasksTable)
            .where(eq(tasksTable.creator_id, userId))
            .execute();

        // Get recent transactions (last 10)
        const recentTransactionsResults = await db.select()
            .from(transactionsTable)
            .where(eq(transactionsTable.user_id, userId))
            .orderBy(desc(transactionsTable.created_at))
            .limit(10)
            .execute();

        // Get recent activities (last 10)
        const recentActivitiesResults = await db.select()
            .from(activityLogsTable)
            .where(eq(activityLogsTable.user_id, userId))
            .orderBy(desc(activityLogsTable.created_at))
            .limit(10)
            .execute();

        const stats = {
            tasksCreated: tasksCreatedResults[0]?.count || 0,
            tasksCompleted: tasksCompletedResults[0]?.count || 0,
            totalCoinsEarned: parseInt(coinsEarnedResults[0]?.total || '0'),
            totalCoinsSpent: parseInt(coinsSpentResults[0]?.total || '0')
        };

        return {
            user,
            coinBalance: user.coin_balance,
            stats,
            recentTransactions: recentTransactionsResults,
            recentActivities: recentActivitiesResults
        };
    } catch (error) {
        console.error('User dashboard fetch failed:', error);
        throw error;
    }
}

export async function getAdminDashboard(): Promise<{
    stats: {
        totalUsers: number;
        activeUsers: number;
        totalTasks: number;
        activeTasks: number;
        totalTransactionValue: number;
        pendingVerifications: number;
    };
    userGrowthData: Array<{ date: string; count: number }>;
    transactionData: Array<{ date: string; volume: number }>;
    platformStats: Record<string, number>;
    recentActivities: ActivityLog[];
}> {
    try {
        // Get total users count
        const totalUsersResults = await db.select({ count: count() })
            .from(usersTable)
            .execute();

        // Get active users count (status = 'active')
        const activeUsersResults = await db.select({ count: count() })
            .from(usersTable)
            .where(eq(usersTable.status, 'active'))
            .execute();

        // Get total tasks count
        const totalTasksResults = await db.select({ count: count() })
            .from(tasksTable)
            .execute();

        // Get active tasks count
        const activeTasksResults = await db.select({ count: count() })
            .from(tasksTable)
            .where(eq(tasksTable.status, 'active'))
            .execute();

        // Get total transaction value (sum of all completed transaction amounts)
        const totalTransactionResults = await db.select({ total: sum(transactionsTable.amount) })
            .from(transactionsTable)
            .where(eq(transactionsTable.status, 'completed'))
            .execute();

        // Get pending verifications count (task works without verified_at)
        const pendingVerificationsResults = await db.select({ count: count() })
            .from(taskWorksTable)
            .where(isNull(taskWorksTable.verified_at))
            .execute();

        // Get user growth data for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const userGrowthResults = await db.select({
            date: usersTable.created_at,
            count: count()
        })
            .from(usersTable)
            .where(gte(usersTable.created_at, thirtyDaysAgo))
            .groupBy(usersTable.created_at)
            .orderBy(usersTable.created_at)
            .execute();

        // Get transaction data for the last 30 days
        const transactionVolumeResults = await db.select({
            date: transactionsTable.created_at,
            volume: sum(transactionsTable.amount)
        })
            .from(transactionsTable)
            .where(and(
                gte(transactionsTable.created_at, thirtyDaysAgo),
                eq(transactionsTable.status, 'completed')
            ))
            .groupBy(transactionsTable.created_at)
            .orderBy(transactionsTable.created_at)
            .execute();

        // Get platform statistics
        const platformStatsResults = await db.select({
            platform: tasksTable.platform,
            count: count()
        })
            .from(tasksTable)
            .groupBy(tasksTable.platform)
            .execute();

        // Get recent activities (last 20)
        const recentActivitiesResults = await db.select()
            .from(activityLogsTable)
            .orderBy(desc(activityLogsTable.created_at))
            .limit(20)
            .execute();

        // Process user growth data by date
        const userGrowthData = userGrowthResults.map(row => ({
            date: row.date.toISOString().split('T')[0],
            count: row.count
        }));

        // Process transaction data by date
        const transactionData = transactionVolumeResults.map(row => ({
            date: row.date.toISOString().split('T')[0],
            volume: parseInt(row.volume || '0')
        }));

        // Process platform stats
        const platformStats: Record<string, number> = {};
        platformStatsResults.forEach(row => {
            platformStats[row.platform] = row.count;
        });

        const stats = {
            totalUsers: totalUsersResults[0]?.count || 0,
            activeUsers: activeUsersResults[0]?.count || 0,
            totalTasks: totalTasksResults[0]?.count || 0,
            activeTasks: activeTasksResults[0]?.count || 0,
            totalTransactionValue: parseInt(totalTransactionResults[0]?.total || '0'),
            pendingVerifications: pendingVerificationsResults[0]?.count || 0
        };

        return {
            stats,
            userGrowthData,
            transactionData,
            platformStats,
            recentActivities: recentActivitiesResults
        };
    } catch (error) {
        console.error('Admin dashboard fetch failed:', error);
        throw error;
    }
}

export async function getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    checks: {
        database: boolean;
        paymentGateway: boolean;
        socialMediaApis: boolean;
    };
    uptime: number;
    version: string;
}> {
    try {
        let status: 'healthy' | 'warning' | 'critical' = 'healthy';
        const checks = {
            database: true,
            paymentGateway: true,
            socialMediaApis: true
        };

        // Test database connection
        try {
            await db.select({ count: count() }).from(usersTable).execute();
        } catch (error) {
            checks.database = false;
            status = 'critical';
        }

        // Mock payment gateway check (in real app, this would ping payment services)
        // For demo purposes, we'll simulate this
        const paymentGatewayHealthy = Math.random() > 0.1; // 90% chance of being healthy
        if (!paymentGatewayHealthy) {
            checks.paymentGateway = false;
            status = status === 'critical' ? 'critical' : 'warning';
        }

        // Mock social media APIs check (in real app, this would ping social platforms)
        const socialMediaHealthy = Math.random() > 0.05; // 95% chance of being healthy
        if (!socialMediaHealthy) {
            checks.socialMediaApis = false;
            status = status === 'critical' ? 'critical' : 'warning';
        }

        // Mock uptime calculation (in real app, this would be tracked from app start time)
        const uptime = 99.9;
        
        return {
            status,
            checks,
            uptime,
            version: '1.0.0'
        };
    } catch (error) {
        console.error('System health check failed:', error);
        return {
            status: 'critical',
            checks: {
                database: false,
                paymentGateway: false,
                socialMediaApis: false
            },
            uptime: 0,
            version: '1.0.0'
        };
    }
}