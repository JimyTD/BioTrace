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
import { useBackClose } from "../androidBack";
import ConfirmDialog from "../components/ConfirmDialog";
import { OpenBookCloseContext } from "../components/TripBookLayer";
import {
  identifyErrorPrimary,
  isNotCollectibleError,
} from "../identifyErrors";
import {
  canUseNativePicker,
  MAX_UPLOAD_BATCH,
  pickImageNative,
  readDeviceFix,
  resolveDeviceFix,
  type DeviceFix,
  type PickImageMode,
} from "../pickImage";
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

/**
 * 片框沿上的标注。默认皮肤不显示（CSS 关掉），要用的皮肤自己打开。
 * 只给日期和序号这类纯数据，不出句子，所以不走 messages。
 */
function tileDate(obs: Observation) {
  const d = new Date(obs.capturedAt ?? obs.createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tileNo(index: number) {
  return String(index + 1).padStart(2, "0");
}

function obsHref(obs: Observation) {
  if (obs.status === "pending_settle") return `/settle/${obs.id}`;
  return `/observations/${obs.id}`;
}

/**
 * 只有相片才被拿起。待开包的格子是封着的一只，点它是去揭封，
 * 不能让照片（哪怕是模糊的那张）先飞一趟——会提前泄底。
 */
function liftable(obs: Observation) {
  return obs.status !== "pending_settle";
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
  useBackClose(() => {
    if (closeBook) closeBook();
    else navigate("/");
  });
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
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const deviceFixRef = useRef<Promise<DeviceFix> | null>(null);
  const [useDeviceFix, setUseDeviceFix] = useState(false);
  const nativePicker = canUseNativePicker();
  const prevPending = useRef(0);
  const seenIds = useRef<Set<string> | null>(null);
  const [slottingIds, setSlottingIds] = useState<Set<string>>(() => new Set());
  const [liftSourceId, setLiftSourceId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const returnPlayed = useRef(false);
  const scrollRestoredFor = useRef<string | null>(null);
  const leftAlbum = useRef(false);
  const refreshAfterLift = useRef(false);

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

  // 相册在覆盖层下不会卸载，开包或详情页改过状态（待开包 → 已收录、删除等）后，
  // 回到相册必须重取，否则格子还停在旧状态。
  // 但照片正飞回格子时不能换数据，否则又是那个闪一下——挂账到落地后补。
  useEffect(() => {
    if (!onAlbum) {
      leftAlbum.current = true;
      return;
    }
    if (!leftAlbum.current) return;
    leftAlbum.current = false;
    if (returnPlayed.current) {
      refreshAfterLift.current = true;
      return;
    }
    void refresh().catch(() => undefined);
  }, [onAlbum, id]);

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
      if (!onAlbum) {
        returnPlayed.current = false;
        scrollRestoredFor.current = null;
      }
      return;
    }
    if (scrollRestoredFor.current !== id) {
      restoreAlbumScroll(id);
      scrollRestoredFor.current = id;
    }
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
    }).then(() => {
      if (cancelled || !refreshAfterLift.current) return;
      refreshAfterLift.current = false;
      void refresh().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [onAlbum, loaded, observations, id]);

  function openPhoto(obs: Observation, windowEl: HTMLElement | null) {
    saveAlbumScroll(id);
    saveContentScroll("trips");
    if (windowEl && liftable(obs)) {
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
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function applyPickedFiles(list: File[] | FileList | null, source: PickImageMode = "gallery") {
    if (!list || list.length === 0) {
      setFiles([]);
      setDescription("");
      setUseDeviceFix(false);
      deviceFixRef.current = null;
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
    setUseDeviceFix(source === "camera");
    if (source !== "camera") deviceFixRef.current = null;
  }

  function clearPicked() {
    setFiles([]);
    setDescription("");
    setUseDeviceFix(false);
    deviceFixRef.current = null;
    clearPickedInputs();
  }

  async function onPick(mode: PickImageMode) {
    setError(null);
    if (mode === "camera") {
      deviceFixRef.current = readDeviceFix();
    } else {
      deviceFixRef.current = null;
      setUseDeviceFix(false);
    }
    if (nativePicker) {
      setPicking(true);
      try {
        const picked = await pickImageNative(mode);
        if (picked.length) {
          if (mode === "camera") {
            deviceFixRef.current = resolveDeviceFix(deviceFixRef.current);
          }
          applyPickedFiles(picked, mode);
        }
        else if (mode === "camera" && files.length === 0) {
          deviceFixRef.current = null;
          setUseDeviceFix(false);
        }
      } catch {
        setError(t("album.pickFailed"));
        if (mode === "camera" && files.length === 0) {
          deviceFixRef.current = null;
          setUseDeviceFix(false);
        }
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
    const fix = useDeviceFix ? await deviceFixRef.current : null;
    let ok = 0;
    let fail = 0;
    let dup = 0;
    let dailyLimitHits = 0;
    try {
      for (let i = 0; i < batch.length; i++) {
        setUploadProgress({ current: i + 1, total: batch.length });
        try {
          const res = await api.uploadObservation(id, batch[i]!, desc, fix ?? undefined);
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
            className="btn secondary"
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
        onChange={(e) => applyPickedFiles(e.target.files, "gallery")}
      />
      <input
        ref={cameraInputRef}
        className="file-input-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files?.length) {
            deviceFixRef.current = resolveDeviceFix(deviceFixRef.current);
          }
          applyPickedFiles(e.target.files, "camera");
        }}
      />

      {!pickingOpen ? (
        <div>
          <div className="album-toolbar">
            <button
              className="btn"
              type="button"
              disabled={picking}
              onClick={() => void onPick("gallery")}
            >
              {picking ? t("album.picking") : t("album.addPhotos")}
            </button>
            <button
              className="text-link"
              type="button"
              disabled={picking || uploading}
              onClick={() => void onPick("camera")}
            >
              {t("album.takePhoto")}
            </button>
          </div>
          <p className="muted album-camera-hint">{t("album.cameraQualityHint")}</p>
        </div>
      ) : (
        <form className="album-uploader stack" onSubmit={onUpload}>
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
        {observations.map((obs, index) => (
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
              aria-label={liftable(obs) ? t("album.liftPhoto") : t("settle.open")}
              onPointerDown={(e) => {
                const windowEl = e.currentTarget.querySelector(".film-tile-window");
                if (windowEl instanceof HTMLElement && liftable(obs)) {
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
              {/* 零件一次渲全，摆在哪由皮肤的 CSS 定。见 docs/features/皮肤主题.md §2.3 */}
              <span className="film-tile-mount" aria-hidden />
              <span className="film-tile-window">
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
              </span>
              <img className="film-tile-frame" src={tripFilmFrameUrl()} alt="" aria-hidden />
              <span className="film-tile-seal">{t("settle.open")}</span>
              <span className="film-tile-badge">{statusBadge(obs)}</span>
              <span className="film-tile-mark" aria-hidden>
                <span className="film-tile-mark-date">{tileDate(obs)}</span>
                <span className="film-tile-mark-no">{tileNo(index)}</span>
              </span>
              <span className="film-tile-caption">
                {obs.status === "settled" ? (
                  <>
                    <strong className="film-tile-name">
                      {obs.commonName || obs.scientificName || t("detail.unnamed")}
                    </strong>
                    {obs.alertIntroduced ? (
                      <span className="intro-tag intro-tag-sm">
                        {t("settle.alertIntroduced")}
                      </span>
                    ) : null}
                    <span className="muted film-tile-rank">
                      {t("album.reliableTo", {
                        rank: formatRank(obs.finestReliableRank),
                      })}
                    </span>
                  </>
                ) : null}
                {obs.status === "pending_settle" ? (
                  <span className="muted film-tile-hint">{t("album.pendingHint")}</span>
                ) : null}
                {obs.status === "analyzing" ? (
                  <span className="muted film-tile-hint">{t("status.analyzing")}</span>
                ) : null}
                {obs.status === "failed" ? (
                  <span className="error film-tile-error">{identifyErrorPrimary(obs.error)}</span>
                ) : null}
                {obs.uploaderName ? (
                  <span className="muted film-tile-owner">
                    {t("album.uploadedBy", {
                      name: obs.userId === userId ? t("share.you") : obs.uploaderName,
                    })}
                  </span>
                ) : null}
              </span>
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
