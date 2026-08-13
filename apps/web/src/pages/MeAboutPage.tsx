import { useEffect, useState } from "react";
import { t } from "@biotrace/messages";
import {
  downloadAndInstallApk,
  fetchAndroidUpdate,
  getLocalAppVersion,
  isNativeAndroidShell,
  isNewerVersion,
  type AndroidUpdateInfo,
} from "../androidUpdate";
import { MeSubHead } from "../components/MeSubHead";

export default function MeAboutPage() {
  const nativeAndroid = isNativeAndroidShell();
  const [localVersion, setLocalVersion] = useState<{
    versionName: string;
    versionCode: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<AndroidUpdateInfo | null>(null);

  useEffect(() => {
    if (!nativeAndroid) return;
    void getLocalAppVersion().then(setLocalVersion);
  }, [nativeAndroid]);

  async function checkUpdate() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    setPendingUpdate(null);
    try {
      const local = localVersion ?? (await getLocalAppVersion());
      if (local) setLocalVersion(local);
      const remote = await fetchAndroidUpdate();
      if (!remote) {
        setMsg(t("me.updateMissing"));
        return;
      }
      if (!local || !isNewerVersion(local, remote)) {
        setMsg(t("me.updateUpToDate"));
        return;
      }
      setPendingUpdate(remote);
      setMsg(t("me.updateAvailable", { version: remote.versionName }));
    } catch {
      setErr(t("me.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function installPendingUpdate() {
    if (!pendingUpdate) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadAndInstallApk(pendingUpdate.apkUrl);
      setMsg(t("me.updateInstallHint"));
    } catch {
      setErr(t("me.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack page-me">
      <MeSubHead title={t("me.about")} />
      <div className="me-section stack">
        <strong>{t("app.name")}</strong>
        <p className="muted">{t("app.tagline")}</p>
        {nativeAndroid ? (
          <>
            <p className="muted">
              {localVersion
                ? t("me.appVersion", { version: localVersion.versionName })
                : t("me.appVersionUnknown")}
            </p>
            <div className="row me-actions">
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void checkUpdate()}>
                {busy && !pendingUpdate ? t("me.checkingUpdate") : t("me.checkUpdate")}
              </button>
              {pendingUpdate ? (
                <button className="btn" type="button" disabled={busy} onClick={() => void installPendingUpdate()}>
                  {busy ? t("me.updateDownloading") : t("me.updateDownload")}
                </button>
              ) : null}
            </div>
            {msg ? <p className="muted">{msg}</p> : null}
            {err ? <p className="error">{err}</p> : null}
            {pendingUpdate?.notes ? <p className="muted">{pendingUpdate.notes}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
