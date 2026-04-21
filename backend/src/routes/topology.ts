import { Router } from "express";
import multer from "multer";
import { DockerService, TopologyEdge, TopologyNode } from "../services/docker.service";

export const createTopologyRoutes = (dockerService: DockerService): Router => {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });

  router.post("/parse", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Missing docker-compose.yml file" });
        return;
      }

      const yamlString = req.file.buffer.toString("utf8");
      const topology = dockerService.parseComposeFile(yamlString);
      res.json(topology);
    } catch (error) {
      next(error);
    }
  });

  router.get("/live", async (_req, res, next) => {
    try {
      const containers = await dockerService.listContainers();
      const nodes: TopologyNode[] = [];
      const edges: TopologyEdge[] = [];

      for (const { inspect } of containers) {
        const metric = inspect.State.Running
          ? await dockerService.getContainerStats(inspect.Id)
          : {
              cpuPercent: 0,
              memoryMb: 0
            };

        const serviceNodeId = `svc:${inspect.Id.slice(0, 12)}`;
        nodes.push({
          id: serviceNodeId,
          type: "service",
          data: {
            name: inspect.Name.replace(/^\//, ""),
            image: inspect.Config.Image,
            status: inspect.State.Status,
            cpuPercent: metric.cpuPercent,
            memoryMb: metric.memoryMb
          }
        });

        for (const networkName of Object.keys(inspect.NetworkSettings?.Networks ?? {})) {
          const networkNodeId = `net:${networkName}`;
          if (!nodes.some((node) => node.id === networkNodeId)) {
            nodes.push({
              id: networkNodeId,
              type: "network",
              data: {
                name: networkName
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

        for (const mount of inspect.Mounts ?? []) {
          const volumeName = mount.Name ?? mount.Destination;
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

      res.json({ nodes, edges });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
