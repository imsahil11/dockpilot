import api from "./axios";
import { ContainerMetricPoint, ContainerSummary } from "@/types";

export interface ContainerDetailResponse {
  inspect: Record<string, unknown>;
  recentStats: Array<ContainerMetricPoint & { networkInBytes: string; networkOutBytes: string }>;
}

export const containersApi = {
  async list(): Promise<ContainerSummary[]> {
    const { data } = await api.get<ContainerSummary[]>("/containers");
    return data;
  },

  async getById(id: string): Promise<ContainerDetailResponse> {
    const { data } = await api.get<ContainerDetailResponse>(`/containers/${id}`);
    return data;
  },

  async getLogs(id: string, tail = 100): Promise<string> {
    const { data } = await api.get<{ logs: string }>(`/containers/${id}/logs`, {
      params: { tail }
    });
    return data.logs;
  },

  async start(id: string): Promise<void> {
    await api.post(`/containers/${id}/start`);
  },

  async stop(id: string): Promise<void> {
    await api.post(`/containers/${id}/stop`);
  },

  async restart(id: string): Promise<void> {
    await api.post(`/containers/${id}/restart`);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/containers/${id}`, { params: { confirm: true } });
  },

  async exec(id: string, command: string): Promise<{ output: string; exitCode: number | null }> {
    const { data } = await api.post<{ output: string; exitCode: number | null }>(
      `/containers/${id}/exec`,
      { command }
    );
    return data;
  },

  async deploy(composeYaml: string): Promise<{ ok: boolean; output: string }> {
    const { data } = await api.post<{ ok: boolean; output: string }>("/containers/deploy", {
      composeYaml
    });
    return data;
  }
};
