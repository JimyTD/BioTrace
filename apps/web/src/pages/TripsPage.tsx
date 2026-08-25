import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type Trip } from "../api";
import { captureCoverBox, setOpenBookHandoff } from "../openBookHandoff";
import { tripCoverFrameUrl, tripFrontispieceUrl } from "../themes";
import { restoreContentScroll, saveContentScroll } from "../scrollMemory";
import { tripMetaLine } from "../tripMeta";

export default function TripsPage({
  activeTripId,
  bookOpen = false,
}: {
  activeTripId?: string;
  bookOpen?: boolean;
}) {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  async function refresh() {
    const { trips: rows } = await api.listTrips();
    setTrips(rows);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : t("trips.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    restoreContentScroll("trips");
  }, [loading]);

  function upsertTrip(trip: Trip) {
    setTrips((prev) => [trip, ...prev.filter((row) => row.id !== trip.id)]);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      const { trip } = await api.createTrip(title.trim());
      setTitle("");
      upsertTrip(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.createFailed"));
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError(null);
    setJoining(true);
    try {
      const { trip } = await api.joinTrip(joinCode.trim());
      setJoinCode("");
      setShowJoin(false);
      upsertTrip(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.joinFailed"));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="stack page-trips" {...(bookOpen ? { inert: true } : {})}>
      <header className="page-head">
        <h1 className="page-title">{t("trips.title")}</h1>
        <p className="lede">{t("trips.lede")}</p>
      </header>

      <form className="trip-create-inline" onSubmit={onCreate}>
        <label className="sr-only" htmlFor="trip-title">
          {t("trips.createLabel")}
        </label>
        <input
          id="trip-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("trips.createLabel")}
        />
        <button className="btn secondary" type="submit" disabled={!title.trim()}>
          {t("trips.createAction")}
        </button>
      </form>

      {!showJoin ? (
        <button
          className="btn secondary trip-join-toggle"
          type="button"
          onClick={() => setShowJoin(true)}
        >
          {t("trips.joinLabel")}
        </button>
      ) : (
        <div className="trip-join-panel">
          <form className="trip-create-inline" onSubmit={onJoin}>
            <label className="sr-only" htmlFor="trip-join-code">
              {t("trips.joinLabel")}
            </label>
            <input
              id="trip-join-code"
              className="input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t("trips.joinLabel")}
              autoComplete="off"
            />
            <button className="btn secondary" type="submit" disabled={!joinCode.trim() || joining}>
              {joining ? t("trips.joining") : t("trips.joinAction")}
            </button>
          </form>
          <button
            className="text-link trip-join-toggle"
            type="button"
            onClick={() => {
              setShowJoin(false);
              setJoinCode("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t("trips.loading")}</p> : null}

      {!loading && trips.length === 0 ? (
        <div className="trip-empty">
          <div
            className="trip-frontispiece"
            style={{ backgroundImage: `url(${tripFrontispieceUrl()})` }}
          >
            <p className="trip-empty-caption">{t("trips.empty")}</p>
          </div>
        </div>
      ) : (
        <div className="trip-cover-list">
          {trips.map((trip) => (
            <button
              type="button"
              className={`trip-cover${activeTripId === trip.id ? " is-book-source" : ""}`}
              key={trip.id}
              onPointerDown={(e) => {
                const media = e.currentTarget.querySelector(".trip-cover-media");
                if (!(media instanceof HTMLElement)) return;
                setOpenBookHandoff({
                  tripId: trip.id,
                  coverUrl: trip.coverDisplayUrl ?? null,
                  source: captureCoverBox(media),
                });
              }}
              onTouchStart={(e) => {
                const media = e.currentTarget.querySelector(".trip-cover-media");
                if (!(media instanceof HTMLElement)) return;
                setOpenBookHandoff({
                  tripId: trip.id,
                  coverUrl: trip.coverDisplayUrl ?? null,
                  source: captureCoverBox(media),
                });
              }}
              onClick={(e) => {
                const media = e.currentTarget.querySelector(".trip-cover-media");
                if (media instanceof HTMLElement) {
                  setOpenBookHandoff({
                    tripId: trip.id,
                    coverUrl: trip.coverDisplayUrl ?? null,
                    source: captureCoverBox(media),
                  });
                }
                saveContentScroll("trips");
                navigate(`/trips/${trip.id}`);
              }}
            >
              <div className="trip-cover-media">
                <div className="trip-cover-window">
                  {trip.coverDisplayUrl ? (
                    <img className="trip-cover-photo" src={trip.coverDisplayUrl} alt="" />
                  ) : (
                    <div className="trip-cover-placeholder" aria-hidden />
                  )}
                </div>
                <img className="trip-cover-frame" src={tripCoverFrameUrl()} alt="" aria-hidden />
                {(trip.memberCount ?? 1) > 1 ? (
                  <span className="trip-cover-share">{t("trips.sharedBadge")}</span>
                ) : null}
              </div>
              <div className="trip-cover-meta">
                <strong>{trip.title}</strong>
                <span className="muted">{tripMetaLine(trip)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
