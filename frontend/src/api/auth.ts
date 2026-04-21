import api from "./axios";
import { AuthResponse, User } from "@/types";

export const authApi = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login", { username, password });
    return data;
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/register", { username, password });
    return data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  }
};
