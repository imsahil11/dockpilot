import api from "./axios";
import { SecurityScan } from "@/types";

export const securityApi = {
  async list(): Promise<SecurityScan[]> {
    const { data } = await api.get<SecurityScan[]>("/security/scans");
    return data;
  },

  async latest(containerId: string): Promise<SecurityScan> {
    const { data } = await api.get<SecurityScan>(`/security/scans/${containerId}`);
    return data;
  },

  async scan(containerId: string): Promise<{
    score: number;
    issues: Array<{
      check: string;
      severity: "critical" | "high" | "medium" | "low";
      description: string;
      remediation: string;
    }>;
    totalChecks: number;
    passedChecks: number;
  }> {
    const { data } = await api.post(`/security/scan/${containerId}`);
    return data;
  }
};
