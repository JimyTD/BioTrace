import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { Link, matchPath, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatRank, t } from "@biotrace/messages";
import { ApiError, api, type Observation, type Trip } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import { OpenBookCloseContext } from "../components/TripBookLayer";
import {
  identifyErrorPrimary,
  isNotCollectibleError,
} from "../identifyErrors";
import { canUseNativePicker, MAX_UPLOAD_BATCH, pickImageNative } from "../pickImage";
import { easeOutCubic, measureBox, nextPaint, prefersReducedMotion, tween } from "../motion";
import { playPhotoLift } from "../photoLift";
import {
  clearPhotoLiftHandoff,
  liftBackgroundState,
  peekPhotoLiftHandoff,
  setPhotoLiftHandoff,
} from "../photoLiftHandoff";
import { restoreAlbumScroll, saveAlbumScroll, saveContentScroll } from "../scrollMemory";
import { peekAlbum, rememberAlbum } from "../pageCache";
import { useRealLocation } from "../realLocation";
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

function albumMetaLine(trip: Trip): string {
  const parts = [tripMetaLine(trip)];
  if ((trip.memberCount ?? 1) > 1) {
    parts.push(
      t("trips.sharedBadge"),
      t("trips.memberCount", { count: trip.memberCount ?? 1 }),
    );
  }
  return parts.join(" · ");
}

export default function TripAlbumPage({ userId }: { userId: string }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const real = useRealLocation();
  const onAlbum = Boolean(real && matchPath("/trips/:id", real.pathname)?.params.id === id);
  const closeBook = useContext(OpenBookCloseContext);
  const [trip, setTrip] = useState<Trip | null>(() => peekAlbum(id)?.trip ?? null);
  const [observations, setObservations] = useState<Observation[]>(
    () => peekAlbum(id)?.observations ?? [],
  );
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
  const [loaded, setLoaded] = useState(() => Boolean(peekAlbum(id)));
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativePicker = canUseNativePicker();
  const prevPending = useRef(0);
  const seenIds = useRef<Set<string> | null>(null);
  const [slottingIds, setSlottingIds] = useState<Set<string>>(() => new Set());
  const [liftSourceId, setLiftSourceId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const returnPlayed = useRef(false);

  const analyzingIds = useMemo(
    () => observations.filter((o) => o.status === "analyzing").map((o) => o.id),
    [observations],
  );
  const pendingCount = useMemo(
    () => observations.filter((o) => o.status === "pending_settle").length,
    [observations],
  );

  const pickingOpen = files.length > 0 || uploading;

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
    setObservations(obsRes.observations);
    rememberAlbum(id, { trip: tripRes.trip, observations: obsRes.observations });
    setLoaded(true);
  }

  useEffect(() => {
    const hit = peekAlbum(id);
    if (hit) {
      setTrip(hit.trip);
      setObservations(hit.observations);
      setLoaded(true);
      if (seenIds.current === null) {
        seenIds.current = new Set(hit.observations.map((o) => o.id));
      }
    } else {
      setLoaded(false);
      setTrip(null);
      setObservations([]);
      seenIds.current = null;
    }
    setSlottingIds(new Set());
    refresh()
      .then(() => undefined)
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("trips.loadFailed"));
        setLoaded(true);
      });
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const ids = observations.map((o) => o.id);
    if (seenIds.current === null) {
      seenIds.current = new Set(ids);
      return;
    }
    const skipId =
      peekPhotoLiftHandoff()?.dir === "close"
        ? peekPhotoLiftHandoff()?.observationId ?? null
        : null;
    const fresh = ids.filter(
      (obsId) => !seenIds.current!.has(obsId) && obsId !== skipId,
    );
    if (fresh.length === 0) return;
    for (const obsId of fresh) seenIds.current.add(obsId);
    setSlottingIds((prev) => {
      const next = new Set(prev);
      for (const obsId of fresh) next.add(obsId);
      return next;
    });
    return undefined;
  }, [loaded, observations]);

  useEffect(() => {
    if (slottingIds.size === 0) return;
    let cancelled = false;
    const reduce = prefersReducedMotion();
    void (async () => {
      await nextPaint();
      if (cancelled) return;
      const photos = [
        ...document.querySelectorAll<HTMLElement>(".film-tile.is-slotting .film-tile-photo"),
      ];
      if (photos.length === 0) return;
      await Promise.all(
        photos.map((img) =>
          img instanceof HTMLImageElement && img.decode
            ? img.decode().catch(() => undefined)
            : Promise.resolve(),
        ),
      );
      await nextPaint();
      if (cancelled) return;
      if (reduce) {
        for (const photo of photos) photo.style.transform = "translateY(0)";
        setSlottingIds(new Set());
        return;
      }
      await tween(
        640,
        (t) => {
          const y = (1 - easeOutCubic(t)) * 108;
          for (const photo of photos) photo.style.transform = `translateY(${y}%)`;
        },
        () => cancelled,
      );
      if (cancelled) return;
      for (const photo of photos) photo.style.transform = "translateY(0)";
      setSlottingIds(new Set());
    })();
    return () => {
      cancelled = true;
    };
  }, [slottingIds]);

  useLayoutEffect(() => {
    if (!onAlbum || !loaded) {
      if (!onAlbum) returnPlayed.current = false;
      return;
    }
    restoreAlbumScroll(id);
    if (returnPlayed.current) return;
    const found = peekPhotoLiftHandoff();
    if (
      !found ||
      found.dir !== "close" ||
      found.origin.kind !== "album" ||
      found.origin.tripId !== id
    ) {
      return;
    }
    const photo = document.querySelector<HTMLElement>(
      `.film-tile[data-obs-id="${found.observationId}"] .film-tile-photo`,
    );
    const page = pageRef.current;
    if (!photo || !page) return;
    returnPlayed.current = true;
    clearPhotoLiftHandoff();
    setLiftSourceId(found.observationId);
    let cancelled = false;
    void playPhotoLift({
      photoUrl: found.photoUrl,
      from: found.box,
      to: () => measureBox(photo),
      page,
      hide: photo,
      duration: 380,
      pageFade: "none",
      cancelled: () => cancelled,
      onLanded: () => {
        if (!cancelled) flushSync(() => setLiftSourceId(null));
      },
    });
    return () => {
      cancelled = true;
    };
  }, [onAlbum, loaded, observations, id]);

  function openPhoto(obs: Observation, windowEl: HTMLElement | null) {
    saveAlbumScroll(id);
    saveContentScroll("trips");
    if (windowEl) {
      setPhotoLiftHandoff({
        observationId: obs.id,
        photoUrl: obs.displayUrl,
        box: measureBox(windowEl),
        dir: "open",
        origin: { kind: "album", tripId: id },
      });
    }
    navigate(obsHref(obs), { state: liftBackgroundState(location) });
  }

  useEffect(() => {
    if (analyzingIds.length === 0) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [analyzingIds.join(","), id]);

  function clearPickedInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  function clearPicked() {
    setFiles([]);
    setDescription("");
    clearPickedInputs();
  }

  async function onPick() {
    setError(null);
    if (nativePicker) {
      setPicking(true);
      try {
        const picked = await pickImageNative();
        if (picked.length) applyPickedFiles(picked);
      } catch {
        setError(t("album.pickFailed"));
      } finally {
        setPicking(false);
      }
      return;
    }
    fileInputRef.current?.click();
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
      clearPicked();
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

  const uploadLabel = uploading
    ? uploadProgress
      ? t("album.uploadingProgress", {
          current: uploadProgress.current,
          total: uploadProgress.total,
        })
      : t("album.uploading")
    : t("album.upload");

  return (
    <div className="stack page-album" ref={pageRef}>
      <header className="page-head album-head">
        <div className="album-head-row">
          <Link
            className="text-link"
            to="/"
            onClick={(e) => {
              if (!closeBook) return;
              e.preventDefault();
              closeBook();
            }}
          >
            ← {t("album.back")}
          </Link>
          <Link
            className="text-link"
            to={`/trips/${id}/manage`}
            onClick={() => {
              saveAlbumScroll(id);
              saveContentScroll("trips");
            }}
          >
            {t("trips.manage")}
          </Link>
        </div>
        <h1 className="page-title">{trip?.title ?? t("nav.trips")}</h1>
        {trip ? <p className="muted album-meta-line">{albumMetaLine(trip)}</p> : null}
      </header>

      <input
        ref={fileInputRef}
        className="file-input-hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => applyPickedFiles(e.target.files)}
      />

      {!pickingOpen ? (
        <div className="album-toolbar">
          <button
            className="btn"
            type="button"
            disabled={picking}
            onClick={() => void onPick()}
          >
            {picking ? t("album.picking") : t("album.addPhotos")}
          </button>
        </div>
      ) : (
        <form className="album-uploader stack" onSubmit={onUpload}>
          <div className="row">
            <button
              className="btn secondary"
              type="button"
              disabled={picking || uploading}
              onClick={() => void onPick()}
            >
              {t("album.pickGallery")}
            </button>
            {!uploading ? (
              <button className="text-link" type="button" onClick={clearPicked}>
                {t("common.cancel")}
              </button>
            ) : null}
          </div>
          <span className="muted">
            {picking ? t("album.picking") : t("album.filesChosen", { count: files.length })}
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
      )}

      {toast ? <p className="toast">{toast}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {loaded && observations.length === 0 && !pickingOpen ? (
        <div className="trip-empty">
          <p className="trip-empty-caption">{t("album.empty")}</p>
        </div>
      ) : null}

      <div className="album film-grid">
        {observations.map((obs) => (
          <article
            className={`film-tile${obs.status === "pending_settle" ? " is-pending" : ""}${
              slottingIds.has(obs.id) ? " is-slotting" : ""
            }${liftSourceId === obs.id ? " is-lift-source" : ""}`}
            key={obs.id}
            data-obs-id={obs.id}
          >
            <button
              type="button"
              className="film-tile-link"
              aria-label={t("album.liftPhoto")}
              onPointerDown={(e) => {
                const windowEl = e.currentTarget.querySelector(".film-tile-window");
                if (windowEl instanceof HTMLElement) {
                  setPhotoLiftHandoff({
                    observationId: obs.id,
                    photoUrl: obs.displayUrl,
                    box: measureBox(windowEl),
                    dir: "open",
                    origin: { kind: "album", tripId: id },
                  });
                }
              }}
              onClick={(e) => {
                const windowEl = e.currentTarget.querySelector(".film-tile-window");
                openPhoto(obs, windowEl instanceof HTMLElement ? windowEl : null);
              }}
            >
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
                  {obs.status === "pending_settle" && !slottingIds.has(obs.id) ? (
                    <div className="film-tile-pending-seal" aria-hidden />
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
            </button>
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
