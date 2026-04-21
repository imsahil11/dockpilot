import { create } from "zustand";
import { Socket, io } from "socket.io-client";

interface SocketState {
  socket: Socket | null;
  connected: boolean;
  connect: () => Socket;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connected: false,

  connect: () => {
    const existing = get().socket;
    if (existing) {
      return existing;
    }

    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    set({ socket });
    return socket;
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, connected: false });
  }
}));
