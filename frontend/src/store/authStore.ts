import { create } from "zustand";
import { authApi } from "@/api/auth";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  hydrate: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const persistAuth = (token: string, user: User): void => {
  localStorage.setItem("dockpilot_token", token);
  localStorage.setItem("dockpilot_user", JSON.stringify(user));
};

const clearAuth = (): void => {
  localStorage.removeItem("dockpilot_token");
  localStorage.removeItem("dockpilot_user");
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  initialized: false,

  hydrate: () => {
    const token = localStorage.getItem("dockpilot_token");
    const rawUser = localStorage.getItem("dockpilot_user");

    if (!token || !rawUser) {
      set({ user: null, token: null, initialized: true });
      return;
    }

    try {
      const user = JSON.parse(rawUser) as User;
      set({ token, user, initialized: true });
    } catch (_error) {
      clearAuth();
      set({ user: null, token: null, initialized: true });
    }
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const result = await authApi.login(username, password);
      persistAuth(result.token, result.user);
      set({ user: result.user, token: result.token, loading: false, initialized: true });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (username, password) => {
    set({ loading: true });
    try {
      const result = await authApi.register(username, password);
      persistAuth(result.token, result.user);
      set({ user: result.user, token: result.token, loading: false, initialized: true });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (_error) {
      // Ignore logout errors because auth is client-side token invalidation.
    }
    clearAuth();
    set({ user: null, token: null, loading: false, initialized: true });
  }
}));
