import { useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { MeSubHead } from "../components/MeSubHead";
import { api } from "../api";

export default function MeSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setMsg(res.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("error.server"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack page-me">
      <MeSubHead title={t("me.accountSecurity")} />
      <form className="me-section stack" onSubmit={changePassword}>
        <h2 className="me-section-title">{t("me.changePassword")}</h2>
        <label className="me-field">
          <span className="muted">{t("me.currentPasswordLabel")}</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(ev) => setCurrentPassword(ev.target.value)}
            disabled={busy}
          />
        </label>
        <label className="me-field">
          <span className="muted">{t("me.newPasswordLabel")}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(ev) => setNewPassword(ev.target.value)}
            disabled={busy}
          />
        </label>
        <button className="btn secondary" type="submit" disabled={busy}>
          {busy ? t("me.changingPassword") : t("me.changePasswordAction")}
        </button>
        {msg ? <p className="muted">{msg}</p> : null}
        {err ? <p className="error">{err}</p> : null}
      </form>
    </div>
  );
}
