import dotenv from "dotenv";
import winston from "winston";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseNumber(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://dockpilot:dockpilot_secret@postgres:5432/dockpilot",
  jwtSecret: process.env.JWT_SECRET ?? "change_this_to_a_long_random_string_minimum_32_chars",
  jwtExpiry: process.env.JWT_EXPIRY ?? "7d",
  claudeApiKey: process.env.GEMINI_API_KEY ?? process.env.CLAUDE_API_KEY ?? "",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://ai-service:8000",
  alertCpuThreshold: parseNumber(process.env.ALERT_CPU_THRESHOLD, 80),
  alertMemoryThreshold: parseNumber(process.env.ALERT_MEMORY_THRESHOLD, 90),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? ""
  }
};

export const logger = winston.createLogger({
  level: config.nodeEnv === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) =>
      `${timestamp} [${level}] ${stack ?? message}`
    )
  ),
  transports: [new winston.transports.Console()]
});
