import Docker from "dockerode";
import yaml from "js-yaml";
import { PassThrough } from "stream";
import { logger } from "../config";

export interface DockerContainerMetric {
  containerId: string;
  containerName: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryMb: number;
  networkInBytes: number;
  networkOutBytes: number;
  timestamp: number;
}

export interface TopologyNode {
  id: string;
  type: "service" | "network" | "volume";
  data: {
    name: string;
    image?: string;
    status?: string;
    cpuPercent?: number;
    memoryMb?: number;
  };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: "depends_on" | "network" | "volume";
}

export interface DockerExecResult {
  output: string;
  exitCode: number | null;
}

export interface DockerEventMessage {
  status?: string;
  id?: string;
  Type?: string;
  Action?: string;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
  time?: number;
  timeNano?: number;
}

export class DockerService {
  private readonly docker: Docker;

  public constructor(socketPath = process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
  }

  public getClient(): Docker {
    return this.docker;
  }

  public async listContainers(): Promise<Array<{ summary: Docker.ContainerInfo; inspect: Docker.ContainerInspectInfo }>> {
    const containers = await this.docker.listContainers({ all: true });
    const detailed = await Promise.all(
      containers.map(async (summary) => {
        const inspect = await this.docker.getContainer(summary.Id).inspect();
        return { summary, inspect };
      })
    );
    return detailed;
  }

  public async getContainerStats(id: string): Promise<DockerContainerMetric> {
    const container = this.docker.getContainer(id);
    const [stats, inspect] = await Promise.all([
      container.stats({ stream: false }),
      container.inspect()
    ]);

    const cpuTotal = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
    const preCpuTotal = stats.precpu_stats?.cpu_usage?.total_usage ?? 0;
    const cpuDelta = cpuTotal - preCpuTotal;

    const systemCpu = stats.cpu_stats?.system_cpu_usage ?? 0;
    const preSystemCpu = stats.precpu_stats?.system_cpu_usage ?? 0;
    const systemDelta = systemCpu - preSystemCpu;

    const cpuCount =
      stats.cpu_stats?.online_cpus ??
      stats.cpu_stats?.cpu_usage?.percpu_usage?.length ??
      1;

    const cpuPercent =
      cpuDelta > 0 && systemDelta > 0
        ? (cpuDelta / systemDelta) * cpuCount * 100.0
        : 0;

    const memoryUsageBytes = stats.memory_stats?.usage ?? 0;
    const memoryMb = memoryUsageBytes / (1024 * 1024);

    const networks = stats.networks ?? {};
    const aggregated = Object.values(networks).reduce(
      (acc, entry) => {
        acc.in += entry.rx_bytes ?? 0;
        acc.out += entry.tx_bytes ?? 0;
        return acc;
      },
      { in: 0, out: 0 }
    );

    return {
      containerId: inspect.Id,
      containerName: inspect.Name.replace(/^\//, ""),
      image: inspect.Config.Image,
      status: inspect.State.Status,
      cpuPercent,
      memoryMb,
      networkInBytes: aggregated.in,
      networkOutBytes: aggregated.out,
      timestamp: Date.now()
    };
  }

  public async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  public async stopContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).stop();
  }

  public async restartContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).restart();
  }

  public async removeContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).remove({ force: true });
  }

  public async getContainerLogs(id: string, tail = 100): Promise<string> {
    const logs = await this.docker.getContainer(id).logs({
      stdout: true,
      stderr: true,
      timestamps: true,
      tail
    });

    if (Buffer.isBuffer(logs)) {
      return logs.toString("utf8");
    }

    return this.streamToString(logs);
  }

  public async execInContainer(id: string, cmd: string[]): Promise<DockerExecResult> {
    const container = this.docker.getContainer(id);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: false,
      Tty: false
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    this.docker.modem.demuxStream(stream, stdout, stderr);

    await new Promise<void>((resolve, reject) => {
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });

    const inspect = await exec.inspect();
    const output = Buffer.concat([...stdoutChunks, ...stderrChunks]).toString("utf8");

    return {
      output,
      exitCode: inspect.ExitCode ?? null
    };
  }

  public async pullImage(imageTag: string): Promise<string[]> {
    const stream = await this.docker.pull(imageTag);

    return new Promise<string[]>((resolve, reject) => {
      const progressLines: string[] = [];
      this.docker.modem.followProgress(
        stream,
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }

          if (Array.isArray(output)) {
            for (const entry of output) {
              if (entry.status) {
                progressLines.push(entry.status);
              }
            }
          }

          resolve(progressLines);
        },
        (event) => {
          if (event.status) {
            progressLines.push(event.status);
          }
        }
      );
    });
  }

  public async createContainerFromConfig(config: Docker.ContainerCreateOptions): Promise<string> {
    const container = await this.docker.createContainer(config);
    await container.start();
    return container.id;
  }

  public async subscribeToEvents(callback: (event: DockerEventMessage) => void): Promise<void> {
    const eventStream = await this.docker.getEvents();
    let buffer = "";

    eventStream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const event = JSON.parse(line) as DockerEventMessage;
          callback(event);
        } catch (error) {
          logger.warn(`Failed to parse Docker event: ${line}`);
        }
      }
    });

    eventStream.on("error", (error) => {
      logger.error(`Docker event stream error: ${(error as Error).message}`);
    });

    logger.info("Subscribed to Docker daemon events");
  }

  public parseComposeFile(yamlString: string): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
    const parsed = yaml.load(yamlString) as {
      services?: Record<string, { image?: string; depends_on?: string[] | Record<string, unknown>; networks?: string[]; volumes?: string[] }>;
      networks?: Record<string, unknown>;
      volumes?: Record<string, unknown>;
    };

    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];

    const services = parsed.services ?? {};

    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      const serviceNodeId = `svc:${serviceName}`;
      nodes.push({
        id: serviceNodeId,
        type: "service",
        data: {
          name: serviceName,
          image: serviceConfig.image ?? "unknown",
          status: "defined"
        }
      });

      const dependsOn = Array.isArray(serviceConfig.depends_on)
        ? serviceConfig.depends_on
        : Object.keys(serviceConfig.depends_on ?? {});

      for (const dependency of dependsOn) {
        edges.push({
          id: `${serviceNodeId}->svc:${dependency}:depends_on`,
          source: serviceNodeId,
          target: `svc:${dependency}`,
          label: "depends_on"
        });
      }

      for (const network of serviceConfig.networks ?? []) {
        const networkNodeId = `net:${network}`;
        if (!nodes.some((node) => node.id === networkNodeId)) {
          nodes.push({
            id: networkNodeId,
            type: "network",
            data: {
              name: network
            }
          });
        }

        edges.push({
          id: `${serviceNodeId}->${networkNodeId}:network`,
          source: serviceNodeId,
          target: networkNodeId,
          label: "network"
        });
      }

      for (const volumeEntry of serviceConfig.volumes ?? []) {
        const volumeName = volumeEntry.split(":")[0];
        if (!volumeName) {
          continue;
        }

        const volumeNodeId = `vol:${volumeName}`;
        if (!nodes.some((node) => node.id === volumeNodeId)) {
          nodes.push({
            id: volumeNodeId,
            type: "volume",
            data: {
              name: volumeName
            }
          });
        }

        edges.push({
          id: `${serviceNodeId}->${volumeNodeId}:volume`,
          source: serviceNodeId,
          target: volumeNodeId,
          label: "volume"
        });
      }
    }

    for (const network of Object.keys(parsed.networks ?? {})) {
      const networkNodeId = `net:${network}`;
      if (!nodes.some((node) => node.id === networkNodeId)) {
        nodes.push({
          id: networkNodeId,
          type: "network",
          data: { name: network }
        });
      }
    }

    for (const volume of Object.keys(parsed.volumes ?? {})) {
      const volumeNodeId = `vol:${volume}`;
      if (!nodes.some((node) => node.id === volumeNodeId)) {
        nodes.push({
          id: volumeNodeId,
          type: "volume",
          data: { name: volume }
        });
      }
    }

    return { nodes, edges };
  }

  private streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
  }
}
