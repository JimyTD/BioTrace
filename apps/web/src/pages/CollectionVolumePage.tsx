import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import { api, type VolumeListItem } from "../api";
import { volumeStampFrameUrl } from "../themes";

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

function StampFace({
  photoUrl,
  label,
  lit,
}: {
  photoUrl: string | null;
  label: string;
  lit: boolean;
}) {
  return (
    <div className={`stamp-face${lit ? " is-lit" : ""}`}>
      <div className="stamp-photo">
        {photoUrl ? (
          <img src={photoUrl} alt={label} />
        ) : (
          <span className="stamp-photo-empty" aria-hidden />
        )}
      </div>
      <img className="stamp-frame" src={volumeStampFrameUrl()} alt="" aria-hidden />
    </div>
  );
}

export default function CollectionVolumePage() {
  const { id = "" } = useParams();
  const [volume, setVolume] = useState<VolumeListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listVolumes()
      .then((res) => {
        const found = res.volumes.find((v) => v.id === id) ?? null;
        setVolume(found);
        if (!found) setError(t("collection.volumesLoadFailed"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("collection.volumesLoadFailed")))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="stack page-collection-volume">
      <header className="page-head me-sub-head">
        <Link className="text-link" to="/collection">
          ← {t("collection.volumeBack")}
        </Link>
        {volume ? (
          <>
            <h1 className="page-title">{msg(volume.titleKey)}</h1>
            <p className="lede">{msg(volume.ledeKey)}</p>
            <p className="muted">
              {volume.completed
                ? t("collection.volumeDone")
                : t("collection.volumeProgress", {
                    lit: volume.litCount,
                    total: volume.totalSlots,
                  })}
            </p>
          </>
        ) : (
          <h1 className="page-title">{t("collection.title")}</h1>
        )}
      </header>

      {loading ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {volume ? (
        <div className="stamp-grid">
          {volume.slots.map((slot) => {
            const label = msg(slot.titleKey);
            const photoUrl = slot.lit ? slot.coverDisplayUrl : null;
            const face = <StampFace photoUrl={photoUrl} label={label} lit={slot.lit} />;

            if (slot.lit && slot.coverObservationId) {
              return (
                <Link
                  key={slot.id}
                  className="stamp stamp-lit"
                  to={`/observations/${slot.coverObservationId}`}
                >
                  {face}
                  <span className="stamp-caption">{label}</span>
                </Link>
              );
            }

            return (
              <div
                key={slot.id}
                className={`stamp${slot.lit ? " stamp-lit" : " stamp-empty"}`}
                title={slot.lit ? label : t("collection.volumeStampEmpty")}
              >
                {face}
                <span className="stamp-caption">{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
