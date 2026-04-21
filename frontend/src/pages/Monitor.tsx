import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import toast from "react-hot-toast";
import { containersApi } from "@/api/containers";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useContainerStore } from "@/store/containerStore";

const windows: Record<string, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "30min": 1_800_000
};

const detectLevel = (line: string): "INFO" | "WARN" | "ERROR" => {
  const lowered = line.toLowerCase();
  if (lowered.includes("error") || lowered.includes("fatal")) {
    return "ERROR";
  }
  if (lowered.includes("warn")) {
    return "WARN";
  }
  return "INFO";
};

const MonitorPage = () => {
  const containers = useContainerStore((state) => state.containers);
  const selectedContainerId = useContainerStore((state) => state.selectedContainerId);
  const selectContainer = useContainerStore((state) => state.selectContainer);
  const history = useContainerStore((state) => state.statsHistory);

  const [timeWindow, setTimeWindow] = useState<"1min" | "5min" | "30min">("5min");
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"ALL" | "INFO" | "WARN" | "ERROR">("ALL");
  const [logScrollTop, setLogScrollTop] = useState(0);

  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedContainer = useMemo(
    () => containers.find((container) => container.id === selectedContainerId) ?? null,
    [containers, selectedContainerId]
  );

  useEffect(() => {
    if (!selectedContainerId && containers.length) {
      selectContainer(containers[0].id);
    }
  }, [containers, selectContainer, selectedContainerId]);

  useEffect(() => {
    if (!selectedContainerId) {
      return;
    }

    const loadLogs = async (): Promise<void> => {
      try {
        const text = await containersApi.getLogs(selectedContainerId, 300);
        setLogs(text.split("\n").filter(Boolean));
      } catch (_error) {
        toast.error("Failed to load logs");
      }
    };

    void loadLogs();
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 2_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedContainerId]);

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) {
      return;
    }
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [autoScroll, logs]);

  const now = Date.now();
  const chartData = (history[selectedContainerId ?? ""] ?? [])
    .filter((point) => now - point.timestamp <= windows[timeWindow])
    .map((point) => ({
      time: format(point.timestamp, "HH:mm:ss"),
      cpu: Number(point.cpuPercent.toFixed(2)),
      memory: Number(point.memoryMb.toFixed(2)),
      netIn: Number((point.networkInBytes / 1024).toFixed(2)),
      netOut: Number((point.networkOutBytes / 1024).toFixed(2))
    }));

  const filteredLogs = useMemo(() => {
    let regex: RegExp | null = null;
    if (search.trim()) {
      try {
        regex = new RegExp(search, "i");
      } catch (_error) {
        regex = null;
      }
    }

    return logs
      .map((line) => ({ line, level: detectLevel(line) }))
      .filter((entry) => (severity === "ALL" ? true : entry.level === severity))
      .filter((entry) => (regex ? regex.test(entry.line) : true));
  }, [logs, search, severity]);

  const lineHeight = 20;
  const viewportHeight = 300;
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + 10;
  const startIndex = Math.max(0, Math.floor(logScrollTop / lineHeight) - 5);
  const visibleLogs = filteredLogs.slice(startIndex, startIndex + visibleCount);
  const topSpacerHeight = startIndex * lineHeight;
  const bottomSpacerHeight = Math.max(
    0,
    (filteredLogs.length - (startIndex + visibleLogs.length)) * lineHeight
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {containers.map((container) => (
          <button
            key={container.id}
            className={`rounded-lg border px-3 py-2 text-sm whitespace-nowrap ${
              container.id === selectedContainerId
                ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                : "border-[#2a2a4a] bg-[#161625] text-[#a0a0c0]"
            }`}
            onClick={() => selectContainer(container.id)}
          >
            {container.name}
          </button>
        ))}
      </div>

      {selectedContainer ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">{selectedContainer.name}</h2>
            <Badge tone={selectedContainer.state.running ? "running" : "stopped"}>
              {selectedContainer.state.status}
            </Badge>
            <span className="text-xs text-[#a0a0c0]">Image: {selectedContainer.image}</span>
            <span className="text-xs text-[#a0a0c0]">
              Restart Count: {selectedContainer.state.restartCount ?? 0}
            </span>
            <span className="text-xs text-[#a0a0c0]">Last Exit Code: {selectedContainer.state.exitCode ?? 0}</span>
          </div>
        </Card>
      ) : null}

      <div className="flex gap-2">
        {(Object.keys(windows) as Array<"1min" | "5min" | "30min">).map((windowKey) => (
          <Button
            key={windowKey}
            variant={windowKey === timeWindow ? "primary" : "secondary"}
            onClick={() => setTimeWindow(windowKey)}
          >
            {windowKey}
          </Button>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">CPU %</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1f1f34" strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#606080" />
              <YAxis stroke="#606080" domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="cpu" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Memory MB</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1f1f34" strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#606080" />
              <YAxis stroke="#606080" />
              <Tooltip />
              <Line type="monotone" dataKey="memory" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Network I/O (KB)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1f1f34" strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#606080" />
              <YAxis stroke="#606080" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="netIn" name="In" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="netOut" name="Out" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Live Logs</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="Search (regex)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
            />
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as "ALL" | "INFO" | "WARN" | "ERROR")}
              className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">ALL</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>
            <Button variant="ghost" onClick={() => setAutoScroll((value) => !value)}>
              Auto-scroll: {autoScroll ? "On" : "Off"}
            </Button>
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="h-[300px] overflow-auto rounded-lg border border-[#2a2a4a] bg-[#050508] p-3 font-mono text-xs"
          onScroll={(event) => setLogScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: topSpacerHeight }} />
          {visibleLogs.map((entry, index) => (
            <div
              key={`${startIndex + index}-${entry.line.slice(0, 16)}`}
              className="mb-1 whitespace-pre-wrap"
              style={{ height: lineHeight }}
            >
              <span className="text-[#606080]">[{format(new Date(), "HH:mm:ss")}] </span>
              <span
                className={
                  entry.level === "ERROR"
                    ? "text-red-400"
                    : entry.level === "WARN"
                      ? "text-amber-400"
                      : "text-blue-300"
                }
              >
                {entry.level}
              </span>
              <span className="text-[#d7d7f7]"> {entry.line}</span>
            </div>
          ))}
          <div style={{ height: bottomSpacerHeight }} />
        </div>
      </Card>
    </div>
  );
};

export default MonitorPage;
