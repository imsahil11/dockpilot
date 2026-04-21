import Docker from "dockerode";
import { DeploymentLog, PrismaClient } from "@prisma/client";
import { DockerService } from "./docker.service";

export interface DeploymentEventInput {
  containerId: string;
  containerName: string;
  imageVersion: string;
  imageDigest?: string | null;
  action: "start" | "stop" | "restart" | "crash" | "rollback" | "exec";
  outcome: "success" | "failure";
  triggeredBy?: number;
  triggeredSource: "user" | "ai_agent" | "system" | "alert";
  notes?: string;
}

export interface DeploymentHistoryFilters {
  page?: number;
  pageSize?: number;
  container?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: string;
}

export class DeploymentService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly dockerService: DockerService
  ) {}

  public async logEvent(data: DeploymentEventInput): Promise<DeploymentLog> {
    return this.prisma.deploymentLog.create({
      data: {
        containerId: data.containerId,
        containerName: data.containerName,
        imageVersion: data.imageVersion,
        imageDigest: data.imageDigest,
        action: data.action,
        outcome: data.outcome,
        triggeredBy: data.triggeredBy,
        triggeredSource: data.triggeredSource,
        notes: data.notes
      }
    });
  }

  public async getHistory(filters: DeploymentHistoryFilters): Promise<{
    items: DeploymentLog[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 20)));

    const where = {
      containerName: filters.container
        ? {
            contains: filters.container,
            mode: "insensitive" as const
          }
        : undefined,
      action: filters.action ?? undefined,
      outcome: filters.outcome ?? undefined,
      createdAt:
        filters.dateFrom || filters.dateTo
          ? {
              gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
              lte: filters.dateTo ? new Date(filters.dateTo) : undefined
            }
          : undefined
    };

    const [items, total] = await Promise.all([
      this.prisma.deploymentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, username: true }
          }
        }
      }),
      this.prisma.deploymentLog.count({ where })
    ]);

    return { items, total, page, pageSize };
  }

  public async rollback(logId: number, userId: number): Promise<{ newContainerId: string; imageVersion: string }> {
    const logEntry = await this.prisma.deploymentLog.findUnique({
      where: { id: logId }
    });

    if (!logEntry) {
      throw new Error("Log entry not found");
    }

    const docker = this.dockerService.getClient();
    await this.dockerService.pullImage(logEntry.imageVersion);

    let inspect: Docker.ContainerInspectInfo;
    try {
      inspect = await docker.getContainer(logEntry.containerId).inspect();
    } catch (_error) {
      const all = await docker.listContainers({ all: true });
      const match = all.find((c) => c.Names.some((n) => n.replace(/^\//, "") === logEntry.containerName));
      if (!match) {
        throw new Error("Original container not found for rollback");
      }
      inspect = await docker.getContainer(match.Id).inspect();
    }

    const oldContainer = docker.getContainer(inspect.Id);
    const wasRunning = inspect.State.Running;
    if (wasRunning) {
      await oldContainer.stop();
    }
    await oldContainer.remove({ force: true });

    const hostConfig: Docker.HostConfig = {
      Binds: inspect.HostConfig?.Binds,
      PortBindings: inspect.HostConfig?.PortBindings,
      RestartPolicy: inspect.HostConfig?.RestartPolicy,
      Memory: inspect.HostConfig?.Memory,
      NanoCpus: inspect.HostConfig?.NanoCpus,
      Privileged: inspect.HostConfig?.Privileged,
      NetworkMode: inspect.HostConfig?.NetworkMode
    };

    const endpointConfig = Object.fromEntries(
      Object.entries(inspect.NetworkSettings?.Networks ?? {}).map(([networkName, networkValue]) => [
        networkName,
        {
          Aliases: networkValue.Aliases,
          IPAMConfig: networkValue.IPAMConfig
        }
      ])
    );

    const createConfig: Docker.ContainerCreateOptions = {
      name: logEntry.containerName,
      Image: logEntry.imageVersion,
      Cmd: inspect.Config?.Cmd,
      Env: inspect.Config?.Env,
      Entrypoint: inspect.Config?.Entrypoint,
      WorkingDir: inspect.Config?.WorkingDir,
      ExposedPorts: inspect.Config?.ExposedPorts,
      HostConfig: hostConfig,
      NetworkingConfig: {
        EndpointsConfig: endpointConfig
      }
    };

    try {
      const newContainerId = await this.dockerService.createContainerFromConfig(createConfig);
      await this.logEvent({
        containerId: newContainerId,
        containerName: logEntry.containerName,
        imageVersion: logEntry.imageVersion,
        action: "rollback",
        outcome: "success",
        triggeredBy: userId,
        triggeredSource: "user",
        notes: `Rollback from log #${logId}`
      });

      return { newContainerId, imageVersion: logEntry.imageVersion };
    } catch (error) {
      await this.logEvent({
        containerId: logEntry.containerId,
        containerName: logEntry.containerName,
        imageVersion: logEntry.imageVersion,
        action: "rollback",
        outcome: "failure",
        triggeredBy: userId,
        triggeredSource: "user",
        notes: (error as Error).message
      });
      throw error;
    }
  }
}
