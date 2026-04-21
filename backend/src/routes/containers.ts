import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { DeploymentService } from "../services/deployment.service";
import { DockerService } from "../services/docker.service";

export const createContainerRoutes = (
  prisma: PrismaClient,
  dockerService: DockerService,
  deploymentService: DeploymentService
): Router => {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const containers = await dockerService.listContainers();
      const stats = await Promise.all(
        containers.map(async ({ inspect }) => {
          if (!inspect.State.Running) {
            return {
              containerId: inspect.Id,
              cpuPercent: 0,
              memoryMb: 0,
              networkInBytes: 0,
              networkOutBytes: 0
            };
          }

          const containerStats = await dockerService.getContainerStats(inspect.Id);
          return {
            containerId: inspect.Id,
            cpuPercent: containerStats.cpuPercent,
            memoryMb: containerStats.memoryMb,
            networkInBytes: containerStats.networkInBytes,
            networkOutBytes: containerStats.networkOutBytes
          };
        })
      );

      const statsById = new Map(stats.map((entry) => [entry.containerId, entry]));
      res.json(
        containers.map(({ summary, inspect }) => ({
          id: inspect.Id,
          name: inspect.Name.replace(/^\//, ""),
          image: inspect.Config.Image,
          state: inspect.State,
          status: summary.Status,
          created: inspect.Created,
          stats: statsById.get(inspect.Id) ?? {
            cpuPercent: 0,
            memoryMb: 0,
            networkInBytes: 0,
            networkOutBytes: 0
          }
        }))
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const inspect = await dockerService.getClient().getContainer(id).inspect();
      const recentStats = await prisma.containerSnapshot.findMany({
        where: {
          containerId: inspect.Id
        },
        orderBy: {
          recordedAt: "desc"
        },
        take: 150
      });

      res.json({
        inspect,
        recentStats: recentStats.map((snapshot) => ({
          ...snapshot,
          networkInBytes: snapshot.networkInBytes.toString(),
          networkOutBytes: snapshot.networkOutBytes.toString()
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/logs", async (req, res, next) => {
    try {
      const { id } = req.params;
      const tail = Number(req.query.tail ?? 100);
      const logs = await dockerService.getContainerLogs(id, tail);
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/start", async (req, res, next) => {
    try {
      const { id } = req.params;
      const inspect = await dockerService.getClient().getContainer(id).inspect();
      await dockerService.startContainer(id);
      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        imageVersion: inspect.Config.Image,
        action: "start",
        outcome: "success",
        triggeredBy: req.user?.id,
        triggeredSource: "user"
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/stop", async (req, res, next) => {
    try {
      const { id } = req.params;
      const inspect = await dockerService.getClient().getContainer(id).inspect();
      await dockerService.stopContainer(id);
      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        imageVersion: inspect.Config.Image,
        action: "stop",
        outcome: "success",
        triggeredBy: req.user?.id,
        triggeredSource: "user"
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/restart", async (req, res, next) => {
    try {
      const { id } = req.params;
      const inspect = await dockerService.getClient().getContainer(id).inspect();
      await dockerService.restartContainer(id);
      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        imageVersion: inspect.Config.Image,
        action: "restart",
        outcome: "success",
        triggeredBy: req.user?.id,
        triggeredSource: "user"
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const confirm = req.query.confirm === "true";
      if (!confirm) {
        res.status(400).json({ error: "Missing confirmation flag (confirm=true)" });
        return;
      }

      const inspect = await dockerService.getClient().getContainer(id).inspect();
      await dockerService.removeContainer(id);
      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        imageVersion: inspect.Config.Image,
        action: "stop",
        outcome: "success",
        triggeredBy: req.user?.id,
        triggeredSource: "user",
        notes: "Container removed"
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/exec", async (req, res, next) => {
    try {
      const { id } = req.params;
      const commandInput = (req.body as { command?: string | string[] }).command;
      if (!commandInput || (typeof commandInput === "string" && !commandInput.trim())) {
        res.status(400).json({ error: "Command is required" });
        return;
      }

      const cmd = Array.isArray(commandInput)
        ? commandInput
        : commandInput.trim().split(/\s+/);

      const inspect = await dockerService.getClient().getContainer(id).inspect();
      const result = await dockerService.execInContainer(id, cmd);

      await deploymentService.logEvent({
        containerId: inspect.Id,
        containerName: inspect.Name.replace(/^\//, ""),
        imageVersion: inspect.Config.Image,
        action: "exec",
        outcome: result.exitCode === 0 ? "success" : "failure",
        triggeredBy: req.user?.id,
        triggeredSource: "user",
        notes: `Executed command: ${cmd.join(" ")}`
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
