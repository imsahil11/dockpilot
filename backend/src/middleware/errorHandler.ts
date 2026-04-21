import { NextFunction, Request, Response } from "express";

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: "Resource not found" });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({ error: message });
};
