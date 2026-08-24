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

export type User = { id: string; email: string; displayName: string | null; createdAt: string };
export type Trip = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  coverDisplayUrl?: string | null;
  observationCount?: number;
  metaManualEnabled?: boolean;
  manualDateText?: string | null;
  manualPlaceText?: string | null;
  /** 自动聚合（不受手填开关影响） */
  autoDateSummary?: string | null;
  autoPlaceSummary?: string | null;
  /** 展示用：手填优先（开且非空）否则自动 */
  dateSummary?: string | null;
  placeSummary?: string | null;
  memberCount?: number;
  isAdmin?: boolean;
  allowJoin?: boolean;
  /** 仅管理员可见 */
  inviteCode?: string | null;
};

export type TripMember = {
  userId: string;
  displayName: string | null;
  email: string;
  joinedAt: string;
  isAdmin: boolean;
};

export type TripUpdate = {
  title?: string;
  metaManualEnabled?: boolean;
  manualDateText?: string | null;
  manualPlaceText?: string | null;
};
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
  /** 原图（相册高清）；旧观察可能为 null */
  originalUrl?: string | null;
  locationLabel?: string | null;
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
  identifyModel?: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  pendingReveal?: boolean;
};

/** 观察页识图学名与图鉴标准名（taxonKey）不同时，返回标准名。 */
export function acceptedScientificIfDifferent(obs: Pick<Observation, "scientificName" | "taxonKey">) {
  const accepted = obs.taxonKey?.trim();
  const raw = obs.scientificName?.trim();
  if (!accepted || !raw) return null;
  if (accepted.toLowerCase() === raw.toLowerCase()) return null;
  return accepted;
}

export type CollectionSighting = {
  observationId: string;
  displayUrl: string;
  tripId: string;
  tripTitle: string;
  occurredAt: string;
};

export type CollectionEntry = {
  id: string;
  taxonKey: string;
  commonName: string | null;
  scientificName: string | null;
  rarity: Rarity;
  /** 该种任意已结算观察曾命中引入警示。 */
  alertIntroduced?: boolean;
  coverObservationId: string | null;
  coverDisplayUrl: string | null;
  firstCollectedAt: string;
  updatedAt: string;
  taxonomy?: Taxonomy | null;
};

export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, opts?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = opts?.code ?? null;
    this.status = opts?.status ?? 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiError(data.error || t("error.http", { status: res.status }), {
      code: data.code ?? null,
      status: res.status,
    });
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
  tokenhubConfigured?: boolean;
  zhipuConfigured?: boolean;
  providers?: {
    gemini: ProviderHealthSnap;
    tokenhub?: ProviderHealthSnap;
    zhipu?: ProviderHealthSnap;
  };
  identifyQueue?: { pending: number; running: number };
  settleQueue?: { pending: number; running: number };
};

export type IdentifyQuota = {
  day: string;
  used: number;
  limit: number;
  remaining: number | null;
  limited: boolean;
  exhausted: boolean;
};

export type IdentifyKeySettings = {
  useOwnKey: boolean;
  hasKey: boolean;
  keyHint: string | null;
  baseUrl: string | null;
  model: string | null;
  ready: boolean;
};

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  me: () =>
    request<{
      user: User;
      identifyQuota?: IdentifyQuota;
      identifyKey?: IdentifyKeySettings;
    }>("/api/auth/me"),
  updateIdentifyKey: (body: {
    useOwnKey?: boolean;
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    clearKey?: boolean;
  }) =>
    request<{ ok: boolean; identifyKey: IdentifyKeySettings; message: string }>(
      "/api/auth/me/identify-key",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
  register: (email: string, password: string, displayName?: string) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, password: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    }),
  updateMe: (displayName: string) =>
    request<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
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
  joinTrip: (code: string) =>
    request<{ trip: Trip }>("/api/trips/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  getTrip: (id: string) => request<{ trip: Trip }>(`/api/trips/${id}`),
  updateTrip: (id: string, patch: TripUpdate) =>
    request<{ trip: Trip }>(`/api/trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteTrip: (id: string, confirmPhrase: string) =>
    request<{ ok: boolean; id: string; deletedObservations: number; dissolved?: boolean }>(
      `/api/trips/${id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase }),
      },
    ),
  listTripMembers: (id: string) =>
    request<{ members: TripMember[]; memberLimit: number }>(`/api/trips/${id}/members`),
  updateTripShare: (id: string, allowJoin: boolean) =>
    request<{ allowJoin: boolean; inviteCode: string; memberLimit: number }>(
      `/api/trips/${id}/share`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowJoin }),
      },
    ),
  leaveTrip: (id: string) =>
    request<{ ok: boolean; result: "left" | "dissolved" }>(`/api/trips/${id}/leave`, {
      method: "POST",
      body: "{}",
    }),
  kickTripMember: (id: string, userId: string) =>
    request<{ ok: boolean }>(`/api/trips/${id}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  listTripObservations: (tripId: string) =>
    request<{ observations: Observation[] }>(`/api/trips/${tripId}/observations`),
  uploadObservation: (tripId: string, file: File, description?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (description?.trim()) form.append("description", description.trim());
    return request<{ observation: Observation; code?: string }>(
      `/api/trips/${tripId}/observations`,
      {
        method: "POST",
        body: form,
      },
    );
  },
  getObservation: (id: string, forSettle = false) =>
    request<{ observation: Observation }>(
      `/api/observations/${id}${forSettle ? "?forSettle=1" : ""}`,
    ),
  settleObservation: (id: string) =>
    request<{ observation: Observation; volumes: SettleVolumesResult }>(
      `/api/observations/${id}/settle`,
      {
        method: "POST",
        body: "{}",
      },
    ),
  deleteObservation: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/observations/${id}`, { method: "DELETE" }),
  reidentifyObservation: (id: string, description: string) =>
    request<{ observation: Observation }>(`/api/observations/${id}/reidentify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }),
  setObservationLocation: (id: string, lat: number, lng: number) =>
    request<{ observation: Observation }>(`/api/observations/${id}/location`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    }),
  listMappedObservations: () =>
    request<{ observations: Observation[] }>("/api/observations?mapped=1"),
  listCollection: () => request<{ entries: CollectionEntry[] }>("/api/collection"),
  getCollectionEntry: (id: string) =>
    request<{ entry: CollectionEntry; sightings: CollectionSighting[] }>(`/api/collection/${id}`),
  listVolumes: () => request<{ volumes: VolumeListItem[] }>("/api/volumes"),
};

export type SettleVolumesResult = {
  newlyLit: Array<{
    volumeId: string;
    slotId: string;
    volumeTitleKey: string;
    slotTitleKey: string;
  }>;
  newlyCompletedVolumeIds: string[];
  newlyCompleted: Array<{ volumeId: string; titleKey: string }>;
};

export type VolumeSlotView = {
  id: string;
  titleKey: string;
  lit: boolean;
  coverObservationId: string | null;
  coverDisplayUrl: string | null;
};

export type VolumeListItem = {
  id: string;
  sort: number;
  titleKey: string;
  ledeKey: string;
  completed: boolean;
  completedAt: string | null;
  litCount: number;
  totalSlots: number;
  coverDisplayUrl: string | null;
  slots: VolumeSlotView[];
};
