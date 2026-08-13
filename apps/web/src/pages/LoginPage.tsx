import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { api, type User } from "../api";

type Mode = "login" | "register" | "reset";

export default function LoginPage({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devAuth, setDevAuth] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((h) => setDevAuth(Boolean(h.devAuth)))
      .catch(() => setDevAuth(false));
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    setResetCode("");
    setResetCodeSent(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { user } = await api.login(email.trim(), password);
        onLoggedIn(user);
        return;
      }
      if (mode === "register") {
        const { user } = await api.register(email.trim(), password, displayName.trim() || undefined);
        onLoggedIn(user);
        return;
      }
      if (!resetCodeSent) {
        const res = await api.requestPasswordReset(email.trim());
        setInfo(res.message);
        setResetCodeSent(true);
        return;
      }
      const res = await api.resetPassword(email.trim(), resetCode.trim(), password);
      setInfo(res.message);
      setPassword("");
      setResetCode("");
      setResetCodeSent(false);
      setMode("login");
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

  const submitLabel =
    mode === "login"
      ? busy
        ? t("auth.loggingIn")
        : t("auth.login")
      : mode === "register"
        ? busy
          ? t("auth.registering")
          : t("auth.registerAction")
        : resetCodeSent
          ? busy
            ? t("auth.resetting")
            : t("auth.resetAction")
          : busy
            ? t("auth.sending")
            : t("auth.sendResetCode");

  const title =
    mode === "login"
      ? t("app.name")
      : mode === "register"
        ? t("auth.registerAction")
        : t("auth.forgotPassword");

  return (
    <div className="login-screen">
      <div className="login-card stack">
        {mode !== "login" ? (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => switchMode("login")}
          >
            ← {t("auth.backToLogin")}
          </button>
        ) : null}

        <header className="page-head">
          <h1 className="page-title">{title}</h1>
          {mode === "login" ? <p className="lede">{t("auth.lede")}</p> : null}
        </header>

        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span className="muted">{t("auth.emailLabel")}</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={busy}
            />
          </label>

          {mode === "register" ? (
            <label className="field">
              <span className="muted">{t("auth.displayNameLabel")}</span>
              <input
                className="input"
                type="text"
                autoComplete="nickname"
                maxLength={40}
                value={displayName}
                onChange={(ev) => setDisplayName(ev.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          {mode === "reset" && resetCodeSent ? (
            <label className="field">
              <span className="muted">{t("auth.resetCodeLabel")}</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
                value={resetCode}
                onChange={(ev) => setResetCode(ev.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          {mode !== "reset" || resetCodeSent ? (
            <label className="field">
              <span className="muted">
                {mode === "reset" ? t("auth.newPasswordLabel") : t("auth.passwordLabel")}
              </span>
              <input
                className="input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required={mode !== "reset" || resetCodeSent}
                minLength={8}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          <button className="btn" type="submit" disabled={busy || !email.trim()}>
            {submitLabel}
          </button>
        </form>

        {mode === "login" ? (
          <div className="login-links">
            <button type="button" className="text-link" disabled={busy} onClick={() => switchMode("register")}>
              {t("auth.registerAction")}
            </button>
            <button type="button" className="text-link" disabled={busy} onClick={() => switchMode("reset")}>
              {t("auth.forgotPassword")}
            </button>
          </div>
        ) : null}

        {info ? <p className="muted">{info}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {devAuth ? (
          <div className="login-dev">
            <button className="text-link" type="button" disabled={devBusy} onClick={devLogin}>
              {devBusy ? t("app.loading") : t("auth.devLogin")}
            </button>
            <p className="muted">{t("auth.devHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
