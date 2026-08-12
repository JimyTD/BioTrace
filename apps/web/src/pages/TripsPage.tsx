import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type Trip } from "../api";
import { tripCoverFrameUrl } from "../themes";
import { tripMetaLine } from "../tripMeta";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  async function refresh() {
    const { trips: rows } = await api.listTrips();
    setTrips(rows);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : t("trips.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      await api.createTrip(title.trim());
      setTitle("");
      await refresh();
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
      await api.joinTrip(joinCode.trim());
      setJoinCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trips.joinFailed"));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="stack page-trips">
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
        />
        <button className="btn secondary" type="submit" disabled={!title.trim()}>
          {t("trips.createAction")}
        </button>
      </form>

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
          {t("trips.joinAction")}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t("trips.loading")}</p> : null}

      {!loading && trips.length === 0 ? (
        <div className="trip-empty">
          <p className="trip-empty-caption">{t("trips.empty")}</p>
        </div>
      ) : (
        <div className="trip-cover-list">
          {trips.map((trip) => (
            <Link className="trip-cover" key={trip.id} to={`/trips/${trip.id}`}>
              <div className="trip-cover-media">
                {trip.coverDisplayUrl ? (
                  <img className="trip-cover-photo" src={trip.coverDisplayUrl} alt="" />
                ) : (
                  <div className="trip-cover-placeholder" aria-hidden />
                )}
                <img className="trip-cover-frame" src={tripCoverFrameUrl()} alt="" aria-hidden />
              </div>
              <div className="trip-cover-meta">
                <strong>{trip.title}</strong>
                <span className="muted">{tripMetaLine(trip)}</span>
                {(trip.memberCount ?? 1) > 1 ? (
                  <span className="muted">
                    {t("trips.sharedBadge")} · {t("trips.memberCount", { count: trip.memberCount ?? 1 })}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
