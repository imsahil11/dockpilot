import { Router } from "express";
import { DeploymentService } from "../services/deployment.service";

export const createHistoryRoutes = (deploymentService: DeploymentService): Router => {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const history = await deploymentService.getHistory({
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        container: req.query.container as string | undefined,
        action: req.query.action as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        outcome: req.query.outcome as string | undefined
      });
      res.json(history);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/rollback", async (req, res, next) => {
    try {
      const logId = Number(req.params.id);
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const result = await deploymentService.rollback(logId, userId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
