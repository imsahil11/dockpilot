import { create } from "zustand";
import { AlertRecord } from "@/types";

interface AlertState {
  alerts: AlertRecord[];
  unresolvedCount: number;
  setAlerts: (alerts: AlertRecord[]) => void;
  addAlert: (alert: AlertRecord) => void;
  resolveAlert: (id: number) => void;
}

const unresolvedCountOf = (alerts: AlertRecord[]): number => alerts.filter((alert) => !alert.resolved).length;

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unresolvedCount: 0,

  setAlerts: (alerts) => {
    set({ alerts, unresolvedCount: unresolvedCountOf(alerts) });
  },

  addAlert: (alert) => {
    const alerts = [alert, ...get().alerts].slice(0, 500);
    set({ alerts, unresolvedCount: unresolvedCountOf(alerts) });
  },

  resolveAlert: (id) => {
    const alerts = get().alerts.map((alert) =>
      alert.id === id ? { ...alert, resolved: true, resolvedAt: new Date().toISOString() } : alert
    );
    set({ alerts, unresolvedCount: unresolvedCountOf(alerts) });
  }
}));
