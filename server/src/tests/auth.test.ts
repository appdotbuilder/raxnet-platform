import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type RegisterInput } from '../schema';
import { login, register, verifyToken } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-super-secret-jwt-key';

// Simple JWT creation for testing expired tokens
function createTestJWT(payload: any, secret: string, expiresIn: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = { ...payload, iat: now, exp: now + expiresIn };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHash('sha256').update(data + secret).digest('base64url');
  
  return `${data}.${signature}`;
}

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  full_name: 'Test User'
};

const testLoginInput: LoginInput = {
  email: testUser.email,
  password: testUser.password
};

const testRegisterInput: RegisterInput = {
  email: testUser.email,
  password: testUser.password,
  full_name: testUser.full_name
};

describe('Authentication Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('register', () => {
    it('should create a new user and return user with token', async () => {
      const result = await register(testRegisterInput);

      // Validate response structure
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Validate user data
      expect(result.user.id).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
      expect(result.user.full_name).toBe(testUser.full_name);
      expect(result.user.role).toBe('user');
      expect(result.user.status).toBe('active');
      expect(result.user.coin_balance).toBe(0);
      expect(result.user.two_factor_enabled).toBe(false);
      expect(result.user.email_verified).toBe(false);
      expect(result.user.last_login_at).toBe(null);
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);
    });

    it('should save user to database with hashed password', async () => {
      const result = await register(testRegisterInput);

      // Query database to verify user was saved
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.user.id))
        .execute();

      expect(users).toHaveLength(1);
      const savedUser = users[0];
      expect(savedUser.email).toBe(testUser.email);
      expect(savedUser.full_name).toBe(testUser.full_name);
      expect(savedUser.password_hash).not.toBe(testUser.password);
      expect(savedUser.password_hash.length).toBeGreaterThan(0);
      expect(savedUser.password_hash).toContain(':'); // Contains salt:hash format
    });

    it('should handle optional google_id and facebook_id', async () => {
      const inputWithSocialIds: RegisterInput = {
        ...testRegisterInput,
        google_id: 'google123',
        facebook_id: 'facebook456'
      };

      const result = await register(inputWithSocialIds);

      expect(result.user.google_id).toBe('google123');
      expect(result.user.facebook_id).toBe('facebook456');
    });

    it('should reject duplicate email registration', async () => {
      // First registration should succeed
      await register(testRegisterInput);

      // Second registration with same email should fail
      await expect(register(testRegisterInput)).rejects.toThrow(/email already registered/i);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await register(testRegisterInput);
    });

    it('should authenticate valid credentials and return user with token', async () => {
      const result = await login(testLoginInput);

      // Validate response structure
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Validate user data
      expect(result.user.email).toBe(testUser.email);
      expect(result.user.full_name).toBe(testUser.full_name);
      expect(result.user.last_login_at).toBeInstanceOf(Date);
    });

    it('should update last_login_at timestamp', async () => {
      const loginTime = new Date();
      await login(testLoginInput);

      // Query database to verify timestamp was updated
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testUser.email))
        .execute();

      expect(users).toHaveLength(1);
      const user = users[0];
      expect(user.last_login_at).toBeInstanceOf(Date);
      expect(user.last_login_at!.getTime()).toBeGreaterThanOrEqual(loginTime.getTime());
    });

    it('should reject invalid email', async () => {
      const invalidInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: testUser.password
      };

      await expect(login(invalidInput)).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject invalid password', async () => {
      const invalidInput: LoginInput = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      await expect(login(invalidInput)).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject login for suspended user', async () => {
      // Update user status to suspended
      await db.update(usersTable)
        .set({ status: 'suspended' })
        .where(eq(usersTable.email, testUser.email))
        .execute();

      await expect(login(testLoginInput)).rejects.toThrow(/account is suspended or blocked/i);
    });

    it('should reject login for blocked user', async () => {
      // Update user status to blocked
      await db.update(usersTable)
        .set({ status: 'blocked' })
        .where(eq(usersTable.email, testUser.email))
        .execute();

      await expect(login(testLoginInput)).rejects.toThrow(/account is suspended or blocked/i);
    });
  });

  describe('verifyToken', () => {
    let validToken: string;
    let testUserId: number;

    beforeEach(async () => {
      // Create user and get valid token
      const result = await register(testRegisterInput);
      validToken = result.token;
      testUserId = result.user.id;
    });

    it('should verify valid token and return user data', async () => {
      const user = await verifyToken(validToken);

      expect(user).toBeDefined();
      expect(user.id).toBe(testUserId);
      expect(user.email).toBe(testUser.email);
      expect(user.full_name).toBe(testUser.full_name);
      expect(user.role).toBe('user');
      expect(user.status).toBe('active');
    });

    it('should reject invalid token format', async () => {
      await expect(verifyToken('invalid-token')).rejects.toThrow(/invalid token format/i);
    });

    it('should reject expired token', async () => {
      // Create an expired token
      const expiredToken = createTestJWT(
        { userId: testUserId, email: testUser.email, role: 'user' },
        JWT_SECRET,
        -3600 // Expired 1 hour ago
      );

      await expect(verifyToken(expiredToken)).rejects.toThrow(/token has expired/i);
    });

    it('should reject token with invalid signature', async () => {
      const invalidToken = createTestJWT(
        { userId: testUserId, email: testUser.email, role: 'user' },
        'wrong-secret',
        3600
      );

      await expect(verifyToken(invalidToken)).rejects.toThrow(/invalid token signature/i);
    });

    it('should reject token for non-existent user', async () => {
      const tokenForNonExistentUser = createTestJWT(
        { userId: 99999, email: 'nonexistent@example.com', role: 'user' },
        JWT_SECRET,
        3600
      );

      await expect(verifyToken(tokenForNonExistentUser)).rejects.toThrow(/user not found/i);
    });

    it('should reject token for suspended user', async () => {
      // Update user status to suspended
      await db.update(usersTable)
        .set({ status: 'suspended' })
        .where(eq(usersTable.id, testUserId))
        .execute();

      await expect(verifyToken(validToken)).rejects.toThrow(/account is suspended or blocked/i);
    });

    it('should reject token for blocked user', async () => {
      // Update user status to blocked
      await db.update(usersTable)
        .set({ status: 'blocked' })
        .where(eq(usersTable.id, testUserId))
        .execute();

      await expect(verifyToken(validToken)).rejects.toThrow(/account is suspended or blocked/i);
    });
  });

  describe('password security', () => {
    it('should hash passwords with salt and proper format', async () => {
      const result = await register(testRegisterInput);

      // Get user from database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.user.id))
        .execute();

      const savedUser = users[0];
      
      // Password should be hashed in salt:hash format
      expect(savedUser.password_hash).toContain(':');
      expect(savedUser.password_hash).not.toBe(testUser.password);
      expect(savedUser.password_hash.length).toBeGreaterThan(50);
      
      const [salt, hash] = savedUser.password_hash.split(':');
      expect(salt.length).toBeGreaterThan(0);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify passwords correctly after hashing', async () => {
      // Register user
      await register(testRegisterInput);

      // Login should work with original password
      const result = await login(testLoginInput);
      expect(result.user.email).toBe(testUser.email);
    });
  });

  describe('token generation', () => {
    it('should generate different tokens for different users', async () => {
      const user1Input: RegisterInput = {
        email: 'user1@example.com',
        password: 'password123',
        full_name: 'User One'
      };

      const user2Input: RegisterInput = {
        email: 'user2@example.com',
        password: 'password123',
        full_name: 'User Two'
      };

      const result1 = await register(user1Input);
      const result2 = await register(user2Input);

      expect(result1.token).not.toBe(result2.token);
    });

    it('should generate different tokens for same user at different times', async () => {
      const result1 = await register(testRegisterInput);
      
      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for different second
      
      const loginResult = await login(testLoginInput);

      expect(result1.token).not.toBe(loginResult.token);
    });

    it('should generate valid JWT format tokens', async () => {
      const result = await register(testRegisterInput);
      
      // JWT should have 3 parts separated by dots
      const parts = result.token.split('.');
      expect(parts).toHaveLength(3);
      
      // Each part should be base64url encoded
      parts.forEach(part => {
        expect(part.length).toBeGreaterThan(0);
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      });
    });
  });
});