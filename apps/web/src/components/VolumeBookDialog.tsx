import { Link } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import type { VolumeListItem } from "../api";
import {
  volumeCoverUrl,
  volumeSealCompleteUrl,
  volumeStampFrameUrl,
} from "../themes";

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

export default function VolumeBookDialog({
  volume,
  onClose,
}: {
  volume: VolumeListItem | null;
  onClose: () => void;
}) {
  if (!volume) return null;

  const coverSrc = volumeCoverUrl(volume.id);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel volume-book-panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-book-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="volume-book-cover-wrap">
          <img
            className="volume-book-cover"
            src={coverSrc}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          {volume.completed ? (
            <img
              className="volume-book-seal"
              src={volumeSealCompleteUrl()}
              alt=""
              aria-hidden
            />
          ) : null}
        </div>

        <div className="volume-book-head">
          <div>
            <h2 id="volume-book-title" className="page-title">
              {msg(volume.titleKey)}
            </h2>
            <p className="muted volume-lede">{msg(volume.ledeKey)}</p>
          </div>
          <span className={`volume-progress-pill${volume.completed ? " is-done" : ""}`}>
            {volume.completed
              ? t("collection.volumeDone")
              : t("collection.volumeProgress", {
                  lit: volume.litCount,
                  total: volume.totalSlots,
                })}
          </span>
        </div>

        <p className="muted section-kicker">{t("collection.volumeStampsTitle")}</p>
        <div className="stamp-grid">
          {volume.slots.map((slot) => {
            const label = msg(slot.titleKey);
            const photoUrl = slot.lit ? slot.coverDisplayUrl : null;
            const face = (
              <StampFace photoUrl={photoUrl} label={label} lit={slot.lit} />
            );

            if (slot.lit && slot.coverObservationId) {
              return (
                <Link
                  key={slot.id}
                  className="stamp stamp-lit"
                  to={`/observations/${slot.coverObservationId}`}
                  onClick={onClose}
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

        <button className="btn secondary" type="button" onClick={onClose}>
          {t("collection.volumeClose")}
        </button>
      </div>
    </div>
  );
}
