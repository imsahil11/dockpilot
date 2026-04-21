import api from "./axios";
import { HistoryResponse } from "@/types";

export interface HistoryFilters {
  page?: number;
  pageSize?: number;
  container?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: string;
}

export const historyApi = {
  async list(filters: HistoryFilters): Promise<HistoryResponse> {
    const { data } = await api.get<HistoryResponse>("/history", { params: filters });
    return data;
  },

  async rollback(id: number): Promise<{ ok: boolean; newContainerId: string; imageVersion: string }> {
    const { data } = await api.post<{ ok: boolean; newContainerId: string; imageVersion: string }>(
      `/history/${id}/rollback`
    );
    return data;
  }
};
