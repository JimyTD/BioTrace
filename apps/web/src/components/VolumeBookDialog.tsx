import { Link } from "react-router-dom";
import { hasMessage, t } from "@biotrace/messages";
import type { VolumeListItem } from "../api";

function msg(key: string) {
  return hasMessage(key) ? t(key) : key;
}

export default function VolumeBookDialog({
  volume,
  onClose,
}: {
  volume: VolumeListItem | null;
  onClose: () => void;
}) {
  if (!volume) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel volume-book-panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-book-title"
        onClick={(e) => e.stopPropagation()}
      >
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
            if (slot.lit && slot.coverObservationId && slot.coverDisplayUrl) {
              return (
                <Link
                  key={slot.id}
                  className="stamp stamp-lit"
                  to={`/observations/${slot.coverObservationId}`}
                  onClick={onClose}
                >
                  <img src={slot.coverDisplayUrl} alt={label} />
                  <span className="stamp-caption">{label}</span>
                </Link>
              );
            }
            return (
              <div
                key={slot.id}
                className={`stamp${slot.lit ? " stamp-lit stamp-no-photo" : " stamp-empty"}`}
                title={slot.lit ? label : t("collection.volumeStampEmpty")}
              >
                {slot.lit && slot.coverDisplayUrl ? (
                  <img src={slot.coverDisplayUrl} alt={label} />
                ) : (
                  <span className="stamp-placeholder" aria-hidden />
                )}
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
