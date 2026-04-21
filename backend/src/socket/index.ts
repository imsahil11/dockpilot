import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export const initializeSocket = (server: HttpServer): SocketIOServer => {
  ioInstance = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    },
    transports: ["websocket", "polling"],
    allowEIO3: true
  });

  ioInstance.on("connection", (socket) => {
    socket.emit("socket.connected", { id: socket.id, ts: Date.now() });
  });

  return ioInstance;
};

export const getSocket = (): SocketIOServer => {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized");
  }

  return ioInstance;
};
