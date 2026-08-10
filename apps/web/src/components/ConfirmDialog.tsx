import { t } from "@biotrace/messages";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel stack"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? <h2 className="section-title">{title}</h2> : null}
        <p className="lede" style={{ marginBottom: 0 }}>
          {message}
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn secondary" type="button" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            className={danger ? "btn danger" : "btn"}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel || t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
