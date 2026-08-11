import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type Trip } from "../api";
import { tripMetaLine } from "../tripMeta";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="stack page-trips">
      <header className="page-head">
        <h1 className="page-title">{t("trips.title")}</h1>
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
        <button className="btn" type="submit" disabled={!title.trim()}>
          {t("trips.createAction")}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t("trips.loading")}</p> : null}

      {!loading && trips.length === 0 ? (
        <p className="muted empty-hint">{t("trips.empty")}</p>
      ) : (
        <div className="trip-cover-list">
          {trips.map((trip) => (
              <Link className="trip-cover" key={trip.id} to={`/trips/${trip.id}`}>
                <div className="trip-cover-media">
                  {trip.coverDisplayUrl ? (
                    <img src={trip.coverDisplayUrl} alt="" />
                  ) : (
                    <div className="trip-cover-placeholder" aria-hidden />
                  )}
                </div>
                <div className="trip-cover-meta">
                  <strong>{trip.title}</strong>
                  <span className="muted">{tripMetaLine(trip)}</span>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
