import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import * as authService from "./authService";

declare global {
  namespace Express {
    interface Request {
      user?: authService.AuthUser;
    }
  }
}

interface SessionStore {
  [token: string]: {
    userId: string;
    username: string;
    role: string;
    isFirstLogin: boolean;
    expiresAt: number;
  };
}

const sessions: SessionStore = {};
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function createSession(user: authService.AuthUser): string {
  const token = generateToken();
  sessions[token] = {
    userId: user.id,
    username: user.username,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  return token;
}

function getSession(token: string): SessionStore[string] | null {
  const session = sessions[token];
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    return null;
  }
  return session;
}

function destroySession(token: string): void {
  delete sessions[token];
}

function updateSessionFirstLogin(token: string, isFirstLogin: boolean): void {
  if (sessions[token]) {
    sessions[token].isFirstLogin = isFirstLogin;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.user = {
    id: session.userId,
    username: session.username,
    role: session.role,
    isFirstLogin: session.isFirstLogin,
  };
  next();
}

export function requirePasswordChange(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.isFirstLogin) {
    res.status(403).json({ error: "Password change required", code: "FIRST_LOGIN_REQUIRED" });
    return;
  }
  next();
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      const user = await authService.validateCredentials(username, password);
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const token = createSession(user);
      res.json({
        token,
        user: authService.sanitizeUser(user),
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", authMiddleware, (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      destroySession(token);
    }
    res.json({ success: true });
  });

  app.post("/api/auth/change-password", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      if (!oldPassword || !newPassword) {
        res.status(400).json({ error: "Old and new passwords are required" });
        return;
      }

      const result = await authService.changePassword(userId, oldPassword, newPassword);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        updateSessionFirstLogin(token, false);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const user = await authService.findUserById(req.user.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user info" });
    }
  });
}
