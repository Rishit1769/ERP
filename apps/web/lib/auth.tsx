"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

interface User {
  erp_id: string;
  name: string;
  email: string;
  base_role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE" | "STUDENT";
  dept_id: number | null;
  dept_name?: string;
  must_change_password: boolean;
  roles: string[];
  scope: "full" | "restricted";
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (identifier: string, password: string) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    if (data.must_change_password) {
      setUser({ ...data, roles: [], scope: "restricted" });
      router.push("/set-password");
    } else {
      await refresh();
      router.push("/dashboard");
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
