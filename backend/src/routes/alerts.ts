import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { AlertService } from "../services/alert.service";

export const createAlertRoutes = (prisma: PrismaClient, alertService: AlertService): Router => {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const resolvedFilter = req.query.resolved as string | undefined;
      const containerFilter = req.query.container as string | undefined;

      const alerts = await prisma.alert.findMany({
        where: {
          resolved:
            resolvedFilter === undefined
              ? undefined
              : resolvedFilter === "true"
                ? true
                : false,
          containerName: containerFilter
            ? {
                contains: containerFilter,
                mode: "insensitive"
              }
            : undefined
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      res.json(alerts);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/resolve", async (req, res, next) => {
    try {
      const alertId = Number(req.params.id);
      const alert = await prisma.alert.findUnique({ where: { id: alertId } });
      if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }

      await alertService.resolveAlert(alert.containerId, alert.alertType);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
