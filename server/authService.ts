import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "1111";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  isFirstLogin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function ensureUsersTableExists(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_first_login BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(createTableSQL);
}

export async function bootstrapAdminUser(): Promise<void> {
  try {
    await ensureUsersTableExists();
    
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.username, DEFAULT_ADMIN_USERNAME));

    if (existingAdmin.length === 0) {
      const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
      await db.insert(users).values({
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        role: "admin",
        isFirstLogin: true,
      });
      console.log("[Auth] Default admin user created");
    } else {
      console.log("[Auth] Admin user already exists");
    }
  } catch (error) {
    console.error("[Auth] Failed to bootstrap admin user:", error);
  }
}

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  return user || null;
}

export async function findUserById(id: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id));
  return user || null;
}

export async function validateCredentials(username: string, password: string): Promise<AuthUser | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isFirstLogin: user.isFirstLogin ?? true,
  };
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const user = await findUserById(userId);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  const isOldPasswordValid = await verifyPassword(oldPassword, user.passwordHash);
  if (!isOldPasswordValid) {
    return { success: false, error: "Current password is incorrect" };
  }

  if (newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters" };
  }

  const newPasswordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({
      passwordHash: newPasswordHash,
      isFirstLogin: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { success: true };
}

export function sanitizeUser(user: AuthUser): Omit<AuthUser, "passwordHash"> {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
  };
}
