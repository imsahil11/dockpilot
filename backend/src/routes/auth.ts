import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { NextFunction, Request, Response, Router } from "express";
import { body, validationResult } from "express-validator";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";
import { authenticate } from "../middleware/auth";

export const createAuthRoutes = (prisma: PrismaClient): Router => {
  const router = Router();

  router.post(
    "/register",
    [
      body("username").isString().isLength({ min: 3, max: 20 }),
      body("password").isString().isLength({ min: 8 })
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          res.status(400).json({ errors: errors.array() });
          return;
        }

        const { username, password } = req.body as { username: string; password: string };
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
          res.status(409).json({ error: "Username already exists" });
          return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
          data: {
            username,
            passwordHash
          }
        });

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username
          },
          config.jwtSecret,
          { expiresIn: config.jwtExpiry as SignOptions["expiresIn"] }
        );

        res.status(201).json({
          token,
          user: {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/login",
    [body("username").isString(), body("password").isString()],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          res.status(400).json({ errors: errors.array() });
          return;
        }

        const { username, password } = req.body as { username: string; password: string };
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }

        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username
          },
          config.jwtSecret,
          { expiresIn: config.jwtExpiry as SignOptions["expiresIn"] }
        );

        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/me", authenticate, async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return router;
};
