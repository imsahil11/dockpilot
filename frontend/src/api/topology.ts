import api from "./axios";
import { TopologyEdge, TopologyNode } from "@/types";

export interface TopologyResponse {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export const topologyApi = {
  async parse(file: File): Promise<TopologyResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<TopologyResponse>("/topology/parse", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return data;
  },

  async live(): Promise<TopologyResponse> {
    const { data } = await api.get<TopologyResponse>("/topology/live");
    return data;
  }
};
