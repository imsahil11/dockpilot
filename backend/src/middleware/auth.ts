import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config";

export interface AuthUser {
  id: number;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    if (typeof decoded.id !== "number" || typeof decoded.username !== "string") {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    req.user = { id: decoded.id, username: decoded.username };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
