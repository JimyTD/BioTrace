import { useEffect, useState } from "react";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";
import {
  downloadAndInstallApk,
  fetchAndroidUpdate,
  getLocalAppVersion,
  isNativeAndroidShell,
  needsForceUpdate,
  type AndroidUpdateInfo,
} from "../androidUpdate";

/**
 * minor/major 落后时的强更遮罩：不可关闭，只能下载安装。
 */
export default function ForceAppUpdateGate({ enabled }: { enabled: boolean }) {
  const [remote, setRemote] = useState<AndroidUpdateInfo | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isNativeAndroidShell()) return;
    let cancelled = false;
    (async () => {
      try {
        const local = await getLocalAppVersion();
        if (!local || cancelled) return;
        const info = await fetchAndroidUpdate();
        if (!info || cancelled) return;
        if (needsForceUpdate(local.versionName, info.versionName)) {
          setLocalName(local.versionName);
          setRemote(info);
        }
      } catch {
        // 检查失败不拦进入；用户仍可在「我的」手动检查
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const blocking = Boolean(remote && localName);
  useBackClose(() => undefined, blocking, 100);

  if (!remote || !localName) return null;

  async function onUpdate() {
    if (!remote) return;
    setBusy(true);
    setError(null);
    try {
      await downloadAndInstallApk(remote.apkUrl);
    } catch {
      setError(t("me.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop force-update-backdrop" role="presentation">
      <div
        className="modal-panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="force-update-title"
      >
        <h2 id="force-update-title" className="section-title">
          {t("me.forceUpdateTitle")}
        </h2>
        <p className="lede" style={{ marginBottom: 0 }}>
          {t("me.forceUpdateBody", { current: localName, latest: remote.versionName })}
        </p>
        {remote.notes ? <p className="muted">{remote.notes}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="button" disabled={busy} onClick={() => void onUpdate()}>
          {busy ? t("me.updateDownloading") : t("me.updateDownload")}
        </button>
      </div>
    </div>
  );
}
