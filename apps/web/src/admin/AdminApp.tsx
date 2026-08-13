import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { t } from "@biotrace/messages";
import { adminApi, type AdminUser } from "./api";
import {
  explainObsError,
  flagLabel,
  formatAdminTime,
  identifyProviderName,
  identifyRouteActiveLabel,
  identifyRouteReasonLabel,
  obsStatusLabel,
  providerStatusLabel,
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
    usingZhipuFallback?: boolean;
    reason?: string;
    gemini?: ProviderRow;
    zhipu?: ProviderRow;
  } | null;
  const providers = (identifyRoute
    ? { gemini: identifyRoute.gemini, zhipu: identifyRoute.zhipu }
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
          <div className="label">DB</div>
          <div className="value">{bytes(storage?.databaseBytes)}</div>
        </div>
        <div className="admin-card">
          <div className="label">uploads</div>
          <div className="value">{bytes(storage?.uploadsBytes)}</div>
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
                <td>
                  {obsStatusLabel(st)} <span className="admin-muted">({st})</span>
                </td>
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
                      : identifyRoute.usingZhipuFallback
                        ? "value admin-route-fallback"
                        : "value admin-route-on"
                  }
                >
                  {identifyRouteActiveLabel(String(identifyRoute.activeProvider ?? "gemini"))}
                </div>
              </div>
            </div>
            <p>{identifyRouteReasonLabel(String(identifyRoute.reason ?? ""))}</p>
            {identifyRoute.usingZhipuFallback && identifyRoute.gemini?.successAtExhaust != null ? (
              <p>
                {t("admin.identifyRoute.switched", {
                  count: Number(identifyRoute.gemini.successAtExhaust),
                })}
              </p>
            ) : null}
            {!identifyRoute.usingZhipuFallback && identifyRoute.gemini?.exhaustedAt ? (
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
            {["gemini", "zhipu"].map((name) => {
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
      </div>

      <h2>{t("admin.recentFailed")}</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>id</th>
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
      <p className="admin-toolbar" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          onClick={() =>
            adminApi.clearRarityCache({ all: true }).then(() => alert(t("admin.rarityCleared")))
          }
        >
          {t("admin.clearRarityCache")}
        </button>
      </p>
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
      <div className="admin-toolbar">
        <input placeholder="email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => load(q)}>
          搜索
        </button>
      </div>
      {err ? <p className="admin-err">{err}</p> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>email</th>
            <th>昵称</th>
            <th>今日用量</th>
            <th>BYOK</th>
            <th>注册</th>
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
              <td>{u.identifyUseOwnKey ? "是" : "否"}</td>
              <td>{String(u.createdAt ?? "")}</td>
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

  if (!data) return <p className="admin-muted">{msg || t("app.loading")}</p>;
  const user = data.user as Record<string, unknown>;
  const trips = (data.trips ?? []) as Array<{ id: string; title: string; createdAt: string }>;
  const quota = data.identifyQuota as Record<string, unknown>;

  return (
    <>
      <h1>{String(user.email)}</h1>
      <div className="admin-panel">
        <pre className="admin-pre">{JSON.stringify({ user, observationsByStatus: data.observationsByStatus, collectionCount: data.collectionCount, identifyQuota: quota }, null, 2)}</pre>
        <label>重置密码（≥8）</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.resetPassword(String(user.id), pwd);
            setMsg("密码已重置");
            setPwd("");
          }}
        >
          重置密码
        </button>
        <label>当日识图已用次数</label>
        <input value={usage} onChange={(e) => setUsage(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.setUsage(String(user.id), Number(usage));
            setMsg("用量已更新");
            await reload();
          }}
        >
          写入用量
        </button>
        <p>
          <button type="button" onClick={() => adminApi.clearByok(String(user.id)).then(reload)}>
            清除 BYOK
          </button>{" "}
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`确认删除用户 ${user.email}？不可恢复`)) return;
              await adminApi.deleteUser(String(user.id));
              nav("/admin/users");
            }}
          >
            删除用户
          </button>
        </p>
        {msg ? <p className="admin-ok">{msg}</p> : null}
      </div>
      <h2>旅途</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>创建</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((tr) => (
            <tr key={tr.id}>
              <td>{tr.title}</td>
              <td>{tr.createdAt}</td>
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
      <div className="admin-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="analyzing">analyzing</option>
          <option value="pending_settle">pending_settle</option>
          <option value="settled">settled</option>
          <option value="failed">failed</option>
        </select>
        <input placeholder="email 精确" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>
          <input type="checkbox" checked={hasError} onChange={(e) => setHasError(e.target.checked)} /> 有 error
        </label>
        <button type="button" onClick={() => load()}>
          筛选
        </button>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>图</th>
            <th>{t("admin.col.status")}</th>
            <th>{t("admin.col.user")}</th>
            <th>名称</th>
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

  return (
    <>
      <h1>观察 {String(o.id).slice(0, 8)}</h1>
      <div className="admin-panel">
        {o.displayUrl ? <img src={String(o.displayUrl)} alt="" style={{ maxWidth: "100%", maxHeight: 320 }} /> : null}
        <pre className="admin-pre">{JSON.stringify(data, null, 2)}</pre>
        <div className="admin-toolbar">
          <button type="button" onClick={() => adminApi.requeue(String(o.id)).then(() => setMsg("已重入队"))}>
            重入队
          </button>
          <button type="button" onClick={() => adminApi.recomputeSettle(String(o.id)).then(reload)}>
            重算 settle
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("删除观察？")) return;
              await adminApi.deleteObservation(String(o.id));
              nav("/admin/observations");
            }}
          >
            删除
          </button>
        </div>
        <label>重识别修正说明</label>
        <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: "100%" }} />
        <button
          type="button"
          onClick={async () => {
            await adminApi.reidentify(String(o.id), desc);
            setMsg("已触发重识别");
            await reload();
          }}
        >
          重识别
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
            当前值：<code>{String(selected.value ?? "—")}</code>
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
          <p className="admin-err">SESSION_SECRET 仍为默认值（危险，请在服务器 .env 修改，不在此页轮换）</p>
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
          <div className="label">DB</div>
          <div className="value">{bytes(data.databaseBytes)}</div>
        </div>
        <div className="admin-card">
          <div className="label">uploads</div>
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
                  <th>观察 ID（目录名）</th>
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
                        (r.skipped?.length ? ` · 跳过 ${r.skipped.length}` : ""),
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
                <th>观察</th>
                <th>{t("admin.storage.col.what")}</th>
                <th>路径</th>
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
      <table className="admin-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>管理员</th>
            <th>动作</th>
            <th>目标</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.createdAt ?? "")}</td>
              <td>{String(r.adminUsername)}</td>
              <td>{String(r.action)}</td>
              <td>
                {String(r.targetType ?? "")} {String(r.targetId ?? "")}
              </td>
              <td>{String(r.summary ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
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
        <Route path="/admin/secrets" element={<SecretsPage />} />
        <Route path="/admin/storage" element={<StoragePage />} />
        <Route path="/admin/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}
