import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { api, type User } from "../api";

export default function LoginPage({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devAuth, setDevAuth] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authError") === "invalid_link") {
      setError(t("auth.invalidLink"));
      window.history.replaceState({}, "", window.location.pathname);
    }
    api
      .health()
      .then((h) => setDevAuth(Boolean(h.devAuth)))
      .catch(() => setDevAuth(false));
  }, []);

  async function requestLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await api.requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function devLogin() {
    setDevBusy(true);
    setError(null);
    try {
      const { user } = await api.devLogin();
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="panel login-card stack">
        <h1 className="brand">{t("app.name")}</h1>
        <p className="lede">{t("app.tagline")}</p>

        <form className="stack" onSubmit={requestLink}>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="muted">{t("auth.emailLabel")}</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={busy}
            />
          </label>
          <button className="btn" type="submit" disabled={busy || !email.trim()}>
            {busy ? t("auth.sending") : t("auth.sendLink")}
          </button>
        </form>

        {sent ? <p className="muted">{t("auth.linkSent")}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {devAuth ? (
          <>
            <button className="btn secondary" type="button" disabled={devBusy} onClick={devLogin}>
              {devBusy ? t("app.loading") : t("auth.devLogin")}
            </button>
            <p className="muted">{t("auth.devHint")}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
