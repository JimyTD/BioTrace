import { useEffect, useState } from "react";
import { t } from "@biotrace/messages";
import { api, type HealthResponse, type ProviderHealthSnap, type User } from "../api";

function providerLine(
  name: string,
  snap: ProviderHealthSnap | undefined,
  configuredFallback: boolean | undefined,
) {
  if (!snap) {
    if (configuredFallback == null) return t("me.geminiUnknown");
    return configuredFallback
      ? name === "Gemini"
        ? t("me.geminiConfigured")
        : t("me.zhipuConfigured")
      : name === "Gemini"
        ? t("me.geminiMissing")
        : t("me.zhipuMissing");
  }
  if (!snap.configured) {
    return name === "Gemini" ? t("me.geminiMissing") : t("me.zhipuMissing");
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
}: {
  user: User;
  onLogout: () => void;
}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

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

  return (
    <div className="stack">
      <div>
        <h1 className="brand">{t("me.title")}</h1>
        <p className="lede">{t("me.lede")}</p>
      </div>
      <div className="panel stack">
        <div>
          <strong>{user.email}</strong>
          <p className="muted">{t("me.userId", { id: user.id })}</p>
        </div>
        <p className="muted">
          {providerLine("Gemini", health?.providers?.gemini, health?.geminiConfigured)}
        </p>
        <p className="muted">
          {providerLine("智谱", health?.providers?.zhipu, health?.zhipuConfigured)}
        </p>
        <button className="btn secondary" onClick={logout}>
          {t("auth.logout")}
        </button>
      </div>
    </div>
  );
}
