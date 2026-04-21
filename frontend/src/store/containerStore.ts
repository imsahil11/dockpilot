import { create } from "zustand";
import { ContainerMetricPoint, ContainerSummary } from "@/types";

interface RealtimeMetric {
  containerId: string;
  cpuPercent: number;
  memoryMb: number;
  networkInBytes: number;
  networkOutBytes: number;
  status: string;
}

interface ContainerState {
  containers: ContainerSummary[];
  selectedContainerId: string | null;
  statsHistory: Record<string, ContainerMetricPoint[]>;
  loading: boolean;
  daemonConnected: boolean;
  daemonError: string | null;
  setContainers: (containers: ContainerSummary[]) => void;
  selectContainer: (containerId: string) => void;
  applyStatsUpdate: (metrics: RealtimeMetric[]) => void;
  setLoading: (loading: boolean) => void;
  setDaemonConnected: (connected: boolean, error?: string | null) => void;
}

export const useContainerStore = create<ContainerState>((set, get) => ({
  containers: [],
  selectedContainerId: null,
  statsHistory: {},
  loading: false,
  daemonConnected: true,
  daemonError: null,

  setContainers: (containers) => {
    const currentSelected = get().selectedContainerId;
    const selectedExists = currentSelected
      ? containers.some((container) => container.id === currentSelected)
      : false;

    set({
      containers,
      selectedContainerId: selectedExists
        ? currentSelected
        : containers.length
          ? containers[0].id
          : null
    });
  },

  selectContainer: (containerId) => {
    set({ selectedContainerId: containerId });
  },

  applyStatsUpdate: (metrics) => {
    const state = get();
    const now = Date.now();

    const metricMap = new Map(metrics.map((metric) => [metric.containerId, metric]));
    let changed = false;
    const nextContainers = state.containers.map((container) => {
      const metric = metricMap.get(container.id);
      if (!metric) {
        return container;
      }

      const sameValues =
        container.state.status === metric.status &&
        container.state.running === (metric.status === "running") &&
        container.stats.cpuPercent === metric.cpuPercent &&
        container.stats.memoryMb === metric.memoryMb &&
        container.stats.networkInBytes === metric.networkInBytes &&
        container.stats.networkOutBytes === metric.networkOutBytes;

      if (sameValues) {
        return container;
      }

      changed = true;

      return {
        ...container,
        state: {
          ...container.state,
          status: metric.status,
          running: metric.status === "running"
        },
        stats: {
          cpuPercent: metric.cpuPercent,
          memoryMb: metric.memoryMb,
          networkInBytes: metric.networkInBytes,
          networkOutBytes: metric.networkOutBytes
        }
      };
    });

    const nextHistory = { ...state.statsHistory };
    for (const metric of metrics) {
      const current = nextHistory[metric.containerId] ?? [];
      const updated = [
        ...current,
        {
          timestamp: now,
          cpuPercent: metric.cpuPercent,
          memoryMb: metric.memoryMb,
          networkInBytes: metric.networkInBytes,
          networkOutBytes: metric.networkOutBytes
        }
      ];

      nextHistory[metric.containerId] = updated.slice(-150);
    }

    set({
      containers: changed ? nextContainers : state.containers,
      statsHistory: nextHistory,
      daemonConnected: true,
      daemonError: null
    });
  },

  setLoading: (loading) => {
    set({ loading });
  },

  setDaemonConnected: (connected, error = null) => {
    set({ daemonConnected: connected, daemonError: error });
  }
}));
