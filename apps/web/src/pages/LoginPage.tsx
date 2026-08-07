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

  return (
    <div className="login-screen">
      <div className="panel login-card stack">
        <h1 className="brand">{t("app.name")}</h1>
        <p className="lede">{t("app.tagline")}</p>

        <div className="login-mode-row">
          <button
            type="button"
            className={`btn secondary${mode === "login" ? " active" : ""}`}
            onClick={() => switchMode("login")}
            disabled={busy}
          >
            {t("auth.login")}
          </button>
          <button
            type="button"
            className={`btn secondary${mode === "register" ? " active" : ""}`}
            onClick={() => switchMode("register")}
            disabled={busy}
          >
            {t("auth.register")}
          </button>
        </div>

        <form className="stack" onSubmit={onSubmit}>
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

          {mode === "register" ? (
            <label className="stack" style={{ gap: "0.35rem" }}>
              <span className="muted">{t("auth.displayNameLabel")}</span>
              <input
                className="input"
                type="text"
                autoComplete="nickname"
                maxLength={40}
                placeholder={t("auth.displayNamePlaceholder")}
                value={displayName}
                onChange={(ev) => setDisplayName(ev.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          {mode === "reset" && resetCodeSent ? (
            <label className="stack" style={{ gap: "0.35rem" }}>
              <span className="muted">{t("auth.resetCodeLabel")}</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
                placeholder={t("auth.resetCodePlaceholder")}
                value={resetCode}
                onChange={(ev) => setResetCode(ev.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          {mode !== "reset" || resetCodeSent ? (
            <label className="stack" style={{ gap: "0.35rem" }}>
              <span className="muted">
                {mode === "reset" ? t("auth.newPasswordLabel") : t("auth.passwordLabel")}
              </span>
              <input
                className="input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required={mode !== "reset" || resetCodeSent}
                minLength={8}
                placeholder={t("auth.passwordPlaceholder")}
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
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => switchMode("reset")}
          >
            {t("auth.forgotPassword")}
          </button>
        ) : mode === "reset" ? (
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => switchMode("login")}
          >
            {t("auth.backToLogin")}
          </button>
        ) : null}

        {info ? <p className="muted">{info}</p> : null}
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
