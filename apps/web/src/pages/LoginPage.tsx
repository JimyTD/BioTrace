import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";
import { api, type User } from "../api";
import { easeOutCubic, nextPaint, prefersReducedMotion, tween } from "../motion";

type Mode = "login" | "register" | "reset";

export default function LoginPage({
  onLoggedIn,
  onOpened,
}: {
  onLoggedIn: (user: User) => void;
  onOpened?: () => void;
}) {
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
  const [turning, setTurning] = useState(false);
  const pageRef = useRef<HTMLDivElement | null>(null);
  useBackClose(() => switchMode("login"), mode !== "login");

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

  async function openAfterLogin(user: User) {
    onLoggedIn(user);
    if (prefersReducedMotion()) {
      onOpened?.();
      return;
    }
    setTurning(true);
    await nextPaint();
    const page = pageRef.current;
    if (!page) {
      onOpened?.();
      return;
    }
    await tween(780, (t) => {
      page.style.transform = `rotateY(${-118 * easeOutCubic(t)}deg)`;
    });
    await tween(140, (t) => {
      page.style.opacity = String(1 - t);
    });
    onOpened?.();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (turning) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { user } = await api.login(email.trim(), password);
        await openAfterLogin(user);
        return;
      }
      if (mode === "register") {
        const { user } = await api.register(email.trim(), password, displayName.trim() || undefined);
        await openAfterLogin(user);
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
    if (turning) return;
    setDevBusy(true);
    setError(null);
    try {
      const { user } = await api.devLogin();
      await openAfterLogin(user);
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

  const lede =
    mode === "login"
      ? t("auth.lede")
      : mode === "register"
        ? t("auth.registerLede")
        : t("auth.forgotPassword");

  const locked = busy || turning;

  return (
    <div className={turning ? "login-screen is-turning" : "login-screen"}>
      <div className="login-page" ref={pageRef}>
        <div className="login-page-front">
          <div className="login-mast">
            <h1 className="login-brand">{t("app.name")}</h1>
            <p className="lede">{lede}</p>
            <div className="login-rule" aria-hidden />
          </div>

          <div className="login-colophon">
            {mode !== "login" ? (
              <button
                type="button"
                className="text-link"
                disabled={locked}
                onClick={() => switchMode("login")}
              >
                ← {t("auth.backToLogin")}
              </button>
            ) : null}

            <form className="login-form" onSubmit={onSubmit}>
              <label className="field">
                <span className="muted">{t("auth.emailLabel")}</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  disabled={locked}
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
                    disabled={locked}
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
                    disabled={locked}
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
                    disabled={locked}
                  />
                </label>
              ) : null}

              <button className="btn" type="submit" disabled={locked || !email.trim()}>
                {submitLabel}
              </button>
            </form>

            {mode === "login" ? (
              <div className="login-links">
                <button
                  type="button"
                  className="text-link"
                  disabled={locked}
                  onClick={() => switchMode("register")}
                >
                  {t("auth.registerAction")}
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={locked}
                  onClick={() => switchMode("reset")}
                >
                  {t("auth.forgotPassword")}
                </button>
                <Link className="text-link" to="/download">
                  {t("auth.downloadApp")}
                </Link>
              </div>
            ) : null}

            {info ? <p className="muted">{info}</p> : null}
            {error ? <p className="error">{error}</p> : null}

            {devAuth ? (
              <div className="login-dev">
                <button className="text-link" type="button" disabled={devBusy || turning} onClick={devLogin}>
                  {devBusy ? t("app.loading") : t("auth.devLogin")}
                </button>
                <p className="muted">{t("auth.devHint")}</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="login-page-back" aria-hidden />
      </div>
    </div>
  );
}
