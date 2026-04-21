export interface User {
  id: number;
  username: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ContainerRuntimeState {
  status: string;
  running: boolean;
  startedAt?: string;
  restartCount?: number;
  exitCode?: number;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryMb: number;
  networkInBytes: number;
  networkOutBytes: number;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  state: ContainerRuntimeState;
  stats: ContainerStats;
  created: string;
}

export interface ContainerMetricPoint {
  timestamp: number;
  cpuPercent: number;
  memoryMb: number;
  networkInBytes: number;
  networkOutBytes: number;
}

export interface AlertRecord {
  id: number;
  containerId: string;
  containerName: string;
  alertType: "crash" | "cpu_high" | "memory_high" | "unhealthy" | string;
  severity: "critical" | "high" | "medium" | "low";
  thresholdValue?: number | null;
  actualValue?: number | null;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface DeploymentLogRecord {
  id: number;
  containerId: string;
  containerName: string;
  imageVersion: string;
  imageDigest?: string | null;
  action: "start" | "stop" | "restart" | "crash" | "rollback" | "exec" | string;
  outcome: "success" | "failure";
  triggeredBy?: number | null;
  triggeredSource: "user" | "ai_agent" | "system" | "alert" | string;
  notes?: string | null;
  createdAt: string;
  user?: User;
}

export interface HistoryResponse {
  items: DeploymentLogRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SecurityIssue {
  check: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  remediation: string;
}

export interface SecurityScan {
  id: number;
  containerId: string;
  containerName: string;
  score: number;
  issuesFound: SecurityIssue[];
  totalChecks: number;
  passedChecks: number;
  scannedAt: string;
  triggeredBy?: number | null;
}

export interface TopologyNodeData {
  name: string;
  image?: string;
  status?: string;
  cpuPercent?: number;
  memoryMb?: number;
}

export interface TopologyNode {
  id: string;
  type: string;
  data: TopologyNodeData;
  position?: { x: number; y: number };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: "LEARN" | "SUGGEST" | "EXECUTE";
  command?: string | null;
  pending?: boolean;
  createdAt: number;
}
