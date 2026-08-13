import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatRank, t } from "@biotrace/messages";
import { ApiError, api, type Observation, type Trip, type TripMember } from "../api";
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
import { tripFilmFrameUrl } from "../themes";
import { tripMetaLine } from "../tripMeta";

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

export default function TripAlbumPage({ userId }: { userId: string }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
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
  const [metaManual, setMetaManual] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualPlace, setManualPlace] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSavedFlash, setMetaSavedFlash] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [allowJoinBusy, setAllowJoinBusy] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const nativePicker = canUseNativePicker();
  const isAdmin = Boolean(trip?.isAdmin);

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

  const uploaderOpen = showUploader || files.length > 0 || uploading;

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
    const [tripRes, obsRes, membersRes] = await Promise.all([
      api.getTrip(id),
      api.listTripObservations(id),
      api.listTripMembers(id),
    ]);
    setTrip(tripRes.trip);
    setTitleDraft(tripRes.trip.title);
    setMetaManual(Boolean(tripRes.trip.metaManualEnabled));
    setManualDate(tripRes.trip.manualDateText ?? "");
    setManualPlace(tripRes.trip.manualPlaceText ?? "");
    setObservations(obsRes.observations);
    setMembers(membersRes.members);
    setLoaded(true);
  }

  useEffect(() => {
    setLoaded(false);
    setShowUploader(false);
    refresh()
      .then(() => undefined)
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("trips.loadFailed"));
        setLoaded(true);
      });
  }, [id]);

  useEffect(() => {
    if (loaded && observations.length === 0) {
      setShowUploader(true);
    }
  }, [loaded, observations.length]);

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
    setShowUploader(true);
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
    let dup = 0;
    let dailyLimitHits = 0;
    try {
      for (let i = 0; i < batch.length; i++) {
        setUploadProgress({ current: i + 1, total: batch.length });
        try {
          const res = await api.uploadObservation(id, batch[i]!, desc);
          ok += 1;
          if (res.code === "identify_daily_limit") dailyLimitHits += 1;
        } catch (err) {
          if (err instanceof ApiError && err.code === "duplicate_photo") {
            dup += 1;
          } else {
            fail += 1;
          }
        }
      }
      setFiles([]);
      setDescription("");
      clearPickedInputs();
      setShowUploader(false);
      await refresh();
      const rejected = fail + dup;
      if (rejected > 0 && ok === 0) {
        if (dup > 0 && fail === 0) {
          setError(
            dup === 1 && batch.length === 1
              ? t("album.duplicatePhoto")
              : t("album.uploadAllDuplicates"),
          );
        } else if (dup > 0 && fail > 0) {
          setError(t("album.uploadPartialMixed", { ok: 0, dup, fail }));
        } else {
          setError(t("album.uploadAllFailed"));
        }
      } else if (rejected > 0) {
        const msg =
          dup > 0 && fail === 0
            ? t("album.uploadPartialDup", { ok, dup })
            : dup > 0
              ? t("album.uploadPartialMixed", { ok, dup, fail })
              : t("album.uploadPartial", { ok, fail });
        setToast(msg);
        window.setTimeout(() => setToast(null), 5000);
      } else if (dailyLimitHits > 0) {
        setToast(t("error.identifyDailyLimitShort"));
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
      const { trip: updated } = await api.updateTrip(id, { title: titleDraft.trim() });
      setTrip(updated);
      setTitleDraft(updated.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.renameFailed"));
    } finally {
      setSavingTitle(false);
    }
  }

  async function onSaveMeta(e: FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setError(null);
    setMetaSavedFlash(false);
    try {
      const { trip: updated } = await api.updateTrip(id, {
        metaManualEnabled: metaManual,
        manualDateText: manualDate.trim() ? manualDate.trim() : null,
        manualPlaceText: manualPlace.trim() ? manualPlace.trim() : null,
      });
      setTrip(updated);
      setMetaManual(Boolean(updated.metaManualEnabled));
      setManualDate(updated.manualDateText ?? "");
      setManualPlace(updated.manualPlaceText ?? "");
      setMetaSavedFlash(true);
      window.setTimeout(() => setMetaSavedFlash(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.metaSaveFailed"));
    } finally {
      setSavingMeta(false);
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

  async function onToggleAllowJoin(next: boolean) {
    setAllowJoinBusy(true);
    setError(null);
    try {
      const res = await api.updateTripShare(id, next);
      setTrip((prev) =>
        prev
          ? { ...prev, allowJoin: res.allowJoin, inviteCode: res.inviteCode }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.actionFailed"));
    } finally {
      setAllowJoinBusy(false);
    }
  }

  async function onCopyInvite() {
    const code = trip?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedFlash(true);
      window.setTimeout(() => setCopiedFlash(false), 2000);
    } catch {
      setError(t("share.actionFailed"));
    }
  }

  async function onLeaveTrip() {
    if (!window.confirm(t("share.leaveConfirm"))) return;
    setLeaving(true);
    setError(null);
    try {
      await api.leaveTrip(id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.actionFailed"));
      setLeaving(false);
    }
  }

  async function onKick(memberId: string) {
    setKickingId(memberId);
    setError(null);
    try {
      await api.kickTripMember(id, memberId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.actionFailed"));
    } finally {
      setKickingId(null);
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
    <div className="stack page-album">
      <header className="page-head album-head">
        <div className="album-head-row">
          <Link className="text-link" to="/">
            ← {t("album.back")}
          </Link>
          <button
            className="text-link"
            type="button"
            onClick={() => setShowManage((v) => !v)}
          >
            {t("trips.manage")}
          </button>
        </div>
        <h1 className="page-title">{trip?.title ?? t("nav.trips")}</h1>
        <p className="lede album-lede">{t("album.lede")}</p>
        {trip ? <p className="muted album-meta-line">{tripMetaLine(trip)}</p> : null}
        {(trip?.memberCount ?? 1) > 1 ? (
          <p className="muted album-meta-line">
            {t("trips.sharedBadge")} · {t("trips.memberCount", { count: trip?.memberCount ?? 1 })}
          </p>
        ) : null}
      </header>

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

          <form className="stack" onSubmit={onSaveMeta}>
            <label className="row trip-meta-toggle">
              <input
                type="checkbox"
                checked={metaManual}
                onChange={(e) => setMetaManual(e.target.checked)}
              />
              <span>{t("trips.metaManual")}</span>
            </label>
            <p className="muted">{t("trips.metaManualHint")}</p>
            <p className="muted">
              {trip?.autoDateSummary || trip?.autoPlaceSummary
                ? t("trips.autoPreview", {
                    date: trip.autoDateSummary || "—",
                    place: trip.autoPlaceSummary || "—",
                  })
                : t("trips.autoPreviewEmpty")}
            </p>
            {metaManual ? (
              <>
                <label className="muted" htmlFor="trip-manual-date">
                  {t("trips.manualDate")}
                </label>
                <input
                  id="trip-manual-date"
                  className="input"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
                <label className="muted" htmlFor="trip-manual-place">
                  {t("trips.manualPlace")}
                </label>
                <input
                  id="trip-manual-place"
                  className="input"
                  value={manualPlace}
                  onChange={(e) => setManualPlace(e.target.value)}
                />
              </>
            ) : null}
            <div className="row">
              <button className="btn secondary" type="submit" disabled={savingMeta}>
                {savingMeta ? t("trips.savingMeta") : t("trips.saveMeta")}
              </button>
              {metaSavedFlash ? <span className="muted">{t("trips.metaSaved")}</span> : null}
            </div>
          </form>

          <section className="stack">
            <h2 className="section-title">{t("share.section")}</h2>
            {isAdmin ? (
              <>
                <p className="muted">
                  {t("share.inviteCode")}：<strong>{trip?.inviteCode ?? "—"}</strong>
                </p>
                <div className="row">
                  <button className="btn secondary" type="button" onClick={() => void onCopyInvite()}>
                    {copiedFlash ? t("share.copied") : t("share.copyCode")}
                  </button>
                </div>
                <label className="row trip-meta-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(trip?.allowJoin)}
                    disabled={allowJoinBusy}
                    onChange={(e) => void onToggleAllowJoin(e.target.checked)}
                  />
                  <span>{t("share.allowJoin")}</span>
                </label>
                <p className="muted">{t("share.allowJoinHint")}</p>
              </>
            ) : null}
            <p className="muted">{t("share.members")}</p>
            <ul className="stack share-member-list">
              {members.map((m) => (
                <li className="row share-member-row" key={m.userId}>
                  <span>
                    {m.displayName?.trim() || m.email}
                    {m.userId === userId ? `（${t("share.you")}）` : ""}
                    {m.isAdmin ? ` · ${t("share.admin")}` : ""}
                  </span>
                  {isAdmin && m.userId !== userId ? (
                    <button
                      className="text-link"
                      type="button"
                      disabled={kickingId === m.userId}
                      onClick={() => void onKick(m.userId)}
                    >
                      {kickingId === m.userId ? t("share.kicking") : t("share.kick")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {(trip?.memberCount ?? 1) > 1 || !isAdmin ? (
              <button
                className="btn secondary"
                type="button"
                disabled={leaving}
                onClick={() => void onLeaveTrip()}
              >
                {leaving ? t("share.leaving") : t("share.leave")}
              </button>
            ) : null}
          </section>

          {isAdmin ? (
            <form className="stack danger-zone" onSubmit={onDeleteTrip}>
              <p className="muted">{t("trips.deleteHint")}</p>
              {(trip?.memberCount ?? 1) > 1 ? (
                <p className="muted">{t("share.dissolveHint")}</p>
              ) : null}
              <p className="confirm-phrase">{t("trips.deleteConfirmPhrase")}</p>
              <input
                className="input"
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
          ) : null}
        </div>
      ) : null}

      <div className="album-toolbar">
        {!uploaderOpen ? (
          <button
            className="btn"
            type="button"
            onClick={() => setShowUploader(true)}
          >
            {t("album.addPhotos")}
          </button>
        ) : null}
      </div>

      {uploaderOpen ? (
        <form className="album-uploader stack" onSubmit={onUpload}>
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
            {files.length === 0 && !uploading ? (
              <button
                className="text-link"
                type="button"
                onClick={() => setShowUploader(false)}
              >
                {t("common.cancel")}
              </button>
            ) : null}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
            />
          ) : null}
          <button className="btn" type="submit" disabled={files.length === 0 || uploading || picking}>
            {uploadLabel}
          </button>
        </form>
      ) : null}

      {toast ? <p className="toast">{toast}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {loaded && observations.length === 0 ? (
        <div className="trip-empty">
          <p className="trip-empty-caption">{t("album.empty")}</p>
        </div>
      ) : null}

      <div className="album film-grid">
        {observations.map((obs) => (
          <article
            className={`film-tile${obs.status === "pending_settle" ? " is-pending" : ""}`}
            key={obs.id}
          >
            <Link className="film-tile-link" to={obsHref(obs)}>
              <div className="film-tile-media">
                <div className="film-tile-window">
                  <img
                    className="film-tile-photo"
                    src={obs.displayUrl}
                    alt={
                      obs.status === "pending_settle"
                        ? t("status.pending_settle")
                        : isNotCollectibleError(obs.error)
                          ? t("status.notCollectible")
                          : obs.commonName || t("map.observationFallback")
                    }
                  />
                  {obs.status === "pending_settle" ? (
                    <div className="film-tile-pending-veil" aria-hidden />
                  ) : null}
                </div>
                <img className="film-tile-frame" src={tripFilmFrameUrl()} alt="" aria-hidden />
                <div className="film-tile-badge">{statusBadge(obs)}</div>
              </div>
              <div className="film-tile-meta">
                {obs.status === "settled" ? (
                  <>
                    <strong>
                      {obs.commonName || obs.scientificName || t("detail.unnamed")}
                    </strong>
                    {obs.alertIntroduced ? (
                      <span className="intro-tag intro-tag-sm">
                        {t("settle.alertIntroduced")}
                      </span>
                    ) : null}
                    <span className="muted">
                      {t("album.reliableTo", {
                        rank: formatRank(obs.finestReliableRank),
                      })}
                    </span>
                  </>
                ) : null}
                {obs.status === "pending_settle" ? (
                  <span className="muted">{t("album.pendingHint")}</span>
                ) : null}
                {obs.status === "analyzing" ? (
                  <span className="muted">{t("status.analyzing")}</span>
                ) : null}
                {obs.status === "failed" ? (
                  <span className="error">{identifyErrorPrimary(obs.error)}</span>
                ) : null}
              </div>
            </Link>
            {obs.userId === userId ? (
              <button
                className="film-tile-delete"
                type="button"
                disabled={deletingId === obs.id}
                onClick={(ev) => askDeleteOne(obs.id, ev)}
              >
                {deletingId === obs.id ? t("album.deleting") : t("album.delete")}
              </button>
            ) : null}
          </article>
        ))}
      </div>

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
