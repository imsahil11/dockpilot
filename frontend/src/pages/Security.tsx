import { Copy, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { containersApi } from "@/api/containers";
import { securityApi } from "@/api/security";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useContainerStore } from "@/store/containerStore";
import { useSocketStore } from "@/store/socketStore";
import { SecurityScan } from "@/types";

const scoreColor = (score: number): string => {
  if (score < 50) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#10b981";
};

const SecurityPage = () => {
  const containers = useContainerStore((state) => state.containers);
  const setContainers = useContainerStore((state) => state.setContainers);
  const socket = useSocketStore((state) => state.socket);
  const connectSocket = useSocketStore((state) => state.connect);

  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<SecurityScan | null>(null);
  const [loading, setLoading] = useState(true);

  const loadScans = async (): Promise<void> => {
    setLoading(true);
    try {
      const [scanData, containerData] = await Promise.all([securityApi.list(), containersApi.list()]);
      setScans(scanData);
      setContainers(containerData);
    } catch (_error) {
      toast.error("Failed to load security scans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadScans();
  }, []);

  useEffect(() => {
    const active = socket ?? connectSocket();
    const onContainerEvent = async (payload: { action: string; id?: string; attributes?: { name?: string } }) => {
      if (payload.action !== "start") {
        return;
      }

      const matching = containers.find((container) => container.name === payload.attributes?.name);
      if (matching) {
        await securityApi.scan(matching.id);
        toast("Security issue found", { icon: "⚠" });
        await loadScans();
      }
    };

    active.on("container.event", onContainerEvent);
    return () => {
      active.off("container.event", onContainerEvent);
    };
  }, [connectSocket, containers, socket]);

  const latestByContainer = useMemo(() => {
    const map = new Map<string, SecurityScan>();
    for (const scan of scans) {
      if (!map.has(scan.containerId)) {
        map.set(scan.containerId, scan);
      }
    }
    return map;
  }, [scans]);

  const fleetScore = useMemo(() => {
    const allLatest = Array.from(latestByContainer.values());
    if (!allLatest.length) return 100;
    return Math.round(allLatest.reduce((sum, scan) => sum + scan.score, 0) / allLatest.length);
  }, [latestByContainer]);

  const severityCount = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const scan of latestByContainer.values()) {
      for (const issue of scan.issuesFound) {
        counts[issue.severity] += 1;
      }
    }
    return counts;
  }, [latestByContainer]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 120" className="h-28 w-28">
              <circle cx="60" cy="60" r="50" stroke="#2a2a4a" strokeWidth="10" fill="none" />
              <circle
                cx="60"
                cy="60"
                r="50"
                stroke={scoreColor(fleetScore)}
                strokeWidth="10"
                fill="none"
                strokeDasharray={`${(fleetScore / 100) * 314} 314`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="62" textAnchor="middle" className="fill-white text-lg font-semibold">
                {fleetScore}
              </text>
            </svg>
            <div>
              <p className="text-sm text-[#a0a0c0]">Overall Fleet Security Score</p>
              <p className="mt-2 text-xl font-semibold text-white">{fleetScore}/100</p>
              <p className="mt-1 text-xs text-[#606080]">Auto-updated on manual scans and container starts</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Issues by Severity</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(severityCount).map(([severity, count]) => (
              <div key={severity} className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] p-3">
                <p className="text-xs uppercase text-[#606080]">{severity}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{count}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52 w-full" />)
          : containers.map((container) => {
              const scan = latestByContainer.get(container.id);
              return (
                <Card key={container.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{container.name}</p>
                      <p className="text-xs text-[#a0a0c0]">{container.image}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-indigo-300" />
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] p-3">
                    <span className="text-xs text-[#a0a0c0]">Security Score</span>
                    <span className="text-lg font-semibold" style={{ color: scoreColor(scan?.score ?? 0) }}>
                      {scan?.score ?? "--"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="critical">C {scan?.issuesFound.filter((issue) => issue.severity === "critical").length ?? 0}</Badge>
                    <Badge tone="warning">H {scan?.issuesFound.filter((issue) => issue.severity === "high").length ?? 0}</Badge>
                    <Badge tone="info">M {scan?.issuesFound.filter((issue) => issue.severity === "medium").length ?? 0}</Badge>
                    <Badge tone="running">L {scan?.issuesFound.filter((issue) => issue.severity === "low").length ?? 0}</Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        await securityApi.scan(container.id);
                        toast.success("Scan complete");
                        await loadScans();
                      }}
                    >
                      Scan Now
                    </Button>
                    <Button variant="primary" onClick={() => setSelectedScan(scan ?? null)}>
                      View Details
                    </Button>
                  </div>
                </Card>
              );
            })}
      </div>

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-lg border-l border-[#2a2a4a] bg-[#0f0f1a] p-4 transition-transform duration-300 ${
          selectedScan ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedScan ? (
          <div className="space-y-4 overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{selectedScan.containerName} Findings</h3>
              <Button variant="ghost" onClick={() => setSelectedScan(null)}>
                Close
              </Button>
            </div>

            {selectedScan.issuesFound.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-emerald-300">No security issues found.</p>
              </Card>
            ) : (
              selectedScan.issuesFound.map((issue, index) => (
                <Card key={`${issue.check}-${index}`} className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{issue.check}</p>
                    <Badge tone={issue.severity === "critical" ? "critical" : "warning"}>{issue.severity}</Badge>
                  </div>
                  <p className="text-sm text-[#a0a0c0]">{issue.description}</p>
                  <pre className="overflow-auto rounded-lg border border-[#2a2a4a] bg-[#161625] p-3 font-mono text-xs text-[#cfcff1]">
                    {issue.remediation}
                  </pre>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(issue.remediation);
                      toast.success("Copied remediation");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy Fix Command
                  </Button>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
};

export default SecurityPage;
