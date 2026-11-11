// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { gql } from "./api";

export type Me = { id: string; email: string; name: string; role: "USER" | "MODERATOR" | "ADMIN" } | null;
const Ctx = createContext<{ me: Me; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }>({ me: null, loading: true, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(null); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { try { setMe((await gql<{ me: Me }>(`{me{id email name role}}`)).me); } catch { setMe(null); } finally { setLoading(false); } }, []);
  const logout = useCallback(async () => { await gql(`mutation{logout}`).catch(() => {}); setMe(null); location.href = "/"; }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>;
}
