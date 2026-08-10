import { t } from "@biotrace/messages";

export type TaxonomyName = { name_la: string | null; name_zh: string | null };
export type Taxonomy = {
  kingdom: TaxonomyName;
  phylum: TaxonomyName;
  class: TaxonomyName;
  order: TaxonomyName;
  family: TaxonomyName;
  genus: TaxonomyName;
  species: TaxonomyName;
};

export type User = { id: string; email: string; createdAt: string };
export type Trip = { id: string; userId: string; title: string; createdAt: string };
export type ObsStatus = "analyzing" | "pending_settle" | "settled" | "failed";
export type SettleTier = "full" | "weak" | "none";
/** Tier codes from API (default N/R/SR/UR; may grow via config). */
export type Rarity = string;

export type Observation = {
  id: string;
  tripId: string;
  userId: string;
  status: ObsStatus;
  description: string | null;
  capturedAt: string | null;
  lat: number | null;
  lng: number | null;
  displayUrl: string;
  commonName: string | null;
  scientificName: string | null;
  finestReliableRank: string | null;
  confidence: number | null;
  taxonomy: Taxonomy | null;
  blurb: string | null;
  notes: string | null;
  error: string | null;
  settleTier: SettleTier | null;
  rarity: Rarity | null;
  countryCode: string | null;
  locationPrecise: boolean | null;
  alertIntroduced: boolean;
  taxonKey: string | null;
  identifyProvider: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  pendingReveal?: boolean;
};

export type CollectionEntry = {
  id: string;
  taxonKey: string;
  commonName: string | null;
  scientificName: string | null;
  rarity: Rarity;
  coverObservationId: string | null;
  coverDisplayUrl: string | null;
  firstCollectedAt: string;
  updatedAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || t("error.http", { status: res.status }));
  }
  return data;
}

export type ProviderHealthSnap = {
  configured: boolean;
  status: string;
  coolUntil: number | null;
  lastOkAt: number | null;
};

export type HealthResponse = {
  ok: boolean;
  devAuth?: boolean;
  geminiConfigured: boolean;
  zhipuConfigured?: boolean;
  providers?: {
    gemini: ProviderHealthSnap;
    zhipu: ProviderHealthSnap;
  };
  identifyQueue?: { pending: number; running: number };
};

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  me: () => request<{ user: User }>("/api/auth/me"),
  requestMagicLink: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  devLogin: () =>
    request<{ user: User }>("/api/auth/dev-login", { method: "POST", body: "{}" }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listTrips: () => request<{ trips: Trip[] }>("/api/trips"),
  createTrip: (title: string) =>
    request<{ trip: Trip }>("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  getTrip: (id: string) => request<{ trip: Trip }>(`/api/trips/${id}`),
  updateTrip: (id: string, title: string) =>
    request<{ trip: Trip }>(`/api/trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  deleteTrip: (id: string, confirmPhrase: string) =>
    request<{ ok: boolean; id: string; deletedObservations: number }>(`/api/trips/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmPhrase }),
    }),
  listTripObservations: (tripId: string) =>
    request<{ observations: Observation[] }>(`/api/trips/${tripId}/observations`),
  uploadObservation: (tripId: string, file: File, description?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (description?.trim()) form.append("description", description.trim());
    return request<{ observation: Observation }>(`/api/trips/${tripId}/observations`, {
      method: "POST",
      body: form,
    });
  },
  getObservation: (id: string, forSettle = false) =>
    request<{ observation: Observation }>(
      `/api/observations/${id}${forSettle ? "?forSettle=1" : ""}`,
    ),
  settleObservation: (id: string) =>
    request<{ observation: Observation }>(`/api/observations/${id}/settle`, {
      method: "POST",
      body: "{}",
    }),
  deleteObservation: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/observations/${id}`, { method: "DELETE" }),
  reidentifyObservation: (id: string, description: string) =>
    request<{ observation: Observation }>(`/api/observations/${id}/reidentify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }),
  listMappedObservations: () =>
    request<{ observations: Observation[] }>("/api/observations?mapped=1"),
  listCollection: () => request<{ entries: CollectionEntry[] }>("/api/collection"),
};
