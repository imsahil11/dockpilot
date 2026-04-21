import { Router } from "express";
import { SecurityService } from "../services/security.service";

export const createSecurityRoutes = (securityService: SecurityService): Router => {
  const router = Router();

  router.get("/scans", async (_req, res, next) => {
    try {
      const scans = await securityService.getScans();
      res.json(scans);
    } catch (error) {
      next(error);
    }
  });

  router.get("/scans/:containerId", async (req, res, next) => {
    try {
      const latest = await securityService.getLatestScan(req.params.containerId);
      if (!latest) {
        res.status(404).json({ error: "No scan found for container" });
        return;
      }
      res.json(latest);
    } catch (error) {
      next(error);
    }
  });

  router.post("/scan/:containerId", async (req, res, next) => {
    try {
      const result = await securityService.scanContainer(req.params.containerId, req.user?.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
