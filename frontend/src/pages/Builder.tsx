import { FormEvent, Suspense, lazy, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { containersApi } from "@/api/containers";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

type BuilderMode = "dockerfile" | "compose";

const initialDockerfile = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD [\"npm\", \"start\"]\n`;

const initialCompose = `version: '3.9'\nservices:\n  app:\n    build: .\n    ports:\n      - \"3000:3000\"\n`;

const validateContent = (mode: BuilderMode, content: string): string[] => {
  const errors: string[] = [];
  if (mode === "dockerfile") {
    if (!/^FROM\s+/m.test(content)) {
      errors.push("Dockerfile should start with a FROM instruction.");
    }
    if (!/CMD\s+/m.test(content) && !/ENTRYPOINT\s+/m.test(content)) {
      errors.push("Dockerfile should define CMD or ENTRYPOINT.");
    }
  } else {
    if (!/^services:/m.test(content) && !/^version:/m.test(content)) {
      errors.push("Compose file should include version and services sections.");
    }
    if (/\t/.test(content)) {
      errors.push("YAML should use spaces, not tabs.");
    }
  }
  return errors;
};

const BuilderPage = () => {
  const [mode, setMode] = useState<BuilderMode>("dockerfile");
  const [dockerfileContent, setDockerfileContent] = useState(initialDockerfile);
  const [composeContent, setComposeContent] = useState(initialCompose);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const activeContent = mode === "dockerfile" ? dockerfileContent : composeContent;
  const validationErrors = useMemo(() => validateContent(mode, activeContent), [activeContent, mode]);

  const streamGeneration = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    setGenerating(true);
    const token = localStorage.getItem("dockpilot_token") ?? "";

    try {
      if (mode === "dockerfile") {
        setDockerfileContent("");
      } else {
        setComposeContent("");
      }

      const response = await fetch("/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `Generate a ${mode === "dockerfile" ? "Dockerfile" : "docker-compose.yml"} for this stack: ${prompt}. Return only code.`,
          conversationHistory: [],
          userId: 0
        })
      });

      if (!response.body) {
        throw new Error("No stream available");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const eventType = chunk
            .split("\n")
            .find((line) => line.startsWith("event:"))
            ?.replace("event:", "")
            .trim();
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
          if (!eventType || !dataLine) continue;

          const payload = JSON.parse(dataLine.replace("data:", "").trim()) as { token?: string; error?: string };

          if (eventType === "token" && payload.token) {
            if (mode === "dockerfile") {
              setDockerfileContent((current) => current + payload.token);
            } else {
              setComposeContent((current) => current + payload.token);
            }
          }

          if (eventType === "error") {
            throw new Error(payload.error ?? "Generation failed");
          }
        }
      }

      toast.success("Generated with AI");
    } catch (_error) {
      toast.error("Could not generate code with AI");
    } finally {
      setGenerating(false);
    }
  };

  const downloadCurrent = (): void => {
    const fileName = mode === "dockerfile" ? "Dockerfile" : "docker-compose.yml";
    const blob = new Blob([activeContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const deployCompose = async (): Promise<void> => {
    if (mode !== "compose") {
      toast.error("Switch to Compose mode before deploying");
      return;
    }

    setDeploying(true);
    try {
      const result = await containersApi.deploy(composeContent);
      toast.success(result.output || "Deployment triggered");
    } catch (_error) {
      toast.error("Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="h-[78vh] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[#2a2a4a] px-4 py-3">
          <div className="flex gap-2">
            <Button variant={mode === "dockerfile" ? "primary" : "secondary"} onClick={() => setMode("dockerfile")}>
              Dockerfile
            </Button>
            <Button variant={mode === "compose" ? "primary" : "secondary"} onClick={() => setMode("compose")}>
              Compose
            </Button>
          </div>
          <span className="text-xs text-[#a0a0c0]">Mode: {mode}</span>
        </div>

        <Suspense fallback={<div className="p-4 text-sm text-[#a0a0c0]">Loading editor...</div>}>
          <MonacoEditor
            height="calc(78vh - 56px)"
            defaultLanguage={mode === "dockerfile" ? "dockerfile" : "yaml"}
            language={mode === "dockerfile" ? "dockerfile" : "yaml"}
            value={activeContent}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              smoothScrolling: true,
              fontFamily: "JetBrains Mono",
              fontSize: 13,
              automaticLayout: true
            }}
            onChange={(value) => {
              if (mode === "dockerfile") {
                setDockerfileContent(value ?? "");
              } else {
                setComposeContent(value ?? "");
              }
            }}
          />
        </Suspense>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-white">AI Generation Panel</h2>
          <p className="mt-1 text-xs text-[#a0a0c0]">Describe your stack in plain English and stream code directly into the editor.</p>

          <form className="mt-4 space-y-3" onSubmit={streamGeneration}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Describe your stack in plain English..."
              className="w-full rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={generating}>
                Generate with AI
              </Button>
              <Button type="button" variant="secondary" onClick={downloadCurrent}>
                Download
              </Button>
              <Button type="button" variant="secondary" loading={deploying} onClick={() => void deployCompose()}>
                Deploy to Docker
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white">Validation</h3>
          <div className="mt-3 space-y-2">
            {validationErrors.length === 0 ? (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                No obvious syntax issues detected.
              </p>
            ) : (
              validationErrors.map((error, index) => (
                <p
                  key={index}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
                >
                  {error}
                </p>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BuilderPage;
