import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import {
  api,
  type HealthResponse,
  type IdentifyKeySettings,
  type IdentifyQuota,
  type ProviderHealthSnap,
  type User,
} from "../api";

function providerLine(
  provider: "gemini" | "zhipu",
  snap: ProviderHealthSnap | undefined,
  configuredFallback: boolean | undefined,
) {
  const name = t(
    provider === "gemini" ? "identify.provider.gemini" : "identify.provider.zhipu",
  );
  if (!snap) {
    if (configuredFallback == null) return t("me.geminiUnknown");
    return configuredFallback
      ? provider === "gemini"
        ? t("me.geminiConfigured")
        : t("me.zhipuConfigured")
      : provider === "gemini"
        ? t("me.geminiMissing")
        : t("me.zhipuMissing");
  }
  if (!snap.configured) {
    return provider === "gemini" ? t("me.geminiMissing") : t("me.zhipuMissing");
  }
  const cool = snap.coolUntil ? Math.max(0, snap.coolUntil - Date.now()) : 0;
  if (cool > 0) {
    return t("me.providerCooling", { name, sec: String(Math.ceil(cool / 1000)) });
  }
  return t("me.providerStatus", { name, status: snap.status });
}

export default function MePage({
  user,
  onLogout,
  onUserUpdated,
}: {
  user: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [identifyQuota, setIdentifyQuota] = useState<IdentifyQuota | null>(null);
  const [identifyKey, setIdentifyKey] = useState<IdentifyKeySettings | null>(null);
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user.displayName ?? "");
  }, [user.displayName]);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
    api
      .me()
      .then((res) => {
        setIdentifyQuota(res.identifyQuota ?? null);
        const ik = res.identifyKey ?? null;
        setIdentifyKey(ik);
        if (ik) {
          setUseOwnKey(ik.useOwnKey);
          setBaseUrl(ik.baseUrl ?? "");
          setModel(ik.model ?? "");
        }
      })
      .catch(() => {
        setIdentifyQuota(null);
        setIdentifyKey(null);
      });
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const { user: next } = await api.updateMe(displayName.trim());
      onUserUpdated(next);
      setProfileMsg(t("me.profileSaved"));
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : t("error.server"));
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwErr(null);
    setPwMsg(null);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setPwMsg(res.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : t("error.server"));
    } finally {
      setPwBusy(false);
    }
  }

  async function saveIdentifyKey(e: FormEvent) {
    e.preventDefault();
    setKeyBusy(true);
    setKeyErr(null);
    setKeyMsg(null);
    try {
      const res = await api.updateIdentifyKey({
        useOwnKey,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || null,
        apiKey: apiKey.trim() || undefined,
      });
      setIdentifyKey(res.identifyKey);
      setUseOwnKey(res.identifyKey.useOwnKey);
      setBaseUrl(res.identifyKey.baseUrl ?? "");
      setModel(res.identifyKey.model ?? "");
      setApiKey("");
      setKeyMsg(res.message);
    } catch (err) {
      setKeyErr(err instanceof Error ? err.message : t("error.server"));
    } finally {
      setKeyBusy(false);
    }
  }

  async function clearIdentifyKey() {
    setKeyBusy(true);
    setKeyErr(null);
    setKeyMsg(null);
    try {
      const res = await api.updateIdentifyKey({ clearKey: true });
      setIdentifyKey(res.identifyKey);
      setApiKey("");
      setKeyMsg(res.message);
    } catch (err) {
      setKeyErr(err instanceof Error ? err.message : t("error.server"));
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="brand">{t("me.title")}</h1>
        <p className="lede">{t("me.lede")}</p>
      </div>
      <div className="panel stack">
        <div>
          <strong>{user.displayName?.trim() || user.email}</strong>
          {user.displayName?.trim() ? <p className="muted">{user.email}</p> : null}
          <p className="muted">{t("me.userId", { id: user.id })}</p>
        </div>

        <form className="stack" onSubmit={saveProfile}>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.displayNameLabel")}</span>
            <input
              className="input"
              type="text"
              maxLength={40}
              placeholder={t("me.displayNamePlaceholder")}
              value={displayName}
              onChange={(ev) => setDisplayName(ev.target.value)}
              disabled={profileBusy}
            />
          </label>
          <button className="btn secondary" type="submit" disabled={profileBusy}>
            {profileBusy ? t("me.savingProfile") : t("me.saveProfile")}
          </button>
          {profileMsg ? <p className="muted">{profileMsg}</p> : null}
          {profileErr ? <p className="error">{profileErr}</p> : null}
        </form>

        <form className="stack" onSubmit={changePassword}>
          <strong>{t("me.changePassword")}</strong>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.currentPasswordLabel")}</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(ev) => setCurrentPassword(ev.target.value)}
              disabled={pwBusy}
            />
          </label>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.newPasswordLabel")}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder={t("auth.passwordPlaceholder")}
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              disabled={pwBusy}
            />
          </label>
          <button className="btn secondary" type="submit" disabled={pwBusy}>
            {pwBusy ? t("me.changingPassword") : t("me.changePasswordAction")}
          </button>
          {pwMsg ? <p className="muted">{pwMsg}</p> : null}
          {pwErr ? <p className="error">{pwErr}</p> : null}
        </form>

        <div className="stack" style={{ gap: "0.25rem" }}>
          <p className="muted">
            {identifyQuota == null
              ? null
              : identifyQuota.limited
                ? t("me.identifyQuota", {
                    used: String(identifyQuota.used),
                    limit: String(identifyQuota.limit),
                  })
                : t("me.identifyQuotaUnlimited")}
          </p>
          {identifyQuota?.limited ? <p className="muted">{t("me.identifyQuotaHint")}</p> : null}
        </div>

        <form className="stack" onSubmit={saveIdentifyKey}>
          <strong>{t("me.identifyKeyTitle")}</strong>
          <p className="muted">{t("me.identifyKeyLede")}</p>
          <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={useOwnKey}
              onChange={(ev) => setUseOwnKey(ev.target.checked)}
              disabled={keyBusy}
            />
            <span>{t("me.identifyUseOwnKey")}</span>
          </label>
          {useOwnKey && identifyKey && !identifyKey.ready ? (
            <p className="muted">{t("me.identifyKeyNotReady")}</p>
          ) : null}
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.identifyBaseUrl")}</span>
            <input
              className="input"
              type="url"
              placeholder={t("me.identifyBaseUrlPlaceholder")}
              value={baseUrl}
              onChange={(ev) => setBaseUrl(ev.target.value)}
              disabled={keyBusy}
            />
          </label>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.identifyModel")}</span>
            <input
              className="input"
              type="text"
              placeholder={t("me.identifyModelPlaceholder")}
              value={model}
              onChange={(ev) => setModel(ev.target.value)}
              disabled={keyBusy}
            />
          </label>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("me.identifyApiKey")}</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder={t("me.identifyApiKeyPlaceholder")}
              value={apiKey}
              onChange={(ev) => setApiKey(ev.target.value)}
              disabled={keyBusy}
            />
          </label>
          {identifyKey?.hasKey && identifyKey.keyHint ? (
            <p className="muted">
              {t("me.identifyApiKeySaved", { hint: identifyKey.keyHint })}
            </p>
          ) : null}
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn secondary" type="submit" disabled={keyBusy}>
              {keyBusy ? t("me.identifyKeySaving") : t("me.identifyKeySave")}
            </button>
            {identifyKey?.hasKey ? (
              <button
                className="btn secondary"
                type="button"
                disabled={keyBusy}
                onClick={() => void clearIdentifyKey()}
              >
                {t("me.identifyKeyClear")}
              </button>
            ) : null}
          </div>
          {keyMsg ? <p className="muted">{keyMsg}</p> : null}
          {keyErr ? <p className="error">{keyErr}</p> : null}
        </form>

        <p className="muted">
          {providerLine("gemini", health?.providers?.gemini, health?.geminiConfigured)}
        </p>
        <p className="muted">
          {providerLine("zhipu", health?.providers?.zhipu, health?.zhipuConfigured)}
        </p>
        <button className="btn secondary" onClick={logout}>
          {t("auth.logout")}
        </button>
      </div>
    </div>
  );
}
