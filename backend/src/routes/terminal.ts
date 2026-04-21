import { IncomingMessage } from "http";
import { PrismaClient } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../config";
import { DockerService } from "../services/docker.service";

interface TerminalSessionContext {
  containerId: string;
  userId: number;
  username: string;
}

export const initializeTerminalWebSocket = (
  server: import("http").Server,
  prisma: PrismaClient,
  dockerService: DockerService,
  jwtSecret: string
): void => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    const requestUrl = request.url ?? "/";
    const url = new URL(requestUrl, `http://${host}`);
    const match = url.pathname.match(/^\/api\/terminal\/([^/]+)$/);

    if (!match) {
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (_error) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    if (typeof payload.id !== "number" || typeof payload.username !== "string") {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const session: TerminalSessionContext = {
      containerId: decodeURIComponent(match[1]),
      userId: payload.id,
      username: payload.username
    };

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, session);
    });
  });

  wss.on("connection", async (ws: WebSocket, _request: IncomingMessage, session: TerminalSessionContext) => {
    const container = dockerService.getClient().getContainer(session.containerId);
    let logContainerName = session.containerId;
    let logImage = "unknown";

    try {
      const inspect = await container.inspect();
      logContainerName = inspect.Name.replace(/^\//, "");
      logImage = inspect.Config.Image;

      await prisma.deploymentLog.create({
        data: {
          containerId: inspect.Id,
          containerName: logContainerName,
          imageVersion: logImage,
          action: "exec",
          outcome: "success",
          triggeredBy: session.userId,
          triggeredSource: "user",
          notes: `Terminal session started by ${session.username}`
        }
      });

      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ["/bin/sh"]
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true
      });

      stream.on("data", (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      });

      stream.on("error", (error) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n[DockPilot terminal error] ${(error as Error).message}\r\n`);
        }
      });

      ws.on("message", async (rawData: WebSocket.RawData) => {
        const data = rawData.toString("utf8");
        try {
          const parsed = JSON.parse(data) as { type?: string; cols?: number; rows?: number; input?: string };
          if (parsed.type === "resize" && parsed.cols && parsed.rows) {
            await exec.resize({ h: parsed.rows, w: parsed.cols });
            return;
          }
          if (typeof parsed.input === "string") {
            stream.write(parsed.input);
            return;
          }
        } catch (_error) {
          stream.write(data);
        }
      });

      ws.on("close", async () => {
        stream.end();
        try {
          await prisma.deploymentLog.create({
            data: {
              containerId: inspect.Id,
              containerName: logContainerName,
              imageVersion: logImage,
              action: "exec",
              outcome: "success",
              triggeredBy: session.userId,
              triggeredSource: "user",
              notes: `Terminal session ended by ${session.username}`
            }
          });
        } catch (error) {
          logger.error(`Failed to log terminal session end: ${(error as Error).message}`);
        }
      });
    } catch (error) {
      logger.error(`Terminal websocket setup failed: ${(error as Error).message}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n[DockPilot] Unable to open terminal: ${(error as Error).message}\r\n`);
        ws.close();
      }
    }
  });
};
