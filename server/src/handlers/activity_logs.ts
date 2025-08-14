import { db } from '../db';
import { activityLogsTable, usersTable } from '../db/schema';
import { type ActivityLog, type CreateActivityLogInput } from '../schema';
import { eq, and, gte, lte, desc, SQL } from 'drizzle-orm';

export async function createActivityLog(input: CreateActivityLogInput): Promise<ActivityLog> {
  try {
    const result = await db.insert(activityLogsTable)
      .values({
        user_id: input.user_id || null,
        action: input.action,
        resource_type: input.resource_type,
        resource_id: input.resource_id || null,
        details: input.details || null,
        ip_address: input.ip_address,
        user_agent: input.user_agent || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Activity log creation failed:', error);
    throw error;
  }
}

export async function getActivityLogs(filters?: {
  userId?: number;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<ActivityLog[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    if (filters?.userId) {
      conditions.push(eq(activityLogsTable.user_id, filters.userId));
    }

    if (filters?.action) {
      conditions.push(eq(activityLogsTable.action, filters.action));
    }

    if (filters?.resourceType) {
      conditions.push(eq(activityLogsTable.resource_type, filters.resourceType));
    }

    if (filters?.startDate) {
      conditions.push(gte(activityLogsTable.created_at, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(activityLogsTable.created_at, filters.endDate));
    }

    // Build the query step by step
    const baseQuery = db.select().from(activityLogsTable);
    
    const queryWithConditions = conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;

    const queryWithOrder = queryWithConditions.orderBy(desc(activityLogsTable.created_at));

    const finalQuery = filters?.limit 
      ? queryWithOrder.limit(filters.limit)
      : queryWithOrder;

    const results = await finalQuery.execute();
    return results;
  } catch (error) {
    console.error('Activity logs fetch failed:', error);
    throw error;
  }
}

export async function getUserActivityLogs(userId: number, limit = 50): Promise<ActivityLog[]> {
  try {
    const results = await db.select()
      .from(activityLogsTable)
      .where(eq(activityLogsTable.user_id, userId))
      .orderBy(desc(activityLogsTable.created_at))
      .limit(limit)
      .execute();

    return results;
  } catch (error) {
    console.error('User activity logs fetch failed:', error);
    throw error;
  }
}

export async function logUserLogin(userId: number, ipAddress: string, userAgent?: string): Promise<ActivityLog> {
  const input: CreateActivityLogInput = {
    user_id: userId,
    action: 'user_login',
    resource_type: 'auth',
    resource_id: userId,
    details: 'User logged in successfully',
    ip_address: ipAddress,
    user_agent: userAgent
  };

  return createActivityLog(input);
}

export async function logTaskCreation(userId: number, taskId: number, ipAddress: string): Promise<ActivityLog> {
  const input: CreateActivityLogInput = {
    user_id: userId,
    action: 'task_created',
    resource_type: 'task',
    resource_id: taskId,
    details: 'User created a new task',
    ip_address: ipAddress
  };

  return createActivityLog(input);
}

export async function logTaskWork(userId: number, taskId: number, ipAddress: string): Promise<ActivityLog> {
  const input: CreateActivityLogInput = {
    user_id: userId,
    action: 'task_completed',
    resource_type: 'task_work',
    resource_id: taskId,
    details: 'User completed a task',
    ip_address: ipAddress
  };

  return createActivityLog(input);
}

export async function logTransaction(userId: number, transactionId: number, action: string, ipAddress: string): Promise<ActivityLog> {
  const input: CreateActivityLogInput = {
    user_id: userId,
    action: `transaction_${action}`,
    resource_type: 'transaction',
    resource_id: transactionId,
    details: `Transaction ${action}`,
    ip_address: ipAddress
  };

  return createActivityLog(input);
}

export async function logAdminAction(adminId: number, action: string, resourceType: string, resourceId?: number, details?: string, ipAddress = '127.0.0.1'): Promise<ActivityLog> {
  const input: CreateActivityLogInput = {
    user_id: adminId,
    action: `admin_${action}`,
    resource_type: resourceType,
    resource_id: resourceId,
    details: details || `Admin performed ${action} on ${resourceType}`,
    ip_address: ipAddress
  };

  return createActivityLog(input);
}