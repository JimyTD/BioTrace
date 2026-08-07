import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatRank, t } from "@biotrace/messages";
import { api, type Observation, type Trip } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  identifyErrorPrimary,
  isNotCollectibleError,
} from "../identifyErrors";
import {
  canUseNativePicker,
  MAX_UPLOAD_BATCH,
  pickImageNative,
  type PickImageMode,
} from "../pickImage";

function statusBadge(obs: Observation) {
  if (obs.status === "analyzing") {
    return <span className="badge warn">{t("status.analyzing")}</span>;
  }
  if (obs.status === "pending_settle") {
    return <span className="badge warn">{t("status.pending_settle")}</span>;
  }
  if (obs.status === "failed") {
    if (isNotCollectibleError(obs.error)) {
      return <span className="badge danger">{t("status.notCollectible")}</span>;
    }
    const coarse = obs.error === "identify_too_coarse" || obs.settleTier === "none";
    return (
      <span className="badge danger">
        {coarse ? t("status.tooCoarse") : t("status.failed")}
      </span>
    );
  }
  return <span className="badge">{t("status.settled")}</span>;
}

function obsHref(obs: Observation) {
  if (obs.status === "pending_settle") return `/settle/${obs.id}`;
  return `/observations/${obs.id}`;
}

export default function TripAlbumPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const nativePicker = canUseNativePicker();

  const analyzingIds = useMemo(
    () => observations.filter((o) => o.status === "analyzing").map((o) => o.id),
    [observations],
  );
  const pendingCount = useMemo(
    () => observations.filter((o) => o.status === "pending_settle").length,
    [observations],
  );
  const [toast, setToast] = useState<string | null>(null);
  const prevPending = useRef(0);

  useEffect(() => {
    if (pendingCount > prevPending.current) {
      setToast(t("album.readyToast"));
      const timer = window.setTimeout(() => setToast(null), 4000);
      prevPending.current = pendingCount;
      return () => window.clearTimeout(timer);
    }
    prevPending.current = pendingCount;
  }, [pendingCount]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  async function refresh() {
    const [tripRes, obsRes] = await Promise.all([
      api.getTrip(id),
      api.listTripObservations(id),
    ]);
    setTrip(tripRes.trip);
    setTitleDraft(tripRes.trip.title);
    setObservations(obsRes.observations);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : t("trips.loadFailed")));
  }, [id]);

  useEffect(() => {
    if (analyzingIds.length === 0) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [analyzingIds.join(","), id]);

  function clearPickedInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function applyPickedFiles(list: File[] | FileList | null) {
    if (!list || list.length === 0) {
      setFiles([]);
      setDescription("");
      return;
    }
    const arr = Array.from(list);
    if (arr.length > MAX_UPLOAD_BATCH) {
      setToast(t("album.tooManyPhotos", { max: MAX_UPLOAD_BATCH }));
      window.setTimeout(() => setToast(null), 4000);
    }
    const next = arr.slice(0, MAX_UPLOAD_BATCH);
    setFiles(next);
    if (next.length !== 1) setDescription("");
    setError(null);
  }

  async function onPick(mode: PickImageMode) {
    setError(null);
    if (nativePicker) {
      setPicking(true);
      try {
        const picked = await pickImageNative(mode);
        if (picked.length) applyPickedFiles(picked);
      } catch {
        setError(t("album.pickFailed"));
      } finally {
        setPicking(false);
      }
      return;
    }
    if (mode === "camera") {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const batch = [...files];
    const desc = batch.length === 1 ? description : "";
    let ok = 0;
    let fail = 0;
    try {
      for (let i = 0; i < batch.length; i++) {
        setUploadProgress({ current: i + 1, total: batch.length });
        try {
          await api.uploadObservation(id, batch[i]!, desc);
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setFiles([]);
      setDescription("");
      clearPickedInputs();
      await refresh();
      if (fail > 0 && ok === 0) {
        setError(t("album.uploadAllFailed"));
      } else if (fail > 0) {
        setToast(t("album.uploadPartial", { ok, fail }));
        window.setTimeout(() => setToast(null), 5000);
      }
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  }

  function askDeleteOne(obsId: string, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    setPendingDeleteId(obsId);
  }

  async function confirmDeleteOne() {
    if (!pendingDeleteId) return;
    const obsId = pendingDeleteId;
    setDeletingId(obsId);
    setError(null);
    try {
      await api.deleteObservation(obsId);
      setPendingDeleteId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("album.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  async function onSaveTitle(e: FormEvent) {
    e.preventDefault();
    if (!titleDraft.trim()) return;
    setSavingTitle(true);
    setError(null);
    try {
      const { trip: updated } = await api.updateTrip(id, titleDraft.trim());
      setTrip(updated);
      setTitleDraft(updated.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.renameFailed"));
    } finally {
      setSavingTitle(false);
    }
  }

  async function onDeleteTrip(e: FormEvent) {
    e.preventDefault();
    const expected = t("trips.deleteConfirmPhrase");
    if (deletePhrase.trim() !== expected) {
      setError(t("trips.deletePhraseMismatch"));
      return;
    }
    setDeletingTrip(true);
    setError(null);
    try {
      await api.deleteTrip(id, deletePhrase.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.deleteFailed"));
      setDeletingTrip(false);
    }
  }

  const uploadLabel = uploading
    ? uploadProgress
      ? t("album.uploadingProgress", {
          current: uploadProgress.current,
          total: uploadProgress.total,
        })
      : t("album.uploading")
    : t("album.upload");

  return (
    <div className="stack">
      <div className="row">
        <Link className="btn secondary" to="/">
          {t("album.back")}
        </Link>
        <button className="btn secondary" type="button" onClick={() => setShowManage((v) => !v)}>
          {t("trips.manage")}
        </button>
      </div>
      <div>
        <h1 className="brand">{trip?.title ?? t("nav.trips")}</h1>
        <p className="lede">{t("album.lede")}</p>
      </div>

      {showManage ? (
        <div className="panel stack">
          <form className="stack" onSubmit={onSaveTitle}>
            <label className="muted" htmlFor="trip-rename">
              {t("trips.editTitle")}
            </label>
            <div className="row">
              <input
                id="trip-rename"
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
              />
              <button className="btn" type="submit" disabled={savingTitle}>
                {savingTitle ? t("trips.savingTitle") : t("trips.saveTitle")}
              </button>
            </div>
          </form>

          <form className="stack danger-zone" onSubmit={onDeleteTrip}>
            <p className="muted">{t("trips.deleteHint")}</p>
            <p className="confirm-phrase">{t("trips.deleteConfirmPhrase")}</p>
            <input
              className="input"
              placeholder={t("trips.deleteConfirmPlaceholder")}
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              autoComplete="off"
            />
            <button
              className="btn danger"
              type="submit"
              disabled={deletingTrip || deletePhrase.trim() !== t("trips.deleteConfirmPhrase")}
            >
              {deletingTrip ? t("trips.deleting") : t("trips.delete")}
            </button>
          </form>
        </div>
      ) : null}

      <form className="panel stack" onSubmit={onUpload}>
        <input
          ref={fileInputRef}
          className="file-input-hidden"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => applyPickedFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          className="file-input-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => applyPickedFiles(e.target.files)}
        />
        <div className="row">
          <button
            className="btn secondary"
            type="button"
            disabled={picking || uploading}
            onClick={() => void onPick("camera")}
          >
            {t("album.takePhoto")}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={picking || uploading}
            onClick={() => void onPick("gallery")}
          >
            {t("album.pickGallery")}
          </button>
        </div>
        <span className="muted">
          {picking
            ? t("album.picking")
            : files.length > 0
              ? t("album.filesChosen", { count: files.length })
              : t("album.noFileChosen")}
        </span>
        {previewUrls.length > 0 ? (
          <div className="pick-thumbs" aria-hidden>
            {previewUrls.map((url) => (
              <img key={url} src={url} alt="" />
            ))}
          </div>
        ) : null}
        {files.length === 1 ? (
          <textarea
            className="textarea"
            placeholder={t("album.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={uploading}
          />
        ) : null}
        <button className="btn" type="submit" disabled={files.length === 0 || uploading || picking}>
          {uploadLabel}
        </button>
      </form>

      {toast ? <p className="toast">{toast}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="album">
        {observations.map((obs) => (
          <div className="card" key={obs.id}>
            <Link className="card-link-inner" to={obsHref(obs)}>
              <img
                src={obs.displayUrl}
                alt={
                  obs.status === "pending_settle"
                    ? t("status.pending_settle")
                    : isNotCollectibleError(obs.error)
                      ? t("status.notCollectible")
                      : obs.commonName || t("map.observationFallback")
                }
              />
              <div className="meta">
                {statusBadge(obs)}
                {obs.status === "settled" ? (
                  <>
                    {/* 缩略图：有中文用中文；无中文才用英文/拉丁。对照留给详情页 */}
                    <strong>
                      {obs.commonName || obs.scientificName || t("detail.unnamed")}
                    </strong>
                    <span className="muted">
                      {t("album.reliableTo", {
                        rank: formatRank(obs.finestReliableRank),
                      })}
                    </span>
                  </>
                ) : null}
                {obs.status === "analyzing" ? (
                  <span className="muted">{t("album.analyzingHint")}</span>
                ) : null}
                {obs.status === "pending_settle" ? (
                  <span className="muted">{t("album.pendingHint")}</span>
                ) : null}
                {obs.status === "failed" ? (
                  <span className="error">{identifyErrorPrimary(obs.error)}</span>
                ) : null}
                {obs.lat != null && obs.lng != null ? (
                  <span className="muted">
                    {obs.lat.toFixed(4)}, {obs.lng.toFixed(4)}
                  </span>
                ) : (
                  <span className="muted">{t("album.noGps")}</span>
                )}
              </div>
            </Link>
            <div className="card-actions">
              <button
                className="btn danger small"
                type="button"
                disabled={deletingId === obs.id}
                onClick={(ev) => askDeleteOne(obs.id, ev)}
              >
                {deletingId === obs.id ? t("album.deleting") : t("album.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {observations.length === 0 ? (
        <div className="panel">
          <p className="muted">{t("album.empty")}</p>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDeleteId != null}
        title={t("common.confirmTitle")}
        message={t("album.deleteConfirm")}
        confirmLabel={t("album.delete")}
        danger
        busy={deletingId != null}
        onCancel={() => {
          if (!deletingId) setPendingDeleteId(null);
        }}
        onConfirm={confirmDeleteOne}
      />
    </div>
  );
}
