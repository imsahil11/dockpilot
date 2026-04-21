import { PrismaClient } from "@prisma/client";
import { DockerService } from "./docker.service";

export type Severity = "critical" | "high" | "medium" | "low";

export interface SecurityIssue {
  check: string;
  severity: Severity;
  description: string;
  remediation: string;
}

export interface SecurityScanResult {
  score: number;
  issues: SecurityIssue[];
  totalChecks: number;
  passedChecks: number;
}

const severityPenalty: Record<Severity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3
};

export class SecurityService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly dockerService: DockerService
  ) {}

  public async scanContainer(containerId: string, triggeredBy?: number): Promise<SecurityScanResult> {
    const inspect = await this.dockerService.getClient().getContainer(containerId).inspect();
    const issues: SecurityIssue[] = [];

    const portBindings = inspect.HostConfig?.PortBindings ?? {};
    const hasPublicBinding = Object.values(portBindings).some((bindings) =>
      (bindings ?? []).some((binding) => binding.HostIp === "0.0.0.0")
    );
    if (hasPublicBinding) {
      issues.push({
        check: "Exposed ports check",
        severity: "high",
        description: "Container ports are bound to 0.0.0.0 and exposed publicly.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      ports:\n        - \"127.0.0.1:8080:8080\"\nCLI: docker run -p 127.0.0.1:8080:8080 <image>"
      });
    }

    const user = inspect.Config?.User?.trim().toLowerCase() ?? "";
    if (!user || user === "0" || user === "root") {
      issues.push({
        check: "Root user check",
        severity: "critical",
        description: "Container is running as root user.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      user: \"1000:1000\"\nCLI: docker run --user 1000:1000 <image>"
      });
    }

    if ((inspect.HostConfig?.Memory ?? 0) === 0) {
      issues.push({
        check: "No memory limit",
        severity: "high",
        description: "Container has no memory limit configured.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      deploy:\n        resources:\n          limits:\n            memory: 512M\nCLI: docker run --memory 512m <image>"
      });
    }

    if ((inspect.HostConfig?.NanoCpus ?? 0) === 0) {
      issues.push({
        check: "No CPU limit",
        severity: "medium",
        description: "Container has no CPU limit configured.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      deploy:\n        resources:\n          limits:\n            cpus: '1.0'\nCLI: docker run --cpus 1.0 <image>"
      });
    }

    const restartPolicy = inspect.HostConfig?.RestartPolicy?.Name ?? "";
    if (!restartPolicy || restartPolicy === "no") {
      issues.push({
        check: "No restart policy",
        severity: "low",
        description: "Container does not have an automatic restart policy.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      restart: unless-stopped\nCLI: docker run --restart unless-stopped <image>"
      });
    }

    if (inspect.HostConfig?.Privileged === true) {
      issues.push({
        check: "Privileged mode",
        severity: "critical",
        description: "Container is running in privileged mode.",
        remediation:
          "docker-compose.yml:\n  services:\n    app:\n      privileged: false\nCLI: docker run --privileged=false <image>"
      });
    }

    const totalChecks = 6;
    const penalty = issues.reduce((sum, issue) => sum + severityPenalty[issue.severity], 0);
    const score = Math.max(0, 100 - penalty);
    const passedChecks = totalChecks - issues.length;

    const result: SecurityScanResult = {
      score,
      issues,
      totalChecks,
      passedChecks
    };

    await this.prisma.securityScan.create({
      data: {
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        score,
        issuesFound: issues,
        totalChecks,
        passedChecks,
        triggeredBy
      }
    });

    return result;
  }

  public async getScans(): Promise<unknown[]> {
    return this.prisma.securityScan.findMany({
      orderBy: { scannedAt: "desc" }
    });
  }

  public async getLatestScan(containerId: string): Promise<unknown | null> {
    return this.prisma.securityScan.findFirst({
      where: { containerId },
      orderBy: { scannedAt: "desc" }
    });
  }
}
