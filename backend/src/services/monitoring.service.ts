import { PrismaClient } from "@prisma/client";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "../config";
import { AlertService } from "./alert.service";
import { DockerContainerMetric, DockerService } from "./docker.service";

export class MonitoringService {
  private pollingTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private latestMetrics = new Map<string, DockerContainerMetric>();
  private previousStates = new Map<string, string>();

  public constructor(
    private readonly dockerService: DockerService,
    private readonly prisma: PrismaClient,
    private readonly io: SocketIOServer,
    private readonly alertService: AlertService
  ) {}

  public start(): void {
    if (this.pollingTimer) {
      return;
    }

    this.pollingTimer = setInterval(() => {
      void this.pollAndBroadcast();
    }, 2_000);

    this.snapshotTimer = setInterval(() => {
      void this.persistSnapshots();
    }, 30_000);

    void this.pollAndBroadcast();
    logger.info("Monitoring loop started");
  }

  public stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    logger.info("Monitoring loop stopped");
  }

  public getLatestMetrics(): DockerContainerMetric[] {
    return Array.from(this.latestMetrics.values());
  }

  private async pollAndBroadcast(): Promise<void> {
    try {
      const containers = await this.dockerService.listContainers();
      const runningContainers = containers.filter((item) => item.inspect.State.Running);

      const metrics = await Promise.all(
        runningContainers.map(async (item) => this.dockerService.getContainerStats(item.inspect.Id))
      );

      for (const metric of metrics) {
        this.latestMetrics.set(metric.containerId, metric);
      }

      for (const item of containers) {
        const id = item.inspect.Id;
        const currentStatus = item.inspect.State.Status;
        const previousStatus = this.previousStates.get(id);

        if (previousStatus === "running" && ["exited", "dead"].includes(currentStatus)) {
          await this.alertService.reportCrash(id, item.inspect.Name.replace(/^\//, ""));
        }

        if (currentStatus === "running") {
          await this.alertService.resolveAlert(id, "crash");
        }

        this.previousStates.set(id, currentStatus);
      }

      await this.alertService.checkThresholds(metrics);
      this.io.emit("stats.update", metrics);
    } catch (error) {
      logger.error(`Monitoring cycle failed: ${(error as Error).message}`);
      this.io.emit("docker.error", {
        message: "Docker daemon unavailable",
        ts: Date.now()
      });
    }
  }

  private async persistSnapshots(): Promise<void> {
    const snapshots = Array.from(this.latestMetrics.values());
    if (!snapshots.length) {
      return;
    }

    await this.prisma.containerSnapshot.createMany({
      data: snapshots.map((metric) => ({
        containerId: metric.containerId,
        containerName: metric.containerName,
        image: metric.image,
        status: metric.status,
        cpuPercent: metric.cpuPercent,
        memoryMb: metric.memoryMb,
        networkInBytes: BigInt(Math.max(0, Math.round(metric.networkInBytes))),
        networkOutBytes: BigInt(Math.max(0, Math.round(metric.networkOutBytes)))
      }))
    });
  }
}
