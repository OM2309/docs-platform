"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth as authApi, tokenStore } from "@/src/lib/api";
import type { User } from "@/src/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.login(email, password);
          tokenStore.set(res.access_token);
          localStorage.setItem("refresh_token", res.refresh_token);
          set({ user: res.user, isAuthenticated: true, isLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Login failed";
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Proceed even if server call fails
        } finally {
          tokenStore.clear();
          localStorage.removeItem("refresh_token");
          set({ user: null, isAuthenticated: false });
        }
      },

      initialize: async () => {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
          set({ isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const res = await authApi.refresh(refreshToken);
          tokenStore.set(res.access_token);
          localStorage.setItem("refresh_token", res.refresh_token);
          set({ user: res.user, isAuthenticated: true, isLoading: false });
        } catch {
          tokenStore.clear();
          localStorage.removeItem("refresh_token");
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "docflow-auth",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
