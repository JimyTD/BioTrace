import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type IdentifyQuota, type User } from "../api";

export default function MePage({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
  onUserUpdated?: (user: User) => void;
}) {
  const [identifyQuota, setIdentifyQuota] = useState<IdentifyQuota | null>(null);
  const displayName = user.displayName?.trim() || user.email;

  useEffect(() => {
    api
      .me()
      .then((res) => setIdentifyQuota(res.identifyQuota ?? null))
      .catch(() => setIdentifyQuota(null));
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <div className="stack page-me">
      <header className="page-head">
        <h1 className="page-title">{t("me.title")}</h1>
      </header>

      <Link className="me-identity" to="/me/profile">
        <strong>{displayName}</strong>
        {user.displayName?.trim() ? <span className="muted">{user.email}</span> : null}
        <span className="me-identity-action">{t("me.editProfile")}</span>
      </Link>

      {identifyQuota?.limited ? (
        <p className="me-quota">
          {t("me.identifyQuota", {
            used: String(identifyQuota.used),
            limit: String(identifyQuota.limit),
          })}
        </p>
      ) : null}

      <nav className="me-menu" aria-label={t("me.title")}>
        <Link className="me-row" to="/me/security">
          <span>{t("me.accountSecurity")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </Link>
        <Link className="me-row" to="/me/identify">
          <span>{t("me.identifyAdvanced")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </Link>
        <Link className="me-row" to="/me/about">
          <span>{t("me.about")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </Link>
      </nav>

      <button className="btn secondary me-logout" type="button" onClick={() => void logout()}>
        {t("auth.logout")}
      </button>
    </div>
  );
}
