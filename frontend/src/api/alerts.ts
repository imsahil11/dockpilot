import api from "./axios";
import { AlertRecord } from "@/types";

export const alertsApi = {
  async list(filters?: { resolved?: boolean; container?: string }): Promise<AlertRecord[]> {
    const { data } = await api.get<AlertRecord[]>("/alerts", { params: filters });
    return data;
  },

  async resolve(id: number): Promise<void> {
    await api.post(`/alerts/${id}/resolve`);
  }
};
