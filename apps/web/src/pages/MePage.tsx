import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { api, type HealthResponse, type ProviderHealthSnap, type User } from "../api";

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
