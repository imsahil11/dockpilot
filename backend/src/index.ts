import { execSync } from "child_process";
import http from "http";
import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { config, logger } from "./config";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { createAlertRoutes } from "./routes/alerts";
import { createAuthRoutes } from "./routes/auth";
import { createContainerRoutes } from "./routes/containers";
import { createHistoryRoutes } from "./routes/history";
import { createSecurityRoutes } from "./routes/security";
import { initializeTerminalWebSocket } from "./routes/terminal";
import { createTopologyRoutes } from "./routes/topology";
import { AlertService } from "./services/alert.service";
import { DeploymentService } from "./services/deployment.service";
import { DockerEventMessage, DockerService } from "./services/docker.service";
import { EmailService } from "./services/email.service";
import { MonitoringService } from "./services/monitoring.service";
import { SecurityService } from "./services/security.service";
import { initializeSocket } from "./socket";

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

const dockerService = new DockerService();
const emailService = new EmailService();
const alertService = new AlertService(prisma, io, emailService, {
  cpu: config.alertCpuThreshold,
  memory: config.alertMemoryThreshold
});
const deploymentService = new DeploymentService(prisma, dockerService);
const securityService = new SecurityService(prisma, dockerService);
const monitoringService = new MonitoringService(dockerService, prisma, io, alertService);

app.use(
  cors({
    origin: "*",
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend", ts: Date.now() });
});

app.use("/api/auth", createAuthRoutes(prisma));
app.use("/api/containers", authenticate, createContainerRoutes(prisma, dockerService, deploymentService));
app.use("/api/topology", authenticate, createTopologyRoutes(dockerService));
app.use("/api/history", authenticate, createHistoryRoutes(deploymentService));
app.use("/api/alerts", authenticate, createAlertRoutes(prisma, alertService));
app.use("/api/security", authenticate, createSecurityRoutes(securityService));

app.use(notFoundHandler);
app.use(errorHandler);

initializeTerminalWebSocket(server, prisma, dockerService, config.jwtSecret);

const runPrismaSetup = (): void => {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    execSync("npx prisma generate", { stdio: "inherit" });
  } catch (error) {
    logger.error(`Prisma setup failed: ${(error as Error).message}`);
    throw error;
  }
};

const handleDockerEvent = async (event: DockerEventMessage): Promise<void> => {
  const action = event.Action ?? event.status ?? "";
  if (!action) {
    return;
  }

  if (
    action === "start" ||
    action === "stop" ||
    action === "die" ||
    action.startsWith("health_status")
  ) {
    io.emit("container.event", {
      id: event.id ?? event.Actor?.ID,
      action,
      attributes: event.Actor?.Attributes ?? {},
      ts: event.time ? event.time * 1000 : Date.now()
    });
  }

  const containerId = event.id ?? event.Actor?.ID;
  if (!containerId) {
    return;
  }

  try {
    const inspect = await dockerService.getClient().getContainer(containerId).inspect();
    const containerName = inspect.Name.replace(/^\//, "");

    if (["start", "stop", "die"].includes(action)) {
      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName,
        imageVersion: inspect.Config.Image,
        action: action === "die" ? "crash" : (action as "start" | "stop"),
        outcome: action === "die" ? "failure" : "success",
        triggeredSource: "system",
        notes: `Docker event: ${action}`
      });
    }

    if (action === "start") {
      await securityService.scanContainer(containerId);
      await alertService.resolveAlert(containerId, "crash");
    }

    if (action === "die") {
      await alertService.reportCrash(containerId, containerName);
    }

    if (action.startsWith("health_status: healthy")) {
      await alertService.resolveAlert(containerId, "unhealthy");
    }

    if (action.startsWith("health_status: unhealthy")) {
      await prisma.alert.create({
        data: {
          containerId,
          containerName,
          alertType: "unhealthy",
          severity: "high"
        }
      });
    }
  } catch (error) {
    logger.warn(`Docker event post-processing failed: ${(error as Error).message}`);
  }
};

const start = async (): Promise<void> => {
  runPrismaSetup();
  await prisma.$connect();

  await dockerService.subscribeToEvents((event) => {
    void handleDockerEvent(event);
  });

  monitoringService.start();

  server.listen(config.port, () => {
    logger.info(`DockPilot backend listening on port ${config.port}`);
  });
};

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  monitoringService.stop();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch(async (error) => {
  logger.error(`Failed to start backend: ${(error as Error).message}`);
  await prisma.$disconnect();
  process.exit(1);
});
