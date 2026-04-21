import { useEffect } from "react";
import toast from "react-hot-toast";
import { alertsApi } from "@/api/alerts";
import { containersApi } from "@/api/containers";
import { useAlertStore } from "@/store/alertStore";
import { useContainerStore } from "@/store/containerStore";
import { useSocketStore } from "@/store/socketStore";
import { AlertRecord, ContainerSummary } from "@/types";

const toastStyle = {
  background: "#161625",
  border: "1px solid #2a2a4a",
  color: "#ffffff"
};

export const useRealtime = (): void => {
  const socket = useSocketStore((state) => state.socket);
  const connect = useSocketStore((state) => state.connect);
  const setContainers = useContainerStore((state) => state.setContainers);
  const applyStatsUpdate = useContainerStore((state) => state.applyStatsUpdate);
  const setDaemonConnected = useContainerStore((state) => state.setDaemonConnected);
  const setAlerts = useAlertStore((state) => state.setAlerts);
  const addAlert = useAlertStore((state) => state.addAlert);
  const resolveAlert = useAlertStore((state) => state.resolveAlert);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async (): Promise<void> => {
      try {
        const [containers, alerts] = await Promise.all([containersApi.list(), alertsApi.list()]);
        if (!mounted) {
          return;
        }
        setContainers(containers as ContainerSummary[]);
        setAlerts(alerts as AlertRecord[]);
        setDaemonConnected(true);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setDaemonConnected(false, "Docker daemon unavailable");
      }
    };

    void bootstrap();

    const active = socket ?? connect();

    const onStats = (metrics: Array<{
      containerId: string;
      cpuPercent: number;
      memoryMb: number;
      networkInBytes: number;
      networkOutBytes: number;
      status: string;
    }>) => {
      applyStatsUpdate(metrics);
    };

    const onAlertNew = (alert: AlertRecord) => {
      addAlert(alert);
      if (alert.alertType === "crash") {
        toast.error(`Container crashed: ${alert.containerName}`, { style: toastStyle });
      } else if (alert.alertType === "cpu_high" || alert.alertType === "memory_high") {
        toast(`Security issue found: ${alert.containerName}`, {
          icon: "⚠",
          style: toastStyle
        });
      }
    };

    const onAlertResolved = (payload: { id?: number; alertType: string; containerId: string }) => {
      if (typeof payload.id === "number") {
        resolveAlert(payload.id);
      }
      if (payload.alertType === "crash") {
        toast.success("Container recovered", { style: toastStyle });
      }
    };

    const onContainerEvent = (payload: { action: string; attributes?: { name?: string } }) => {
      const name = payload.attributes?.name ?? "container";
      if (payload.action === "die") {
        toast.error(`${name} exited unexpectedly`, { style: toastStyle });
      }
      if (payload.action === "start") {
        toast.success(`${name} started`, { style: toastStyle });
      }
      void containersApi.list().then((containers) => setContainers(containers));
    };

    const onDockerError = () => {
      setDaemonConnected(false, "Docker daemon disconnected");
    };

    active.on("stats.update", onStats);
    active.on("alert.new", onAlertNew);
    active.on("alert.resolved", onAlertResolved);
    active.on("container.event", onContainerEvent);
    active.on("docker.error", onDockerError);
    active.on("connect", () => {
      setDaemonConnected(true, null);
    });
    active.on("disconnect", () => {
      setDaemonConnected(false, "Socket disconnected");
    });

    const retryInterval = window.setInterval(async () => {
      const connected = useContainerStore.getState().daemonConnected;
      if (connected) {
        return;
      }

      try {
        const [containers, alerts] = await Promise.all([containersApi.list(), alertsApi.list()]);
        setContainers(containers);
        setAlerts(alerts);
        setDaemonConnected(true, null);
      } catch (_error) {
        setDaemonConnected(false, "Retrying Docker connection...");
      }
    }, 10_000);

    return () => {
      mounted = false;
      active.off("stats.update", onStats);
      active.off("alert.new", onAlertNew);
      active.off("alert.resolved", onAlertResolved);
      active.off("container.event", onContainerEvent);
      active.off("docker.error", onDockerError);
      window.clearInterval(retryInterval);
    };
  }, [addAlert, applyStatsUpdate, connect, resolveAlert, setAlerts, setContainers, setDaemonConnected, socket]);
};
