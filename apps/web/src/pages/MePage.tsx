import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { hasMessage, t, type MessageKey } from "@biotrace/messages";
import { api, type IdentifyQuota, type User } from "../api";
import { MeRowIcon } from "../components/MeRowIcon";
import { getActiveTheme, type ThemeId } from "../themes";

function themeLabel(id: ThemeId) {
  const key = `theme.${id}` as MessageKey;
  return hasMessage(key) ? t(key) : id;
}

/** 用量条的比例只能从这儿传：CSS 算不出 used / limit。 */
function quotaStyle(quota: IdentifyQuota): CSSProperties {
  const ratio = quota.limit > 0 ? Math.min(1, Math.max(0, quota.used / quota.limit)) : 0;
  return { "--quota-ratio": ratio } as CSSProperties;
}

export default function MePage({
  user,
  onLogout,
  onOpenHelp,
}: {
  user: User;
  onLogout: () => void;
  onUserUpdated?: (user: User) => void;
  onOpenHelp?: () => void;
}) {
  const [identifyQuota, setIdentifyQuota] = useState<IdentifyQuota | null>(null);
  const displayName = user.displayName?.trim() || user.email;
  const themeName = themeLabel(getActiveTheme());

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
        {/* 首字母牌：零件常在，日光把它关着（见 styles.css .me-avatar） */}
        <span className="me-avatar" aria-hidden>
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <strong>{displayName}</strong>
        {user.displayName?.trim() ? <span className="muted">{user.email}</span> : null}
        <span className="me-identity-action">{t("me.editProfile")}</span>
      </Link>

      {identifyQuota?.limited ? (
        <p className="me-quota" style={quotaStyle(identifyQuota)}>
          {t("me.identifyQuota", {
            used: String(identifyQuota.used),
            limit: String(identifyQuota.limit),
          })}
          {/* 用量条：同上，零件常在、日光关着。比例由 --quota-ratio 传给 CSS */}
          <span className="me-quota-bar" aria-hidden />
        </p>
      ) : null}

      <nav className="me-menu" aria-label={t("me.title")}>
        <Link className="me-row" to="/me/security">
          <MeRowIcon name="security" />
          <span>{t("me.accountSecurity")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </Link>
        <Link className="me-row" to="/me/identify">
          <MeRowIcon name="identify" />
          <span>{t("me.identifyAdvanced")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </Link>
        <Link className="me-row" to="/me/appearance">
          <MeRowIcon name="appearance" />
          <span>{t("me.appearance")}</span>
          <span className="me-row-side">
            <span className="muted">{themeName}</span>
            <span className="me-row-go" aria-hidden>
              ›
            </span>
          </span>
        </Link>
        <button className="me-row" type="button" onClick={onOpenHelp}>
          <MeRowIcon name="help" />
          <span>{t("me.help")}</span>
          <span className="me-row-go" aria-hidden>
            ›
          </span>
        </button>
        <Link className="me-row" to="/me/about">
          <MeRowIcon name="about" />
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
