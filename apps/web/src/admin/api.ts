const jsonHeaders = { "Content-Type": "application/json" };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: "include",
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data;
}

export type AdminUser = { id: string; username: string; createdAt: string | null };

export const adminApi = {
  login: (username: string, password: string) =>
    req<{ admin: AdminUser }>("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: boolean }>("/logout", { method: "POST" }),
  me: () => req<{ admin: AdminUser }>("/me"),
  dashboard: () => req<Record<string, unknown>>("/dashboard"),
  users: (q?: string) => req<{ items: unknown[] }>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  user: (id: string) => req<Record<string, unknown>>(`/users/${id}`),
  resetPassword: (id: string, password: string) =>
    req(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  clearByok: (id: string) => req(`/users/${id}/clear-byok`, { method: "POST" }),
  setUsage: (id: string, count: number) =>
    req(`/users/${id}/identify-usage`, { method: "PATCH", body: JSON.stringify({ count }) }),
  deleteUser: (id: string) => req(`/users/${id}`, { method: "DELETE" }),
  observations: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<{ items: unknown[] }>(`/observations?${qs}`);
  },
  observation: (id: string) => req<Record<string, unknown>>(`/observations/${id}`),
  requeue: (id: string) => req(`/observations/${id}/requeue`, { method: "POST" }),
  reidentify: (id: string, description: string) =>
    req(`/observations/${id}/reidentify`, {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
  recomputeSettle: (id: string) =>
    req(`/observations/${id}/recompute-settle`, { method: "POST" }),
  deleteObservation: (id: string) => req(`/observations/${id}`, { method: "DELETE" }),
  secrets: () => req<Record<string, unknown>>("/secrets"),
  patchSecrets: (body: Record<string, unknown>) =>
    req("/secrets", { method: "PATCH", body: JSON.stringify(body) }),
  storage: () => req<Record<string, unknown>>("/storage"),
  deleteOrphans: (ids: string[]) =>
    req("/storage/orphans/delete", { method: "POST", body: JSON.stringify({ ids }) }),
  clearRarityCache: (body: { all?: boolean; prefix?: string }) =>
    req("/rarity-cache/clear", { method: "POST", body: JSON.stringify(body) }),
  audit: () => req<{ items: unknown[] }>("/audit"),
};
