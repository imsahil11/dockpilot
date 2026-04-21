import {
  AlertTriangle,
  PlayCircle,
  Rocket,
  ShieldAlert,
  Sparkles,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { historyApi } from "@/api/history";
import { securityApi } from "@/api/security";
import { QuickActionCard } from "@/components/features/QuickActionCard";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAlertStore } from "@/store/alertStore";
import { useContainerStore } from "@/store/containerStore";
import { DeploymentLogRecord, SecurityScan } from "@/types";

const DashboardPage = () => {
  const navigate = useNavigate();
  const containers = useContainerStore((state) => state.containers);
  const alerts = useAlertStore((state) => state.alerts);

  const [history, setHistory] = useState<DeploymentLogRecord[]>([]);
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const [historyResponse, securityScans] = await Promise.all([
          historyApi.list({ page: 1, pageSize: 50 }),
          securityApi.list()
        ]);
        setHistory(historyResponse.items);
        setScans(securityScans);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const runningCount = containers.filter((container) => container.state.running).length;
  const activeAlerts = alerts.filter((alert) => !alert.resolved);
  const criticalIssues = scans.reduce((total, scan) => {
    return total + scan.issuesFound.filter((issue) => issue.severity === "critical").length;
  }, 0);

  const topCpuContainers = useMemo(
    () => [...containers].sort((a, b) => b.stats.cpuPercent - a.stats.cpuPercent).slice(0, 5),
    [containers]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-[#a0a0c0]">Total Containers</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-semibold text-white">{containers.length}</p>
            <span className="text-xs text-[#a0a0c0]">+0 vs yesterday</span>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[#a0a0c0]">Running Containers</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-400">{runningCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[#a0a0c0]">Active Alerts</p>
          <p className={`mt-2 text-3xl font-semibold ${activeAlerts.length > 0 ? "text-red-400" : "text-white"}`}>
            {activeAlerts.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[#a0a0c0]">Security Issues</p>
          <p className={`mt-2 text-3xl font-semibold ${criticalIssues > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {criticalIssues}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="border-b border-[#2a2a4a] px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Real-time Activity Feed</h2>
          </div>
          <div className="max-h-[420px] space-y-3 overflow-auto p-4">
            {loading
              ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)
              : history.slice(0, 10).map((event) => (
                  <div key={event.id} className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {event.action === "crash" ? (
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        ) : event.action === "rollback" ? (
                          <Rocket className="h-4 w-4 text-indigo-400" />
                        ) : event.action === "exec" ? (
                          <TerminalSquare className="h-4 w-4 text-cyan-400" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-emerald-400" />
                        )}
                        <span className="text-sm text-white">
                          {event.containerName} <span className="text-[#a0a0c0]">{event.action}</span>
                        </span>
                      </div>
                      <span className="text-xs text-[#606080]">
                        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-white">Top 5 Containers by CPU</h3>
            <div className="mt-4 space-y-3">
              {topCpuContainers.map((container) => (
                <div key={container.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate text-[#a0a0c0]">{container.name}</span>
                    <span className="font-mono text-cyan-300">{container.stats.cpuPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#0f0f1a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                      style={{ width: `${Math.min(100, container.stats.cpuPercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-white">Recent Alerts</h3>
            <div className="mt-3 space-y-2">
              {activeAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between rounded-lg border border-[#2a2a4a] p-2">
                  <div>
                    <p className="text-sm text-white">{alert.containerName}</p>
                    <p className="text-xs text-[#a0a0c0]">{alert.alertType.replace("_", " ")}</p>
                  </div>
                  <Badge tone={alert.severity === "critical" ? "critical" : "warning"}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickActionCard
          icon={PlayCircle}
          title="Start Container"
          description="Jump to monitor and launch stopped services"
          onClick={() => navigate("/monitor")}
        />
        <QuickActionCard
          icon={ShieldAlert}
          title="Run Security Scan"
          description="Audit container hardening baseline"
          onClick={() => navigate("/security")}
        />
        <QuickActionCard
          icon={Sparkles}
          title="Open AI Agent"
          description="Diagnose issues with context-aware suggestions"
          onClick={() => navigate("/ai-chat")}
        />
        <QuickActionCard
          icon={AlertTriangle}
          title="View All Alerts"
          description="Inspect unresolved incidents and recoveries"
          onClick={() => navigate("/history")}
        />
      </div>
    </div>
  );
};

export default DashboardPage;
