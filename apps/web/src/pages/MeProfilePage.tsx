import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { MeSubHead } from "../components/MeSubHead";
import { api, type User } from "../api";

export default function MeProfilePage({
  user,
  onUserUpdated,
}: {
  user: User;
  onUserUpdated: (user: User) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user.displayName ?? "");
  }, [user.displayName]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { user: next } = await api.updateMe({ displayName: displayName.trim() });
      onUserUpdated(next);
      setMsg(t("me.profileSaved"));
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("error.server"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack page-me">
      <MeSubHead title={t("me.editProfile")} />
      <form className="me-section stack" onSubmit={saveProfile}>
        <p className="muted">{user.email}</p>
        <label className="me-field">
          <span className="muted">{t("me.displayNameLabel")}</span>
          <input
            className="input"
            type="text"
            maxLength={40}
            value={displayName}
            onChange={(ev) => setDisplayName(ev.target.value)}
            disabled={busy}
          />
        </label>
        <button className="btn secondary" type="submit" disabled={busy}>
          {busy ? t("me.savingProfile") : t("me.saveProfile")}
        </button>
        {msg ? <p className="muted">{msg}</p> : null}
        {err ? <p className="error">{err}</p> : null}
      </form>
    </div>
  );
}
