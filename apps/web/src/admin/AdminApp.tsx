import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { t, formatRank } from "@biotrace/messages";
import { adminApi, type AdminUser, type RarityCacheEntry, type RarityCacheItem } from "./api";
import {
  auditActionLabel,
  auditTargetTypeLabel,
  countrySourceLabel,
  explainObsError,
  flagLabel,
  formatAdminTime,
  identifyProviderName,
  identifyRouteActiveLabel,
  identifyRouteReasonLabel,
  obsStatusLabel,
  providerStatusLabel,
  rarityLabel,
  settleTierLabel,
  yesNo,
} from "./format";
import "./admin.css";

function bytes(n: unknown) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function dash(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function Kv({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <table className="admin-table" style={{ marginTop: "0.5rem" }}>
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={`${label}-${i}`}>
            <th style={{ width: "9.5rem", whiteSpace: "nowrap" }}>{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Login({ onOk }: { onOk: (a: AdminUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await adminApi.login(username, password);
      onOk(r.admin);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t("admin.invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-root">
      <form className="admin-login" onSubmit={submit}>
        <h1>{t("admin.login")}</h1>
        <label htmlFor="admin-user">{t("admin.username")}</label>
        <input id="admin-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <label htmlFor="admin-pass">{t("admin.password")}</label>
        <input
          id="admin-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {err ? <p className="admin-err">{err}</p> : null}
        <p style={{ marginTop: "1rem" }}>
          <button type="submit" disabled={busy}>
            {busy ? t("admin.loggingIn") : t("admin.loginAction")}
          </button>
        </p>
      </form>
    </div>
  );
}

function Shell({
  admin,
  onLogout,
  children,
}: {
  admin: AdminUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="admin-root admin-shell">
      <aside className="admin-side">
        <div className="brand">{t("admin.title")}</div>
        <NavLink to="/admin" end>
          {t("admin.nav.dashboard")}
        </NavLink>
        <NavLink to="/admin/users">{t("admin.nav.users")}</NavLink>
        <NavLink to="/admin/observations">{t("admin.nav.observations")}</NavLink>
        <NavLink to="/admin/rarity-cache">{t("admin.nav.rarityCache")}</NavLink>
        <NavLink to="/admin/secrets">{t("admin.nav.secrets")}</NavLink>
        <NavLink to="/admin/storage">{t("admin.nav.storage")}</NavLink>
        <NavLink to="/admin/audit">{t("admin.nav.audit")}</NavLink>
        <p className="admin-muted" style={{ margin: "1.5rem 0.5rem 0.5rem", color: "#a1a1aa" }}>
          {admin.username}
        </p>
        <button
          type="button"
          style={{ margin: "0 0.5rem", width: "calc(100% - 1rem)" }}
          onClick={async () => {
            await adminApi.logout().catch(() => undefined);
            onLogout();
          }}
        >
          {t("admin.logout")}
        </button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminApi
      .dashboard()
      .then(setData)
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <p className="admin-err">{err}</p>;
  if (!data) return <p className="admin-muted">{t("app.loading")}</p>;

  const users = data.users as { total: number; today: number };
  const byStatus = (data.observationsByStatus ?? {}) as Record<string, number>;
  const flags = data.flags as Record<string, boolean>;
  const storage = data.storage as { databaseBytes: number; uploadsBytes: number };
  const queue = data.identifyQueue as { pending?: number; running?: number } | number | null;
  const queuePending = typeof queue === "object" && queue ? Number(queue.pending ?? 0) : 0;
  const queueRunning =
    typeof queue === "object" && queue ? Number(queue.running ?? 0) : Number(queue ?? 0);
  type ProviderRow = {
    configured?: boolean;
    status?: string;
    coolUntil?: number | null;
    lastOkAt?: number | null;
    todaySuccess?: number;
    todayFail?: number;
    exhaustedAt?: number | null;
    successAtExhaust?: number | null;
  };
  const identifyRoute = (data.identifyRoute ?? null) as {
    activeProvider?: string;
    usingTokenhubFallback?: boolean;
    usingZhipuFallback?: boolean;
    reason?: string;
    gemini?: ProviderRow;
    tokenhub?: ProviderRow;
    zhipu?: ProviderRow;
    vlModels?: Array<{
      model: string;
      status: string;
      coolUntil: number | null;
      lastOkAt: number | null;
      lastError: string | null;
    }>;
  } | null;
  const providers = (identifyRoute
    ? { gemini: identifyRoute.gemini, tokenhub: identifyRoute.tokenhub ?? identifyRoute.zhipu }
    : ((data.providers ?? {}) as Record<string, ProviderRow>)) as Record<string, ProviderRow>;
  const recentFailed = (data.recentFailed ?? []) as Array<{
    id: string;
    error?: string;
    updatedAt?: string;
    userId?: string;
    userEmail?: string | null;
  }>;

  const statusOrder = ["analyzing", "pending_settle", "settled", "failed"];

  return (
    <>
      <h1>{t("admin.nav.dashboard")}</h1>
      <p className="admin-muted">{t("admin.timeHint")}</p>
      <div className="admin-cards">
        <div className="admin-card">
          <div className="label">{t("admin.usersTotal")}</div>
          <div className="value">{users.total}</div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.usersToday")}</div>
          <div className="value">{users.today}</div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.identifyQueue")}</div>
          <div className="value" style={{ fontSize: "1rem" }}>
            {t("admin.queuePending", { pending: queuePending })}
            <br />
            {t("admin.queueRunning", { running: queueRunning })}
          </div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.identifyUsageToday")}</div>
          <div className="value">
            {String(data.identifyUsageToday)} / {String(data.identifyDailyLimit)}
          </div>
          <div className="admin-muted" style={{ marginTop: "0.35rem" }}>
            {t("admin.identifyUsageTodayHint")}
          </div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.storage.db")}</div>
          <div className="value">{bytes(storage?.databaseBytes)}</div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.storage.uploads")}</div>
          <div className="value">{bytes(storage?.uploadsBytes)}</div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.nav.rarityCache")}</div>
          <div className="value">{Number(data.rarityCacheCount ?? 0)}</div>
          <div className="admin-muted" style={{ marginTop: "0.35rem" }}>
            <Link to="/admin/rarity-cache">{t("admin.rarityCache.open")}</Link>
          </div>
        </div>
      </div>

      <div className="admin-panel">
        <strong>{t("admin.obsStatus")}</strong>
        <table className="admin-table" style={{ marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th>{t("admin.col.status")}</th>
              <th>{t("admin.col.count")}</th>
            </tr>
          </thead>
          <tbody>
            {statusOrder.map((st) => (
              <tr key={st}>
                <td>{obsStatusLabel(st)}</td>
                <td>{byStatus[st] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <strong>{t("admin.flags")}</strong>
        <table className="admin-table" style={{ marginTop: "0.5rem" }}>
          <tbody>
            {Object.entries(flags).map(([k, v]) => (
              <tr key={k}>
                <td>{flagLabel(k)}</td>
                <td className={v ? (k === "devAuth" || k === "identifyMock" || k === "sessionSecretIsDefault" ? "admin-err" : "") : ""}>
                  {v ? t("admin.flag.on") : t("admin.flag.off")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel" style={{ maxWidth: "960px" }}>
        <strong>{t("admin.identifyRoute")}</strong>
        <p className="admin-muted">{t("admin.identifyRoute.hint")}</p>
        {identifyRoute ? (
          <>
            <div className="admin-cards" style={{ marginTop: "0.75rem" }}>
              <div className="admin-card">
                <div className="label">{t("admin.identifyRoute.active")}</div>
                <div
                  className={
                    identifyRoute.activeProvider === "none"
                      ? "value admin-route-none"
                      : identifyRoute.usingTokenhubFallback || identifyRoute.usingZhipuFallback
                        ? "value admin-route-fallback"
                        : "value admin-route-on"
                  }
                >
                  {identifyRouteActiveLabel(String(identifyRoute.activeProvider ?? "gemini"))}
                </div>
              </div>
            </div>
            <p>{identifyRouteReasonLabel(String(identifyRoute.reason ?? ""))}</p>
            {(identifyRoute.usingTokenhubFallback || identifyRoute.usingZhipuFallback) &&
            identifyRoute.gemini?.successAtExhaust != null ? (
              <p>
                {t("admin.identifyRoute.switched", {
                  count: Number(identifyRoute.gemini.successAtExhaust),
                })}
              </p>
            ) : null}
            {!(identifyRoute.usingTokenhubFallback || identifyRoute.usingZhipuFallback) &&
            identifyRoute.gemini?.exhaustedAt ? (
              <p>
                {t("admin.identifyRoute.exhaustedToday", {
                  count: Number(identifyRoute.gemini.successAtExhaust ?? 0),
                })}
              </p>
            ) : null}
          </>
        ) : null}
        <table className="admin-table" style={{ marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th>{t("admin.col.service")}</th>
              <th>{t("admin.identifyRoute.todaySuccess")}</th>
              <th>{t("admin.identifyRoute.todayFail")}</th>
              <th>{t("admin.col.status")}</th>
              <th>{t("admin.provider.coolUntil")}</th>
              <th>{t("admin.provider.lastOk")}</th>
            </tr>
          </thead>
          <tbody>
            {["gemini", "tokenhub"].map((name) => {
              const p = providers[name] ?? {};
              return (
                <tr key={name}>
                  <td>
                    {identifyProviderName(name)}{" "}
                    <span className="admin-muted">
                      ({p.configured ? t("admin.provider.configured") : t("admin.provider.notConfigured")})
                    </span>
                  </td>
                  <td>{Number(p.todaySuccess ?? 0)}</td>
                  <td>{Number(p.todayFail ?? 0)}</td>
                  <td>{providerStatusLabel(String(p.status ?? ""))}</td>
                  <td>
                    {p.coolUntil
                      ? formatAdminTime(p.coolUntil)
                      : t("admin.provider.notCooling")}
                  </td>
                  <td>
                    {p.lastOkAt ? formatAdminTime(p.lastOkAt) : t("admin.provider.neverOk")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {identifyRoute?.vlModels?.length ? (
          <>
            <p className="admin-muted" style={{ marginTop: "0.85rem" }}>
              {t("admin.identifyRoute.vlChain")}
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.obs.identifyModel")}</th>
                  <th>{t("admin.col.status")}</th>
                  <th>{t("admin.provider.coolUntil")}</th>
                  <th>{t("admin.provider.lastOk")}</th>
                </tr>
              </thead>
              <tbody>
                {identifyRoute.vlModels.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td>{providerStatusLabel(String(row.status ?? "ok"))}</td>
                    <td>
                      {row.coolUntil
                        ? formatAdminTime(row.coolUntil)
                        : t("admin.provider.notCooling")}
                    </td>
                    <td>
                      {row.lastOkAt ? formatAdminTime(row.lastOkAt) : t("admin.provider.neverOk")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>

      <h2>{t("admin.recentFailed")}</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.col.obsId")}</th>
            <th>{t("admin.col.user")}</th>
            <th>{t("admin.error.code")}</th>
            <th>{t("admin.col.updatedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {recentFailed.map((r) => {
            const ex = explainObsError(r.error);
            const userLabel = r.userEmail
              ? String(r.userEmail)
              : r.userId
                ? String(r.userId).slice(0, 8)
                : "—";
            return (
              <tr key={r.id}>
                <td>
                  <Link to={`/admin/observations/${r.id}`}>{r.id.slice(0, 8)}</Link>
                </td>
                <td>
                  {r.userId ? (
                    <Link to={`/admin/users/${r.userId}`}>{userLabel}</Link>
                  ) : (
                    userLabel
                  )}
                </td>
                <td>{ex.title}</td>
                <td>{formatAdminTime(r.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function UsersPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = useState("");

  async function load(query?: string) {
    setErr("");
    try {
      const r = await adminApi.users(query);
      setItems(r.items as Array<Record<string, unknown>>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <h1>{t("admin.nav.users")}</h1>
      <p className="admin-muted">{t("admin.timeHint")}</p>
      <div className="admin-toolbar">
        <input placeholder={t("admin.placeholder.email")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => load(q)}>
          {t("admin.search")}
        </button>
      </div>
      {err ? <p className="admin-err">{err}</p> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.col.email")}</th>
            <th>{t("admin.col.displayName")}</th>
            <th>{t("admin.col.usageToday")}</th>
            <th>{t("admin.col.byok")}</th>
            <th>{t("admin.col.created")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={String(u.id)}>
              <td>
                <Link to={`/admin/users/${u.id}`}>{String(u.email)}</Link>
              </td>
              <td>{String(u.displayName ?? "")}</td>
              <td>{String(u.identifyUsageToday)}</td>
              <td>{yesNo(u.identifyUseOwnKey)}</td>
              <td>{formatAdminTime(u.createdAt == null ? null : String(u.createdAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function UserDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [pwd, setPwd] = useState("");
  const [usage, setUsage] = useState("0");
  const [msg, setMsg] = useState("");

  async function reload() {
    if (!id) return;
    setData(await adminApi.user(id));
  }

  useEffect(() => {
    void reload().catch((e) => setMsg(String(e.message ?? e)));
  }, [id]);

  useEffect(() => {
    const q = data?.identifyQuota as { used?: number } | undefined;
    if (typeof q?.used === "number") setUsage(String(q.used));
  }, [data]);

  if (!data) return <p className="admin-muted">{msg || t("app.loading")}</p>;
  const user = data.user as Record<string, unknown>;
  const trips = (data.trips ?? []) as Array<{ id: string; title: string; createdAt: string }>;
  const quota = (data.identifyQuota ?? {}) as Record<string, unknown>;
  const byStatus = (data.observationsByStatus ?? {}) as Record<string, number>;
  const statusOrder = ["analyzing", "pending_settle", "settled", "failed"];

  return (
    <>
      <h1>{String(user.email)}</h1>
      <div className="admin-panel" style={{ maxWidth: "960px" }}>
        <Kv
          rows={[
            [t("admin.col.email"), dash(user.email)],
            [t("admin.col.displayName"), dash(user.displayName)],
            [t("admin.user.id"), <span className="admin-muted">{dash(user.id)}</span>],
            [t("admin.col.created"), formatAdminTime(user.createdAt == null ? null : String(user.createdAt))],
            [t("admin.user.ownKey"), yesNo(user.identifyUseOwnKey)],
            [t("admin.user.ownKeyHint"), dash(user.identifyUserKeyHint)],
            [t("admin.user.ownKeyBaseUrl"), dash(user.identifyUserBaseUrl)],
            [t("admin.user.ownKeyModel"), dash(user.identifyUserModel)],
            [t("admin.user.collectionCount"), dash(data.collectionCount)],
            [
              t("admin.obsStatus"),
              statusOrder.map((st) => `${obsStatusLabel(st)} ${byStatus[st] ?? 0}`).join(" · "),
            ],
            [t("admin.user.quotaDay"), formatAdminTime(quota.day == null ? null : String(quota.day))],
            [t("admin.user.quotaUsed"), dash(quota.used)],
            [t("admin.user.quotaLimit"), dash(quota.limit)],
            [t("admin.user.quotaRemaining"), dash(quota.remaining)],
            [t("admin.user.quotaExhausted"), yesNo(quota.exhausted)],
          ]}
        />
        <label>{t("admin.resetPassword")}</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.resetPassword(String(user.id), pwd);
            setMsg(t("admin.passwordResetOk"));
            setPwd("");
          }}
        >
          {t("admin.resetPasswordAction")}
        </button>
        <label>{t("admin.usageToday")}</label>
        <input value={usage} onChange={(e) => setUsage(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.setUsage(String(user.id), Number(usage));
            setMsg(t("admin.usageUpdated"));
            await reload();
          }}
        >
          {t("admin.writeUsage")}
        </button>
        <p>
          <button type="button" onClick={() => adminApi.clearByok(String(user.id)).then(reload)}>
            {t("admin.clearByok")}
          </button>{" "}
          <button
            type="button"
            onClick={async () => {
              if (!confirm(t("admin.deleteUserConfirm", { email: String(user.email) }))) return;
              await adminApi.deleteUser(String(user.id));
              nav("/admin/users");
            }}
          >
            {t("admin.deleteUser")}
          </button>
        </p>
        {msg ? <p className="admin-ok">{msg}</p> : null}
      </div>
      <h2>{t("admin.trips")}</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.col.title")}</th>
            <th>{t("admin.col.createdTrip")}</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((tr) => (
            <tr key={tr.id}>
              <td>{tr.title}</td>
              <td>{formatAdminTime(tr.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ObservationsPage() {
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [hasError, setHasError] = useState(false);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  async function load() {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (email.trim()) params.email = email.trim();
    if (hasError) params.hasError = "1";
    const r = await adminApi.observations(params);
    setItems(r.items as Array<Record<string, unknown>>);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <h1>{t("admin.nav.observations")}</h1>
      <p className="admin-muted">{t("admin.timeHint")}</p>
      <div className="admin-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("admin.allStatus")}</option>
          <option value="analyzing">{obsStatusLabel("analyzing")}</option>
          <option value="pending_settle">{obsStatusLabel("pending_settle")}</option>
          <option value="settled">{obsStatusLabel("settled")}</option>
          <option value="failed">{obsStatusLabel("failed")}</option>
        </select>
        <input placeholder={t("admin.placeholder.emailExact")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>
          <input type="checkbox" checked={hasError} onChange={(e) => setHasError(e.target.checked)} /> {t("admin.hasError")}
        </label>
        <button type="button" onClick={() => load()}>
          {t("admin.filter")}
        </button>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.col.photo")}</th>
            <th>{t("admin.col.status")}</th>
            <th>{t("admin.col.user")}</th>
            <th>{t("admin.col.name")}</th>
            <th>{t("admin.error.code")}</th>
            <th>{t("admin.col.updatedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => {
            const ex = explainObsError(o.error == null ? null : String(o.error));
            const userLabel = o.userEmail
              ? String(o.userEmail)
              : o.userId
                ? String(o.userId).slice(0, 8)
                : "—";
            return (
            <tr key={String(o.id)}>
              <td>
                <img className="admin-thumb" src={String(o.displayUrl)} alt="" />
              </td>
              <td>
                <Link to={`/admin/observations/${o.id}`}>{obsStatusLabel(String(o.status))}</Link>
              </td>
              <td>
                {o.userId ? (
                  <Link to={`/admin/users/${String(o.userId)}`}>{userLabel}</Link>
                ) : (
                  userLabel
                )}
              </td>
              <td>
                {String(o.commonName ?? "")} {String(o.scientificName ?? "")}
              </td>
              <td>{ex.title}</td>
              <td>{formatAdminTime(o.updatedAt == null ? null : String(o.updatedAt))}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function ObservationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState("");

  async function reload() {
    if (!id) return;
    setData(await adminApi.observation(id));
  }

  useEffect(() => {
    void reload().catch((e) => setMsg(String(e.message ?? e)));
  }, [id]);

  if (!data) return <p className="admin-muted">{msg || t("app.loading")}</p>;
  const o = data.observation as Record<string, unknown>;
  const owner = data.user as { id?: string; email?: string; displayName?: string | null } | null;
  const ex = explainObsError(o.error == null ? null : String(o.error));
  const coords =
    o.lat != null && o.lng != null ? `${Number(o.lat).toFixed(5)}, ${Number(o.lng).toFixed(5)}` : "—";
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? o.confidence.toFixed(2)
      : dash(o.confidence);

  return (
    <>
      <h1>
        {t("admin.nav.observations")} {String(o.id).slice(0, 8)}
      </h1>
      <div className="admin-panel" style={{ maxWidth: "960px" }}>
        {o.displayUrl ? <img src={String(o.displayUrl)} alt="" style={{ maxWidth: "100%", maxHeight: 320 }} /> : null}
        <Kv
          rows={[
            [t("admin.col.status"), obsStatusLabel(String(o.status ?? ""))],
            [
              t("admin.col.user"),
              owner?.id ? (
                <Link to={`/admin/users/${owner.id}`}>{dash(owner.email ?? owner.displayName)}</Link>
              ) : (
                dash(o.userEmail)
              ),
            ],
            [t("admin.obs.commonName"), dash(o.commonName)],
            [t("admin.obs.scientificName"), dash(o.scientificName)],
            [t("admin.obs.rank"), o.finestReliableRank ? formatRank(String(o.finestReliableRank)) : "—"],
            [t("admin.obs.confidence"), confidence],
            [t("admin.obs.rarity"), rarityLabel(o.rarity == null ? null : String(o.rarity))],
            [t("admin.obs.settleTier"), settleTierLabel(o.settleTier == null ? null : String(o.settleTier))],
            [t("admin.obs.provider"), identifyProviderName(
              o.identifyProvider == null ? null : String(o.identifyProvider),
              o.identifyModel == null ? null : String(o.identifyModel),
            )],
            [t("admin.error.code"), ex.title],
            [t("admin.obs.capturedAt"), formatAdminTime(o.capturedAt == null ? null : String(o.capturedAt))],
            [t("admin.obs.createdAt"), formatAdminTime(o.createdAt == null ? null : String(o.createdAt))],
            [t("admin.col.updatedAt"), formatAdminTime(o.updatedAt == null ? null : String(o.updatedAt))],
            [t("admin.obs.settledAt"), formatAdminTime(o.settledAt == null ? null : String(o.settledAt))],
            [t("admin.obs.location"), dash(o.locationLabel)],
            [t("admin.obs.coords"), coords],
            [t("admin.obs.country"), dash(o.countryCode)],
            [t("admin.obs.countrySource"), countrySourceLabel(o.countrySource == null ? null : String(o.countrySource))],
            [t("admin.obs.locationPrecise"), yesNo(o.locationPrecise)],
            [t("admin.obs.alertIntroduced"), yesNo(o.alertIntroduced)],
            [t("admin.obs.description"), dash(o.description)],
            [t("admin.obs.blurb"), dash(o.blurb)],
            [t("admin.obs.trip"), <span className="admin-muted">{dash(o.tripId)}</span>],
            [t("admin.col.id"), <span className="admin-muted">{dash(o.id)}</span>],
          ]}
        />
        <div className="admin-toolbar">
          <button type="button" onClick={() => adminApi.requeue(String(o.id)).then(() => setMsg(t("admin.requeued")))}>
            {t("admin.requeue")}
          </button>
          <button type="button" onClick={() => adminApi.recomputeSettle(String(o.id)).then(reload)}>
            {t("admin.recomputeSettle")}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm(t("admin.deleteObsConfirm"))) return;
              await adminApi.deleteObservation(String(o.id));
              nav("/admin/observations");
            }}
          >
            {t("admin.delete")}
          </button>
        </div>
        <label>{t("admin.reidentifyHint")}</label>
        <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: "100%" }} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.reidentify(String(o.id), desc);
            setMsg(t("admin.reidentifyOk"));
            await reload();
          }}
        >
          {t("admin.reidentifyAction")}
        </button>
        {msg ? <p className="admin-ok">{msg}</p> : null}
      </div>
    </>
  );
}

function SecretsPage() {
  type SlotRow = {
    id: string;
    kind: "secret" | "setting";
    group: string;
    env: string;
    configured?: boolean;
    hint?: string | null;
    value?: string | number;
    source?: string;
  };

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [slotId, setSlotId] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await adminApi.secrets();
    setData(r);
    const slots = (r.slots as SlotRow[] | undefined) ?? [];
    if (!slotId && slots[0]) setSlotId(slots[0].id);
  }

  useEffect(() => {
    void reload();
  }, []);

  if (!data) return <p className="admin-muted">{t("app.loading")}</p>;
  const slots = (data.slots as SlotRow[] | undefined) ?? [];
  const selected = slots.find((s) => s.id === slotId) ?? null;

  function slotLabel(id: string) {
    const key = `admin.secrets.slot.${id}` as const;
    try {
      return t(key as Parameters<typeof t>[0]);
    } catch {
      return id;
    }
  }

  function groupLabel(g: string) {
    const key = `admin.secrets.group.${g}` as const;
    try {
      return t(key as Parameters<typeof t>[0]);
    } catch {
      return g;
    }
  }

  function sourceLabel(s?: string) {
    if (s === "overlay") return t("admin.secrets.source.overlay");
    if (s === "env") return t("admin.secrets.source.env");
    return t("admin.secrets.source.none");
  }

  return (
    <>
      <h1>{t("admin.nav.secrets")}</h1>
      <div className="admin-panel">
        <p className="admin-muted">{t("admin.secrets.hint")}</p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.secrets.col.name")}</th>
              <th>{t("admin.secrets.col.env")}</th>
              <th>{t("admin.secrets.col.status")}</th>
              <th>{t("admin.secrets.col.source")}</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id} className={s.id === slotId ? "admin-row-active" : undefined}>
                <td>
                  <button type="button" className="admin-linkish" onClick={() => setSlotId(s.id)}>
                    [{groupLabel(s.group)}] {slotLabel(s.id)}
                  </button>
                </td>
                <td className="admin-muted">{s.env}</td>
                <td>
                  {s.kind === "secret"
                    ? s.configured
                      ? t("admin.secrets.configured")
                      : t("admin.secrets.notConfigured")
                    : (
                      <code>{String(s.value ?? "—")}</code>
                    )}
                </td>
                <td>{sourceLabel(s.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel">
        <label>{t("admin.secrets.pickSlot")}</label>
        <select
          value={slotId}
          onChange={(e) => {
            setSlotId(e.target.value);
            setValue("");
            setMsg("");
          }}
          style={{ display: "block", width: "100%", maxWidth: 480, marginTop: 4 }}
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              [{groupLabel(s.group)}] {slotLabel(s.id)}
            </option>
          ))}
        </select>
        <label>{t("admin.secrets.newValue")}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ display: "block", width: "100%", maxWidth: 480 }}
          autoComplete="off"
          spellCheck={false}
        />
        {selected?.kind === "setting" ? (
          <p className="admin-muted" style={{ marginTop: 6 }}>
            {t("admin.secrets.currentValue")}：<code>{String(selected.value ?? "—")}</code>
          </p>
        ) : null}
        <p className="admin-toolbar">
          <button
            type="button"
            disabled={busy || !slotId}
            onClick={async () => {
              setBusy(true);
              try {
                const payloadValue =
                  selected?.kind === "setting" && selected.id.includes("Limit")
                    ? Number(value)
                    : selected?.kind === "setting" && selected.id.includes("Concurrency")
                      ? Number(value)
                      : value;
                await adminApi.patchSecrets({ id: slotId, value: payloadValue });
                setValue("");
                setMsg(t("admin.saved"));
                await reload();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("admin.secrets.save")}
          </button>
          <button
            type="button"
            disabled={busy || !slotId || selected?.source !== "overlay"}
            onClick={async () => {
              setBusy(true);
              try {
                await adminApi.patchSecrets({ id: slotId, value: null });
                setValue("");
                setMsg(t("admin.secrets.cleared"));
                await reload();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("admin.secrets.clear")}
          </button>
        </p>
        {msg ? <p className={msg === t("admin.saved") || msg === t("admin.secrets.cleared") ? "admin-ok" : "admin-err"}>{msg}</p> : null}
        {data.sessionSecretIsDefault ? (
          <p className="admin-err">{t("admin.sessionSecretDefaultWarn")}</p>
        ) : null}
      </div>
    </>
  );
}

function StoragePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setData(await adminApi.storage());
  }

  useEffect(() => {
    void reload();
  }, []);

  if (!data) return <p className="admin-muted">{t("app.loading")}</p>;

  const orphans = (data.orphans ?? []) as Array<{ id: string; bytes?: number } | string>;
  const orphanRows = orphans.map((o) =>
    typeof o === "string" ? { id: o, bytes: 0 } : { id: o.id, bytes: Number(o.bytes ?? 0) },
  );
  const missing = (data.missing ?? []) as Array<{
    id: string;
    displayPath: string;
    originalPath?: string | null;
    displayMissing?: boolean;
    originalMissing?: boolean;
  }>;
  const backup = data.backup as {
    configured?: boolean;
    dir?: string | null;
    latest?: { name: string; bytes: number; mtimeMs: number } | null;
  };

  function missingLabel(row: (typeof missing)[0]) {
    const d = Boolean(row.displayMissing);
    const o = Boolean(row.originalMissing);
    if (d && o) return t("admin.storage.missingBoth");
    if (d) return t("admin.storage.missingDisplay");
    if (o) return t("admin.storage.missingOriginal");
    // 旧 API 未带标志时：有记录即视为缺文件
    return t("admin.storage.missingDisplay");
  }

  return (
    <>
      <h1>{t("admin.nav.storage")}</h1>
      <div className="admin-cards">
        <div className="admin-card">
          <div className="label">{t("admin.storage.db")}</div>
          <div className="value">{bytes(data.databaseBytes)}</div>
        </div>
        <div className="admin-card">
          <div className="label">{t("admin.storage.uploads")}</div>
          <div className="value">{bytes(data.uploadsBytes)}</div>
        </div>
      </div>

      {(() => {
        const host = data.host as {
          hostname?: string;
          uptimeSec?: number;
          loadAvg?: number[];
          memory?: { totalBytes: number; freeBytes: number; usedBytes: number; usedRatio: number };
          disk?: {
            path: string;
            totalBytes: number;
            freeBytes: number;
            usedBytes: number;
            usedRatio: number;
          } | null;
        } | null;
        if (!host) return null;
        const mem = host.memory;
        const disk = host.disk;
        const uptimeSec = Number(host.uptimeSec ?? 0);
        const uptimeLabel =
          uptimeSec >= 86400
            ? `${Math.floor(uptimeSec / 86400)} 天 ${Math.floor((uptimeSec % 86400) / 3600)} 小时`
            : uptimeSec >= 3600
              ? `${Math.floor(uptimeSec / 3600)} 小时 ${Math.floor((uptimeSec % 3600) / 60)} 分`
              : `${Math.floor(uptimeSec / 60)} 分`;
        return (
          <div className="admin-panel">
            <strong>{t("admin.storage.hostTitle")}</strong>
            <p className="admin-muted">
              {t("admin.storage.hostHint")}
              {host.hostname ? ` · ${host.hostname}` : ""}
            </p>
            <table className="admin-table">
              <tbody>
                <tr>
                  <td>{t("admin.storage.disk")}</td>
                  <td>
                    {disk ? (
                      <>
                        {t("admin.storage.usedOfTotal", {
                          used: bytes(disk.usedBytes),
                          total: bytes(disk.totalBytes),
                          pct: Math.round(disk.usedRatio * 100),
                        })}
                        <div className="admin-muted">
                          {t("admin.storage.free", { free: bytes(disk.freeBytes) })} · {disk.path}
                        </div>
                        <div className="admin-meter">
                          <div
                            className="admin-meter-fill"
                            style={{ width: `${Math.min(100, Math.round(disk.usedRatio * 100))}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      t("admin.storage.diskUnavailable")
                    )}
                  </td>
                </tr>
                <tr>
                  <td>{t("admin.storage.memory")}</td>
                  <td>
                    {mem ? (
                      <>
                        {t("admin.storage.usedOfTotal", {
                          used: bytes(mem.usedBytes),
                          total: bytes(mem.totalBytes),
                          pct: Math.round(mem.usedRatio * 100),
                        })}
                        <div className="admin-muted">
                          {t("admin.storage.free", { free: bytes(mem.freeBytes) })}
                        </div>
                        <div className="admin-meter">
                          <div
                            className="admin-meter-fill"
                            style={{ width: `${Math.min(100, Math.round(mem.usedRatio * 100))}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                <tr>
                  <td>{t("admin.storage.loadAvg")}</td>
                  <td>
                    {(host.loadAvg ?? []).map((n) => Number(n).toFixed(2)).join(" / ") || "—"}
                  </td>
                </tr>
                <tr>
                  <td>{t("admin.storage.uptime")}</td>
                  <td>{uptimeLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      <div className="admin-panel">
        <strong>{t("admin.storage.backupTitle")}</strong>
        <p className="admin-muted">{t("admin.storage.backupHint")}</p>
        {backup?.configured ? (
          backup.latest ? (
            <p>
              {backup.latest.name} · {bytes(backup.latest.bytes)} ·{" "}
              {formatAdminTime(backup.latest.mtimeMs)}
            </p>
          ) : (
            <p className="admin-muted">{t("admin.storage.backupNone")}</p>
          )
        ) : (
          <p className="admin-muted">{t("admin.storage.backupNotConfigured")}</p>
        )}
      </div>

      <div className="admin-panel">
        <strong>
          {t("admin.storage.orphanTitle")}（{orphanRows.length}）
        </strong>
        <p className="admin-muted">{t("admin.storage.orphanHint")}</p>
        {orphanRows.length === 0 ? (
          <p className="admin-muted">{t("admin.storage.orphanEmpty")}</p>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.col.obsId")}</th>
                  <th>{t("admin.storage.col.size")}</th>
                </tr>
              </thead>
              <tbody>
                {orphanRows.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id}</td>
                    <td>{bytes(o.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="admin-toolbar">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      t("admin.storage.deleteOrphansConfirm", { count: orphanRows.length }),
                    )
                  ) {
                    return;
                  }
                  setBusy(true);
                  try {
                    const r = (await adminApi.deleteOrphans(orphanRows.map((o) => o.id))) as {
                      deleted?: string[];
                      skipped?: string[];
                    };
                    setMsg(
                      `${t("admin.deleted")} ${r.deleted?.length ?? 0}` +
                        (r.skipped?.length
                          ? ` · ${t("admin.skipped", { count: r.skipped.length })}`
                          : ""),
                    );
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("admin.storage.deleteOrphans")}
              </button>
            </p>
          </>
        )}
      </div>

      <div className="admin-panel">
        <strong>
          {t("admin.storage.missingTitle")}（{missing.length}）
        </strong>
        <p className="admin-muted">{t("admin.storage.missingHint")}</p>
        {missing.length === 0 ? (
          <p className="admin-muted">{t("admin.storage.missingEmpty")}</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.col.obsId")}</th>
                <th>{t("admin.storage.col.what")}</th>
                <th>{t("admin.col.path")}</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/admin/observations/${m.id}`}>{m.id.slice(0, 8)}</Link>
                  </td>
                  <td>{missingLabel(m)}</td>
                  <td className="admin-muted">
                    {m.displayPath}
                    {m.originalPath ? ` · ${m.originalPath}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {msg ? <p className="admin-ok">{msg}</p> : null}
      </div>
    </>
  );
}

function AuditPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    void adminApi.audit().then((r) => setItems(r.items as Array<Record<string, unknown>>));
  }, []);
  return (
    <>
      <h1>{t("admin.nav.audit")}</h1>
      <p className="admin-muted">{t("admin.timeHint")}</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t("admin.col.time")}</th>
            <th>{t("admin.col.admin")}</th>
            <th>{t("admin.col.action")}</th>
            <th>{t("admin.col.target")}</th>
            <th>{t("admin.col.summary")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={String(r.id)}>
              <td>{formatAdminTime(r.createdAt == null ? null : String(r.createdAt))}</td>
              <td>{String(r.adminUsername)}</td>
              <td>{auditActionLabel(String(r.action))}</td>
              <td>
                {auditTargetTypeLabel(r.targetType == null ? null : String(r.targetType))}{" "}
                <span className="admin-muted">{String(r.targetId ?? "")}</span>
              </td>
              <td>
                {String(r.summary ?? "") === "login ok"
                  ? t("admin.audit.loginOk")
                  : dash(r.summary)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RarityCachePage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<RarityCacheItem[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<RarityCacheEntry | null>(null);

  async function load(query = q) {
    setErr("");
    const r = await adminApi.rarityCache({ q: query.trim() });
    setItems(r.items);
    setTotal(r.total);
  }

  useEffect(() => {
    load("").catch((e) => setErr(String(e.message ?? e)));
  }, []);

  async function toggleObs(key: string) {
    if (expanded === key) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setErr("");
    const entry = await adminApi.rarityCacheEntry(key);
    setExpanded(key);
    setDetail(entry);
  }

  async function remove(key: string) {
    if (!confirm(t("admin.rarityCache.deleteConfirm"))) return;
    setBusyKey(key);
    setErr("");
    setMsg("");
    try {
      await adminApi.deleteRarityCache(key);
      setMsg(t("admin.rarityCache.deleted"));
      if (expanded === key) {
        setExpanded(null);
        setDetail(null);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function rescore(key: string) {
    if (!confirm(t("admin.rarityCache.rescoreConfirm"))) return;
    setBusyKey(key);
    setErr("");
    setMsg("");
    try {
      const r = await adminApi.rescoreRarityCache(key);
      setMsg(
        t("admin.rarityCache.rescored", {
          previous: r.previousRarity ?? "—",
          next: r.rarity,
          obs: r.observationsUpdated,
          col: r.collectionsUpdated,
        }),
      );
      await load();
      if (expanded === key) {
        setDetail(await adminApi.rarityCacheEntry(key));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function recompute() {
    if (!confirm(t("admin.rarityCache.recomputeConfirm"))) return;
    setBusyKey("+");
    setErr("");
    setMsg("");
    try {
      const r = await adminApi.recomputeRarityCache();
      setMsg(
        r.failed.length
          ? t("admin.rarityCache.recomputeFailed", { done: r.processed })
          : t("admin.rarityCache.recomputed", { done: r.processed, left: r.remaining }),
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function clearAll() {
    if (!confirm(t("admin.rarityCache.clearAllConfirm", { count: total }))) return;
    setBusyKey("*");
    setErr("");
    setMsg("");
    try {
      await adminApi.clearRarityCache({ all: true });
      setMsg(t("admin.rarityCleared"));
      setExpanded(null);
      setDetail(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <h1>{t("admin.nav.rarityCache")}</h1>
      <p className="admin-muted">{t("admin.rarityCache.hint")}</p>
      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          load().catch((ex) => setErr(String(ex.message ?? ex)));
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("admin.rarityCache.search")}
          style={{ minWidth: "16rem" }}
        />
        <button type="submit">{t("admin.search")}</button>
        <button type="button" onClick={() => void recompute()} disabled={busyKey !== null}>
          {busyKey === "+" ? t("admin.rarityCache.recomputing") : t("admin.rarityCache.recompute")}
        </button>
        <button type="button" onClick={() => void clearAll()} disabled={busyKey !== null || total === 0}>
          {t("admin.clearRarityCache")}
        </button>
        <span className="admin-muted">{t("admin.col.count")}: {total}</span>
      </form>
      <p className="admin-muted">{t("admin.rarityCache.recomputeHint")}</p>
      {err ? <p className="admin-err">{err}</p> : null}
      {msg ? <p className="admin-ok">{msg}</p> : null}
      {items.length === 0 ? (
        <p className="admin-muted">{t("admin.rarityCache.empty")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.rarityCache.taxon")}</th>
              <th>{t("admin.rarityCache.country")}</th>
              <th>{t("admin.obs.rarity")}</th>
              <th>{t("admin.rarityCache.score")}</th>
              <th>{t("admin.rarityCache.model")}</th>
              <th>{t("admin.rarityCache.samples")}</th>
              <th>{t("admin.rarityCache.source")}</th>
              <th>{t("admin.rarityCache.fetchedAt")}</th>
              <th>{t("admin.rarityCache.obsCount")}</th>
              <th>{t("admin.col.action")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const busy = busyKey === row.cacheKey || busyKey === "*";
              return (
                <Fragment key={row.cacheKey}>
                  <tr className={expanded === row.cacheKey ? "admin-row-active" : undefined}>
                    <td>
                      <div>{dash(row.taxonKey)}</div>
                      <div className="admin-muted" style={{ wordBreak: "break-all" }}>
                        {row.cacheKey}
                      </div>
                    </td>
                    <td>{dash(row.countryCode)}</td>
                    <td>{rarityLabel(row.rarity)}</td>
                    <td>{row.score == null ? "—" : Math.round(row.score * 100) / 100}</td>
                    <td>{dash(row.model)}</td>
                    <td>{row.samples ?? "—"}</td>
                    <td>{row.source}</td>
                    <td>{formatAdminTime(row.fetchedAt)}</td>
                    <td>{row.observationCount}</td>
                    <td>
                      <div className="admin-toolbar" style={{ margin: 0 }}>
                        <button type="button" disabled={busy} onClick={() => void toggleObs(row.cacheKey)}>
                          {expanded === row.cacheKey
                            ? t("admin.rarityCache.hideObs")
                            : t("admin.rarityCache.showObs")}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void rescore(row.cacheKey)}>
                          {busyKey === row.cacheKey
                            ? t("admin.rarityCache.rescoring")
                            : t("admin.rarityCache.rescore")}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void remove(row.cacheKey)}>
                          {t("admin.rarityCache.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === row.cacheKey && detail?.cacheKey === row.cacheKey ? (
                    <tr>
                      <td colSpan={10}>
                        <RarityScaleDetail detail={detail} />
                        {detail.observations.length === 0 ? (
                          <p className="admin-muted">{t("admin.none")}</p>
                        ) : (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>{t("admin.col.obsId")}</th>
                                <th>{t("admin.obs.commonName")}</th>
                                <th>{t("admin.obs.scientificName")}</th>
                                <th>{t("admin.obs.rarity")}</th>
                                <th>{t("admin.col.status")}</th>
                                <th>{t("admin.obs.country")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.observations.map((o) => (
                                <tr key={o.id}>
                                  <td>
                                    <Link to={`/admin/observations/${o.id}`}>{o.id.slice(0, 8)}</Link>
                                  </td>
                                  <td>{dash(o.commonName)}</td>
                                  <td>{dash(o.scientificName)}</td>
                                  <td>{rarityLabel(o.rarity)}</td>
                                  <td>{obsStatusLabel(o.status)}</td>
                                  <td>{dash(o.countryCode)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

/** 判据留痕：12 题答案 + 加减明细 + 模型理由。档位不合意时不用翻库就能看出哪一题答歪了。 */
function RarityScaleDetail({ detail }: { detail: RarityCacheEntry }) {
  const triLabel = (v: boolean | null) =>
    v === true
      ? t("admin.rarityCache.itemYes")
      : v === false
        ? t("admin.rarityCache.itemNo")
        : t("admin.rarityCache.itemSkip");
  const items = detail.items ? Object.entries(detail.items) : [];
  const reasons = Object.entries(detail.reasons ?? {});
  if (items.length === 0 && detail.adjustments.length === 0 && reasons.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      {detail.listLevel ? (
        <p className="admin-muted">
          {t("admin.rarityCache.listLevel")}: {detail.listLevel}
        </p>
      ) : null}
      {detail.adjustments.length > 0 ? (
        <p className="admin-muted">
          {t("admin.rarityCache.adjustments")}: {detail.adjustments.join("  ")}
        </p>
      ) : null}
      {items.length > 0 ? (
        <p className="admin-muted" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          {items.map(([key, value]) => (
            <span key={key}>
              {key}=<strong>{triLabel(value)}</strong>
            </span>
          ))}
        </p>
      ) : null}
      {reasons.map(([batch, reason]) => (
        <p key={batch} className="admin-muted">
          {batch}: {reason}
        </p>
      ))}
    </div>
  );
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    adminApi
      .me()
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="admin-root">
        <p className="admin-muted" style={{ padding: "2rem" }}>
          {t("app.loading")}
        </p>
      </div>
    );
  }

  if (!admin) return <Login onOk={setAdmin} />;

  return (
    <Shell admin={admin} onLogout={() => setAdmin(null)}>
      <Routes>
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/users/:id" element={<UserDetailPage />} />
        <Route path="/admin/observations" element={<ObservationsPage />} />
        <Route path="/admin/observations/:id" element={<ObservationDetailPage />} />
        <Route path="/admin/rarity-cache" element={<RarityCachePage />} />
        <Route path="/admin/secrets" element={<SecretsPage />} />
        <Route path="/admin/storage" element={<StoragePage />} />
        <Route path="/admin/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}
