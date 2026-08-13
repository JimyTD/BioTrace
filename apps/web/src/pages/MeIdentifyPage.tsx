import { useEffect, useState, type FormEvent } from "react";
import { t } from "@biotrace/messages";
import { MeSubHead } from "../components/MeSubHead";
import { api, type IdentifyKeySettings, type IdentifyQuota } from "../api";

export default function MeIdentifyPage() {
  const [quota, setQuota] = useState<IdentifyQuota | null>(null);
  const [identifyKey, setIdentifyKey] = useState<IdentifyKeySettings | null>(null);
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setQuota(res.identifyQuota ?? null);
        const ik = res.identifyKey ?? null;
        setIdentifyKey(ik);
        if (ik) {
          setUseOwnKey(ik.useOwnKey);
          setBaseUrl(ik.baseUrl ?? "");
          setModel(ik.model ?? "");
        }
      })
      .catch(() => {
        setQuota(null);
        setIdentifyKey(null);
      });
  }, []);

  async function saveIdentifyKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.updateIdentifyKey({
        useOwnKey,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || null,
        apiKey: apiKey.trim() || undefined,
      });
      setIdentifyKey(res.identifyKey);
      setUseOwnKey(res.identifyKey.useOwnKey);
      setBaseUrl(res.identifyKey.baseUrl ?? "");
      setModel(res.identifyKey.model ?? "");
      setApiKey("");
      setMsg(res.message);
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("error.server"));
    } finally {
      setBusy(false);
    }
  }

  async function clearIdentifyKey() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.updateIdentifyKey({ clearKey: true });
      setIdentifyKey(res.identifyKey);
      setApiKey("");
      setMsg(res.message);
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("error.server"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack page-me">
      <MeSubHead title={t("me.identifyAdvanced")} />
      <form className="me-section stack" onSubmit={saveIdentifyKey}>
        {quota == null ? null : quota.limited ? (
          <p className="muted">
            {t("me.identifyQuota", {
              used: String(quota.used),
              limit: String(quota.limit),
            })}
          </p>
        ) : (
          <p className="muted">{t("me.identifyQuotaUnlimited")}</p>
        )}
        {quota?.limited ? <p className="muted">{t("me.identifyQuotaHint")}</p> : null}

        <p className="muted">{t("me.identifyKeyLede")}</p>
        <label className="me-check">
          <input
            type="checkbox"
            checked={useOwnKey}
            onChange={(ev) => setUseOwnKey(ev.target.checked)}
            disabled={busy}
          />
          <span>{t("me.identifyUseOwnKey")}</span>
        </label>

        {useOwnKey ? (
          <>
            {identifyKey && !identifyKey.ready ? (
              <p className="muted">{t("me.identifyKeyNotReady")}</p>
            ) : null}
            <label className="me-field">
              <span className="muted">{t("me.identifyBaseUrl")}</span>
              <input
                className="input"
                type="url"
                value={baseUrl}
                onChange={(ev) => setBaseUrl(ev.target.value)}
                disabled={busy}
              />
            </label>
            <label className="me-field">
              <span className="muted">{t("me.identifyModel")}</span>
              <input
                className="input"
                type="text"
                value={model}
                onChange={(ev) => setModel(ev.target.value)}
                disabled={busy}
              />
            </label>
            <label className="me-field">
              <span className="muted">{t("me.identifyApiKey")}</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(ev) => setApiKey(ev.target.value)}
                disabled={busy}
              />
            </label>
            {identifyKey?.hasKey && identifyKey.keyHint ? (
              <p className="muted">
                {t("me.identifyApiKeySaved", { hint: identifyKey.keyHint })}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="row me-actions">
          <button className="btn secondary" type="submit" disabled={busy}>
            {busy ? t("me.identifyKeySaving") : t("me.identifyKeySave")}
          </button>
          {useOwnKey && identifyKey?.hasKey ? (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => void clearIdentifyKey()}
            >
              {t("me.identifyKeyClear")}
            </button>
          ) : null}
        </div>
        {msg ? <p className="muted">{msg}</p> : null}
        {err ? <p className="error">{err}</p> : null}
      </form>
    </div>
  );
}
