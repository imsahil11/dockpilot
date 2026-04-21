import { Alert, PrismaClient } from "@prisma/client";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "../config";
import { DockerContainerMetric } from "./docker.service";
import { EmailService } from "./email.service";

export class AlertService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly io: SocketIOServer,
    private readonly emailService: EmailService,
    private readonly thresholds: { cpu: number; memory: number }
  ) {}

  public async checkThresholds(metrics: DockerContainerMetric[]): Promise<void> {
    for (const metric of metrics) {
      if (metric.cpuPercent > this.thresholds.cpu) {
        await this.createAlertIfNeeded({
          containerId: metric.containerId,
          containerName: metric.containerName,
          alertType: "cpu_high",
          severity: "high",
          thresholdValue: this.thresholds.cpu,
          actualValue: Number(metric.cpuPercent.toFixed(2))
        });
      } else {
        await this.resolveAlert(metric.containerId, "cpu_high");
      }

      if (metric.memoryMb > this.thresholds.memory) {
        await this.createAlertIfNeeded({
          containerId: metric.containerId,
          containerName: metric.containerName,
          alertType: "memory_high",
          severity: "high",
          thresholdValue: this.thresholds.memory,
          actualValue: Number(metric.memoryMb.toFixed(2))
        });
      } else {
        await this.resolveAlert(metric.containerId, "memory_high");
      }
    }
  }

  public async reportCrash(containerId: string, containerName: string): Promise<void> {
    await this.createAlertIfNeeded({
      containerId,
      containerName,
      alertType: "crash",
      severity: "critical",
      thresholdValue: null,
      actualValue: null
    });
  }

  public async resolveAlert(containerId: string, alertType: string): Promise<void> {
    const existing = await this.prisma.alert.findFirst({
      where: {
        containerId,
        alertType,
        resolved: false
      },
      orderBy: { createdAt: "desc" }
    });

    if (!existing) {
      return;
    }

    await this.prisma.alert.update({
      where: { id: existing.id },
      data: {
        resolved: true,
        resolvedAt: new Date()
      }
    });

    this.io.emit("alert.resolved", {
      id: existing.id,
      containerId,
      alertType,
      resolvedAt: new Date().toISOString()
    });
  }

  public async sendEmailAlert(alert: Alert): Promise<void> {
    if (!["critical", "high"].includes(alert.severity)) {
      return;
    }

    if (!this.emailService.isConfigured()) {
      return;
    }

    await this.emailService.sendAlertEmail({
      containerName: alert.containerName,
      alertType: alert.alertType,
      severity: alert.severity,
      thresholdValue: alert.thresholdValue,
      actualValue: alert.actualValue,
      createdAt: alert.createdAt
    });
  }

  private async createAlertIfNeeded(data: {
    containerId: string;
    containerName: string;
    alertType: string;
    severity: string;
    thresholdValue: number | null;
    actualValue: number | null;
  }): Promise<void> {
    const dedupeWindow = new Date(Date.now() - 60_000);
    const existing = await this.prisma.alert.findFirst({
      where: {
        containerId: data.containerId,
        alertType: data.alertType,
        resolved: false,
        createdAt: { gte: dedupeWindow }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return;
    }

    const alert = await this.prisma.alert.create({
      data: {
        containerId: data.containerId,
        containerName: data.containerName,
        alertType: data.alertType,
        severity: data.severity,
        thresholdValue: data.thresholdValue,
        actualValue: data.actualValue
      }
    });

    this.io.emit("alert.new", alert);

    try {
      await this.sendEmailAlert(alert);
    } catch (error) {
      logger.error(`Failed to send alert email: ${(error as Error).message}`);
    }
  }
}
