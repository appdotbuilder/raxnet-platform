import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type RegisterInput, type User } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-super-secret-jwt-key';
const SALT_ROUNDS = 10000; // PBKDF2 iterations

// Simple JWT implementation
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
  str += '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function createJWT(payload: any, secret: string, expiresIn: string = '7d'): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (7 * 24 * 60 * 60); // 7 days in seconds

  const jwtPayload = {
    ...payload,
    iat: now,
    exp: exp
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));
  
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHash('sha256').update(data + secret).digest('base64url');
  
  return `${data}.${signature}`;
}

function verifyJWT(token: string, secret: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  
  // Verify signature
  const expectedSignature = createHash('sha256').update(data + secret).digest('base64url');
  if (signature !== expectedSignature) {
    throw new Error('Invalid token signature');
  }

  // Decode payload
  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }

  return payload;
}

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512').toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0];

    // Check if user account is active
    if (user.status !== 'active') {
      throw new Error('Account is suspended or blocked');
    }

    // Verify password
    const isPasswordValid = verifyPassword(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login timestamp
    await db.update(usersTable)
      .set({ 
        last_login_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(usersTable.id, user.id))
      .execute();

    // Generate JWT token
    const token = createJWT(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      } as JwtPayload,
      JWT_SECRET
    );

    // Return user data (excluding password_hash for security)
    const userResponse: User = {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      coin_balance: user.coin_balance,
      google_id: user.google_id,
      facebook_id: user.facebook_id,
      two_factor_enabled: user.two_factor_enabled,
      email_verified: user.email_verified,
      last_login_at: new Date(), // Updated timestamp
      created_at: user.created_at,
      updated_at: new Date()
    };

    return { user: userResponse, token };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function register(input: RegisterInput): Promise<{ user: User; token: string }> {
  try {
    // Check if email already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUsers.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = hashPassword(input.password);

    // Create user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash: passwordHash,
        full_name: input.full_name,
        role: 'user', // Default role
        status: 'active', // Default status
        coin_balance: 0, // Default balance
        google_id: input.google_id || null,
        facebook_id: input.facebook_id || null,
        two_factor_enabled: false, // Default value
        email_verified: false, // Default value
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning()
      .execute();

    const user = result[0];

    // Generate JWT token
    const token = createJWT(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      } as JwtPayload,
      JWT_SECRET
    );

    // Return user data
    const userResponse: User = {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      coin_balance: user.coin_balance,
      google_id: user.google_id,
      facebook_id: user.facebook_id,
      two_factor_enabled: user.two_factor_enabled,
      email_verified: user.email_verified,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return { user: userResponse, token };
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

export async function verifyToken(token: string): Promise<User> {
  try {
    // Verify and decode JWT token
    const decoded = verifyJWT(token, JWT_SECRET) as JwtPayload;

    // Find user by ID
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Check if user account is still active
    if (user.status !== 'active') {
      throw new Error('Account is suspended or blocked');
    }

    // Return user data
    const userResponse: User = {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      coin_balance: user.coin_balance,
      google_id: user.google_id,
      facebook_id: user.facebook_id,
      two_factor_enabled: user.two_factor_enabled,
      email_verified: user.email_verified,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return userResponse;
  } catch (error) {
    console.error('Token verification failed:', error);
    throw error;
  }
}