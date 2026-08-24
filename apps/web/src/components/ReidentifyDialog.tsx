import { useEffect, useState } from "react";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";

export default function ReidentifyDialog({
  open,
  busy,
  initialDescription,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy?: boolean;
  initialDescription?: string | null;
  onConfirm: (description: string) => void;
  onCancel: () => void;
}) {
  useBackClose(() => {
    if (!busy) onCancel();
  }, open, 50);
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialDescription?.trim() || "");
      setLocalError(null);
    }
  }, [open, initialDescription]);

  if (!open) return null;

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      setLocalError(t("detail.reidentifyNeedText"));
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="modal-panel stack"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-title">{t("detail.reidentify")}</h2>
        <p className="lede" style={{ marginBottom: 0 }}>
          {t("detail.reidentifyGuide")}
        </p>
        <textarea
          className="textarea"
          placeholder={t("detail.reidentifyPlaceholder")}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        {localError ? <p className="error">{localError}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn secondary" type="button" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={submit}>
            {busy ? t("detail.reidentifying") : t("detail.reidentifyConfirmAction")}
          </button>
        </div>
      </div>
    </div>
  );
}
