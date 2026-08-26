import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { fetchAndroidUpdate, type AndroidUpdateInfo } from "../androidUpdate";

const APK_HREF = "/api/app/android/apk";

function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function DownloadPage() {
  const [info, setInfo] = useState<AndroidUpdateInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const wechat = isWeChat();
  const ios = isIos();

  useEffect(() => {
    document.title = `${t("download.title")} · ${t("app.name")}`;
    fetchAndroidUpdate()
      .then((remote) => {
        setInfo(remote);
        setMissing(!remote);
      })
      .catch(() => {
        setInfo(null);
        setMissing(true);
      });
  }, []);

  return (
    <div className="login-screen">
      <div className="login-page">
        <div className="login-page-front">
          <div className="login-mast">
            <img className="brand-mark" src="/brand/icon-tile-framed.svg" alt="" width={76} height={76} />
            <h1 className="login-brand">{t("app.name")}</h1>
            <p className="lede">{t("auth.lede")}</p>
            <div className="login-rule" aria-hidden />
          </div>
          <div className="login-colophon">
            {wechat ? <p className="muted">{t("download.wechat")}</p> : null}
            {ios ? (
              <Link className="btn" to="/">
                {t("download.openWeb")}
              </Link>
            ) : missing ? (
              <p className="muted">{t("download.missing")}</p>
            ) : (
              <a className="btn" href={info?.apkUrl ?? APK_HREF}>
                {t("download.cta")}
              </a>
            )}
            {info && !ios ? <p className="muted">{info.versionName}</p> : null}
          </div>
          <div className="download-readme">
            {ios ? (
              <p className="muted">{t("download.ios")}</p>
            ) : (
              <>
                <p className="download-readme-title">{t("download.install")}</p>
                <ol>
                  <li>{t("download.step1")}</li>
                  <li>{t("download.step2")}</li>
                  <li>{t("download.step3")}</li>
                </ol>
              </>
            )}
            <Link className="text-link" to="/">
              {t("download.openWeb")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
