import { FormEvent, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Bot, Play, SendHorizonal, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAlertStore } from "@/store/alertStore";
import { useAuthStore } from "@/store/authStore";
import { useContainerStore } from "@/store/containerStore";
import { ChatMessage } from "@/types";

const toastStyle = {
  background: "#161625",
  border: "1px solid #2a2a4a",
  color: "#ffffff"
};

const makeId = (): string => Math.random().toString(36).slice(2);

const modeTone = (mode?: string): string => {
  if (mode === "LEARN") return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  if (mode === "SUGGEST") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
};

const isDestructive = (command: string): boolean => /(prune|\brm\b|stop\s+\$\(|kill)/i.test(command);

const AIChatPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const containers = useContainerStore((state) => state.containers);
  const alerts = useAlertStore((state) => state.alerts);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmInputs, setConfirmInputs] = useState<Record<string, string>>({});

  const contextSummary = useMemo(() => {
    const running = containers.filter((container) => container.state.running);
    return {
      running,
      alerts: alerts.filter((alert) => !alert.resolved).slice(0, 5)
    };
  }, [alerts, containers]);

  const appendTokenToMessage = (messageId: string, tokenChunk: string): void => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: message.content + tokenChunk
            }
          : message
      )
    );
  };

  const finalizeMessage = (messageId: string, mode?: "LEARN" | "SUGGEST" | "EXECUTE", command?: string | null): void => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              mode,
              command,
              pending: false
            }
          : message
      )
    );
  };

  const sendMessage = async (content: string): Promise<void> => {
    if (!content.trim() || !token || !user) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content,
      createdAt: Date.now()
    };

    const assistantMessageId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      pending: true,
      createdAt: Date.now()
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: content,
          conversationHistory: [...messages, userMessage].map((message) => ({
            role: message.role,
            content: message.content
          })),
          userId: user.id
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("AI service unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const lines = chunk.split("\n");
          const eventType = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim();
          const dataLine = lines.find((line) => line.startsWith("data:"));
          if (!eventType || !dataLine) {
            continue;
          }

          const payload = JSON.parse(dataLine.replace("data:", "").trim()) as {
            token?: string;
            mode?: "LEARN" | "SUGGEST" | "EXECUTE";
            command?: string | null;
            error?: string;
          };

          if (eventType === "token" && payload.token) {
            appendTokenToMessage(assistantMessageId, payload.token);
          }

          if (eventType === "done") {
            finalizeMessage(assistantMessageId, payload.mode, payload.command ?? null);
          }

          if (eventType === "error") {
            finalizeMessage(assistantMessageId, "SUGGEST", null);
            toast.error(payload.error ?? "Gemini API unavailable. Retry in a moment.", { style: toastStyle });
          }
        }
      }
    } catch (error) {
      toast.error("Unable to connect to AI service", { style: toastStyle });
      finalizeMessage(assistantMessageId, "SUGGEST", null);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await sendMessage(input);
  };

  const executeCommand = async (message: ChatMessage): Promise<void> => {
    if (!message.command || !token || !user) {
      return;
    }

    if (isDestructive(message.command) && confirmInputs[message.id] !== "CONFIRM") {
      toast.error("Type CONFIRM before running this command", { style: toastStyle });
      return;
    }

    try {
      const response = await fetch("/ai/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          command: message.command,
          userId: user.id,
          chatLogId: 0
        })
      });

      if (!response.ok) {
        throw new Error("Execution failed");
      }

      toast("AI command executed", { icon: "ℹ", style: { ...toastStyle, border: "1px solid #3b82f6" } });
      setMessages((current) =>
        current.map((entry) => (entry.id === message.id ? { ...entry, command: null } : entry))
      );
    } catch (_error) {
      toast.error("Command execution failed", { style: toastStyle });
    }
  };

  const examplePrompts = [
    "Why is my container crashing?",
    "Show me all stopped containers",
    "What is a Docker volume?",
    "Explain my current architecture"
  ];

  return (
    <div className="grid min-h-[78vh] gap-4 lg:grid-cols-10">
      <Card className="h-[78vh] overflow-auto p-4 lg:col-span-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-300">
          <ShieldAlert className="h-4 w-4" />
          AI can see this context
        </div>

        <h3 className="text-xs uppercase tracking-wide text-[#606080]">Running Containers</h3>
        <div className="mt-2 space-y-2">
          {contextSummary.running.map((container) => (
            <div key={container.id} className="flex items-center justify-between rounded-lg border border-[#2a2a4a] p-2">
              <div>
                <p className="text-sm text-white">{container.name}</p>
                <p className="text-xs text-[#a0a0c0]">{container.image}</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
          ))}
        </div>

        <h3 className="mt-5 text-xs uppercase tracking-wide text-[#606080]">Recent Alerts</h3>
        <div className="mt-2 space-y-2">
          {contextSummary.alerts.map((alert) => (
            <div key={alert.id} className="rounded-lg border border-[#2a2a4a] p-2">
              <p className="text-sm text-white">{alert.containerName}</p>
              <p className="text-xs text-[#a0a0c0]">{alert.alertType}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex h-[78vh] flex-col lg:col-span-7">
        <div className="border-b border-[#2a2a4a] p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Bot className="h-5 w-5 text-indigo-300" />
              DockPilot AI Assistant
            </h2>
            <span className="text-xs text-[#a0a0c0]">Model: Claude Sonnet 4</span>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-auto p-4">
          {!messages.length ? (
            <div className="space-y-2 rounded-xl border border-dashed border-[#2a2a4a] bg-[#0f0f1a] p-4">
              <p className="text-sm text-[#a0a0c0]">Try one of these prompts:</p>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="rounded-full border border-[#2a2a4a] bg-[#161625] px-3 py-1.5 text-xs text-[#c7c7e8] hover:border-indigo-500"
                    onClick={() => void sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] rounded-xl border p-3 ${
                message.role === "user"
                  ? "ml-auto border-indigo-500/30 bg-indigo-600 text-white"
                  : "border-[#2a2a4a] bg-[#161625] text-[#e9e9ff]"
              }`}
            >
              {message.mode ? (
                <span className={`mb-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] ${modeTone(message.mode)}`}>
                  {message.mode}
                </span>
              ) : null}

              <p className="whitespace-pre-wrap text-sm">{message.content}</p>

              {message.command ? (
                <div className="mt-3 rounded-lg border border-[#2a2a4a] bg-[#0a0a0f] p-3">
                  <pre className="overflow-auto font-mono text-xs">
                    <span className="text-cyan-300">{message.command.split(" ")[0]}</span>
                    <span className="text-amber-300"> {message.command.split(" ").slice(1).join(" ")}</span>
                  </pre>

                  {isDestructive(message.command) ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-red-300">Destructive command detected. Type CONFIRM to continue.</p>
                      <input
                        value={confirmInputs[message.id] ?? ""}
                        onChange={(event) =>
                          setConfirmInputs((current) => ({ ...current, [message.id]: event.target.value }))
                        }
                        className="w-full rounded-lg border border-red-500/30 bg-[#0f0f1a] px-3 py-2 text-xs text-white"
                        placeholder="Type CONFIRM"
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      onClick={() => void executeCommand(message)}
                    >
                      <Play className="mr-2 h-4 w-4" /> Confirm & Run
                    </Button>
                    <Button
                      variant="danger"
                      className="bg-red-500/80 hover:bg-red-500"
                      onClick={() =>
                        setMessages((current) =>
                          current.map((entry) =>
                            entry.id === message.id ? { ...entry, command: null, mode: "SUGGEST" } : entry
                          )
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="border-t border-[#2a2a4a] p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="Ask about your Docker environment..."
              className="flex-1 resize-none rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
            <Button type="submit" loading={sending} className="self-end">
              <SendHorizonal className="mr-1 h-4 w-4" /> Send
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default AIChatPage;
