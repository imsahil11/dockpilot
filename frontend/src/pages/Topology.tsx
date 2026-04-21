import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeProps,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "reactflow";
import "reactflow/dist/style.css";
import toast from "react-hot-toast";
import { topologyApi } from "@/api/topology";
import { containersApi } from "@/api/containers";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useContainerStore } from "@/store/containerStore";
import { useSocketStore } from "@/store/socketStore";
import { TopologyNodeData } from "@/types";

interface FlowNodeData extends TopologyNodeData {
  raw?: Record<string, unknown>;
}

const statusColor = (status?: string): string => {
  if (status === "running") {
    return "#10b981";
  }
  if (status === "paused" || status === "unhealthy") {
    return "#f59e0b";
  }
  return "#ef4444";
};

const FlowContainerNode = ({ data }: NodeProps<FlowNodeData>) => {
  const borderColor = statusColor(data.status);
  return (
    <div
      className="w-[160px] rounded-xl border bg-[#161625] p-3 text-xs shadow-soft"
      style={{ borderColor }}
    >
      <div className="flex items-center justify-between">
        <p className="truncate font-semibold text-white">{data.name}</p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: borderColor }} />
      </div>
      <p className="mt-1 truncate text-[#a0a0c0]">{data.image ?? "N/A"}</p>
      <p className="mt-2 text-[#606080]">CPU {Number(data.cpuPercent ?? 0).toFixed(1)}%</p>
      <p className="text-[#606080]">MEM {Number(data.memoryMb ?? 0).toFixed(1)} MB</p>
    </div>
  );
};

const nodeTypes = { containerNode: FlowContainerNode };

const TopologyPageInner = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [containerDetail, setContainerDetail] = useState<Record<string, unknown> | null>(null);

  const containers = useContainerStore((state) => state.containers);
  const selectContainer = useContainerStore((state) => state.selectContainer);

  const socket = useSocketStore((state) => state.socket);
  const connectSocket = useSocketStore((state) => state.connect);

  const applyTopology = useCallback(
    (topology: { nodes: Array<{ id: string; data: FlowNodeData; type: string }>; edges: Edge[] }) => {
      const mappedNodes: Node<FlowNodeData>[] = topology.nodes.map((node, index) => ({
        id: node.id,
        type: "containerNode",
        data: node.data,
        position: {
          x: (index % 4) * 220,
          y: Math.floor(index / 4) * 140
        }
      }));

      const mappedEdges: Edge[] = topology.edges.map((edge) => ({
        ...edge,
        animated: edge.label === "depends_on",
        style: { stroke: "#3a3a5a" },
        labelStyle: { fill: "#a0a0c0", fontSize: 10 }
      }));

      setNodes(mappedNodes);
      setEdges(mappedEdges);
      setSelectedNode(null);
      setContainerDetail(null);
    },
    [setEdges, setNodes]
  );

  const loadLiveTopology = useCallback(async () => {
    setLoading(true);
    try {
      const live = await topologyApi.live();
      applyTopology({
        nodes: live.nodes.map((node) => ({ ...node, type: "containerNode", data: node.data })),
        edges: live.edges as Edge[]
      });
      toast.success("Loaded live topology");
    } catch (error) {
      toast.error("Failed to load topology");
    } finally {
      setLoading(false);
    }
  }, [applyTopology]);

  useEffect(() => {
    void loadLiveTopology();
  }, [loadLiveTopology]);

  useEffect(() => {
    const active = socket ?? connectSocket();

    const onContainerEvent = async (): Promise<void> => {
      await loadLiveTopology();
    };

    active.on("container.event", onContainerEvent);
    return () => {
      active.off("container.event", onContainerEvent);
    };
  }, [connectSocket, loadLiveTopology, socket]);

  const selectedContainer = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    return containers.find((container) => container.name === selectedNode.data.name) ?? null;
  }, [containers, selectedNode]);

  useEffect(() => {
    const fetchDetail = async (): Promise<void> => {
      if (!selectedContainer) {
        setContainerDetail(null);
        return;
      }
      try {
        const detail = await containersApi.getById(selectedContainer.id);
        setContainerDetail(detail.inspect);
      } catch (_error) {
        setContainerDetail(null);
      }
    };

    void fetchDetail();
  }, [selectedContainer]);

  return (
    <div className="space-y-4">
      <Card className="border-dashed p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <label className="cursor-pointer rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-4 py-2 text-sm text-[#a0a0c0] hover:border-[#3a3a5a]">
            Upload docker-compose.yml
            <input
              type="file"
              accept=".yml,.yaml"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                try {
                  const parsed = await topologyApi.parse(file);
                  applyTopology({
                    nodes: parsed.nodes.map((node) => ({ ...node, type: "containerNode", data: node.data })),
                    edges: parsed.edges as Edge[]
                  });
                  toast.success("Compose topology parsed");
                } catch (_error) {
                  toast.error("Could not parse compose file");
                }
              }}
            />
          </label>

          <Button onClick={() => void loadLiveTopology()} loading={loading}>
            Load Live Topology
          </Button>
        </div>
      </Card>

      <div className="relative h-[68vh] overflow-hidden rounded-xl border border-[#2a2a4a] bg-[#0f0f1a]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => setSelectedNode(node as Node<FlowNodeData>)}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#1f1f34" gap={20} />
          <MiniMap nodeColor={(node: Node<FlowNodeData>) => statusColor(node.data?.status)} />
          <Controls showInteractive />
        </ReactFlow>

        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-md border-l border-[#2a2a4a] bg-[#161625] p-4 transition-transform duration-300 ${
            selectedNode ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{selectedNode.data.name}</h3>
                <Badge tone={selectedNode.data.status === "running" ? "running" : "stopped"}>
                  {selectedNode.data.status ?? "unknown"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3">
                  <p className="text-xs text-[#a0a0c0]">CPU</p>
                  <p className="mt-1 text-xl font-semibold text-cyan-300">
                    {Number(selectedNode.data.cpuPercent ?? 0).toFixed(1)}%
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-[#a0a0c0]">Memory</p>
                  <p className="mt-1 text-xl font-semibold text-indigo-300">
                    {Number(selectedNode.data.memoryMb ?? 0).toFixed(1)} MB
                  </p>
                </Card>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-[#a0a0c0]">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!selectedContainer) return;
                      await containersApi.start(selectedContainer.id);
                      toast.success("Container start requested");
                    }}
                  >
                    Start
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!selectedContainer) return;
                      await containersApi.stop(selectedContainer.id);
                      toast.success("Container stop requested");
                    }}
                  >
                    Stop
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!selectedContainer) return;
                      await containersApi.restart(selectedContainer.id);
                      toast.success("Container restart requested");
                    }}
                  >
                    Restart
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!selectedContainer) return;
                      selectContainer(selectedContainer.id);
                      window.location.href = "/terminal";
                    }}
                  >
                    Open Terminal
                  </Button>
                </div>
              </div>

              <Card className="max-h-[260px] overflow-auto p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-[#606080]">Container Config</p>
                <pre className="font-mono text-[11px] text-[#a0a0c0]">
                  {JSON.stringify(
                    containerDetail
                      ? {
                          image: containerDetail.Config && (containerDetail.Config as { Image?: string }).Image,
                          ports: containerDetail.NetworkSettings,
                          volumes: containerDetail.Mounts,
                          env: (containerDetail.Config as { Env?: string[] }).Env?.map((entry) => {
                            const [key] = entry.split("=");
                            return `${key}=***`;
                          })
                        }
                      : {},
                    null,
                    2
                  )}
                </pre>
              </Card>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};

const TopologyPage = () => (
  <ReactFlowProvider>
    <TopologyPageInner />
  </ReactFlowProvider>
);

export default TopologyPage;
