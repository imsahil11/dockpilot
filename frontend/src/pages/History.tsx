import {
  AlertTriangle,
  CornerUpLeft,
  Play,
  RotateCw,
  StopCircle,
  Terminal,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { historyApi } from "@/api/history";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useContainerStore } from "@/store/containerStore";
import { DeploymentLogRecord } from "@/types";

const actionIcon = (action: string) => {
  if (action === "start") return <Play className="h-4 w-4 text-emerald-400" />;
  if (action === "stop") return <StopCircle className="h-4 w-4 text-amber-400" />;
  if (action === "restart") return <RotateCw className="h-4 w-4 text-cyan-400" />;
  if (action === "crash") return <AlertTriangle className="h-4 w-4 text-red-400" />;
  if (action === "rollback") return <CornerUpLeft className="h-4 w-4 text-indigo-300" />;
  return <Terminal className="h-4 w-4 text-[#a0a0c0]" />;
};

const HistoryPage = () => {
  const containers = useContainerStore((state) => state.containers);

  const [records, setRecords] = useState<DeploymentLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DeploymentLogRecord | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const [container, setContainer] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await historyApi.list({
        page: 1,
        pageSize: 100,
        container: container || undefined,
        action: action || undefined,
        outcome: outcome || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      setRecords(response.items);
    } catch (_error) {
      toast.error("Failed to load deployment history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={container}
            onChange={(event) => setContainer(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          >
            <option value="">All Containers</option>
            {containers.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          >
            <option value="">All Actions</option>
            <option value="start">start</option>
            <option value="stop">stop</option>
            <option value="restart">restart</option>
            <option value="crash">crash</option>
            <option value="rollback">rollback</option>
            <option value="exec">exec</option>
          </select>

          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          />

          <input
            type="datetime-local"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          />

          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          >
            <option value="">All Outcomes</option>
            <option value="success">success</option>
            <option value="failure">failure</option>
          </select>
        </div>

        <div className="mt-3">
          <Button onClick={() => void load()}>Apply Filters</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#0f0f1a] text-[#a0a0c0]">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Container</th>
                <th className="px-4 py-3">Image Version</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Triggered By</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={7} className="px-4 py-2">
                        <Skeleton className="h-10 w-full" />
                      </td>
                    </tr>
                  ))
                : records.map((record) => (
                    <>
                      <tr
                        key={record.id}
                        className="cursor-pointer border-t border-[#2a2a4a] hover:bg-[#1e1e35]/50"
                        onClick={() => setExpandedRow((value) => (value === record.id ? null : record.id))}
                      >
                        <td className="px-4 py-3 text-[#a0a0c0]">{new Date(record.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-white">{record.containerName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#c6c6ef]">{record.imageVersion}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-white">
                            {actionIcon(record.action)}
                            {record.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs ${
                              record.outcome === "success"
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                : "border-red-500/20 bg-red-500/10 text-red-300"
                            }`}
                          >
                            {record.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#a0a0c0]">{record.triggeredSource}</td>
                        <td className="px-4 py-3 text-[#a0a0c0]">{record.notes ?? "-"}</td>
                      </tr>

                      {expandedRow === record.id ? (
                        <tr className="border-t border-[#2a2a4a] bg-[#0f0f1a]">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm text-white">Full event details</p>
                                <p className="text-xs text-[#a0a0c0]">{record.notes ?? "No notes provided"}</p>
                              </div>
                              <Button variant="danger" onClick={() => setRollbackTarget(record)}>
                                Roll Back to This Version
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {rollbackTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-white">Confirm Rollback</h3>
              <button onClick={() => setRollbackTarget(null)}>
                <XCircle className="h-5 w-5 text-[#a0a0c0]" />
              </button>
            </div>

            <p className="mt-3 text-sm text-[#a0a0c0]">
              This action will redeploy image version <span className="font-mono text-white">{rollbackTarget.imageVersion}</span>.
            </p>
            <p className="mt-2 text-xs text-amber-300">Warning: rollback may cause brief downtime.</p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRollbackTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={rollbackLoading}
                onClick={async () => {
                  setRollbackLoading(true);
                  try {
                    await historyApi.rollback(rollbackTarget.id);
                    toast.success("Rollback executed");
                    setRollbackTarget(null);
                    await load();
                  } catch (_error) {
                    toast.error("Rollback failed");
                  } finally {
                    setRollbackLoading(false);
                  }
                }}
              >
                Confirm Rollback
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default HistoryPage;
