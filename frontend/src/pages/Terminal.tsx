import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import toast from "react-hot-toast";
import type { FitAddon } from "xterm-addon-fit";
import type { Terminal as XTerminal } from "xterm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import { useContainerStore } from "@/store/containerStore";
import "xterm/css/xterm.css";

const TerminalPage = () => {
  const token = useAuthStore((state) => state.token);
  const containers = useContainerStore((state) => state.containers);
  const selectedFromStore = useContainerStore((state) => state.selectedContainerId);

  const runningContainers = useMemo(
    () => containers.filter((container) => container.state.running),
    [containers]
  );

  const [selectedContainerId, setSelectedContainerId] = useState<string>(selectedFromStore ?? "");
  const [connected, setConnected] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [duration, setDuration] = useState("00:00");

  const hostRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<{
    term: XTerminal;
    fitAddon: FitAddon;
    dataSubscription: { dispose: () => void };
    onResize: () => void;
  } | null>(null);

  useEffect(() => {
    if (!selectedContainerId && runningContainers.length) {
      setSelectedContainerId(runningContainers[0].id);
    }
  }, [runningContainers, selectedContainerId]);

  useEffect(() => {
    if (!startedAt) {
      setDuration("00:00");
      return;
    }

    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const minutes = Math.floor(elapsed / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (elapsed % 60).toString().padStart(2, "0");
      setDuration(`${minutes}:${seconds}`);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [startedAt]);

  const disconnect = (): void => {
    wsRef.current?.close();
    wsRef.current = null;
    if (xtermRef.current) {
      xtermRef.current.dataSubscription.dispose();
      window.removeEventListener("resize", xtermRef.current.onResize);
      xtermRef.current.term.dispose();
    }
    xtermRef.current = null;
    setConnected(false);
    setStartedAt(null);
  };

  const connect = async (): Promise<void> => {
    if (!selectedContainerId || !token || !hostRef.current) {
      return;
    }

    disconnect();

    try {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
        import("xterm-addon-web-links")
      ]);

      const term = new Terminal({
        theme: {
          background: "#000000",
          foreground: "#d9ffd9",
          cursor: "#10b981"
        },
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 13,
        cursorBlink: true,
        allowProposedApi: true
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      hostRef.current.innerHTML = "";
      term.open(hostRef.current);
      fitAddon.fit();
      term.clear();
      term.write("\\x1b[32mDockPilot terminal initialized\\x1b[0m\\r\\n");

      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(
        `${wsProtocol}://${window.location.host}/api/terminal/${encodeURIComponent(selectedContainerId)}?token=${encodeURIComponent(token)}`
      );
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setConnected(true);
        setStartedAt(Date.now());
        term.write("\\x1b[36mConnected to container shell\\x1b[0m\\r\\n");
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          term.write(event.data);
          return;
        }
        const decoded = new TextDecoder("utf-8").decode(event.data);
        term.write(decoded);
      };

      ws.onclose = () => {
        term.write("\\r\\n\\x1b[31mSession disconnected\\x1b[0m\\r\\n");
        setConnected(false);
        setStartedAt(null);
      };

      ws.onerror = () => {
        toast.error("Terminal connection failed");
      };

      const dataSubscription = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const onResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      };

      window.addEventListener("resize", onResize);

      wsRef.current = ws;
      xtermRef.current = { term, fitAddon, dataSubscription, onResize };

      ws.onclose = (event) => {
        dataSubscription.dispose();
        window.removeEventListener("resize", onResize);
        term.write("\r\n\x1b[31mSession disconnected\x1b[0m\r\n");
        setConnected(false);
        setStartedAt(null);
      };
    } catch (_error) {
      toast.error("Unable to initialize xterm session");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedContainerId}
            onChange={(event) => setSelectedContainerId(event.target.value)}
            className="rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white"
          >
            <option value="">Select container</option>
            {runningContainers.map((container) => (
              <option key={container.id} value={container.id}>
                {container.name}
              </option>
            ))}
          </select>

          <Button onClick={() => void connect()} disabled={!selectedContainerId || connected}>
            Connect
          </Button>
          <Button variant="danger" onClick={disconnect} disabled={!connected}>
            Disconnect
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#2a2a4a] bg-[#161625] px-3 py-2 text-xs text-[#a0a0c0]">
          <span className="inline-flex items-center gap-1">
            <TerminalSquare className="h-4 w-4 text-emerald-400" />
            {runningContainers.find((container) => container.id === selectedContainerId)?.name ?? "No container selected"}
          </span>
          <span>Image: {runningContainers.find((container) => container.id === selectedContainerId)?.image ?? "-"}</span>
          <span>Connected: {connected ? "Yes" : "No"}</span>
          <span>Duration: {duration}</span>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div ref={hostRef} className="h-[64vh] w-full bg-black" />
      </Card>
    </div>
  );
};

export default TerminalPage;
