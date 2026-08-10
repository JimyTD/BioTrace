import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type Trip } from "../api";

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
    <div className="stack">
      <div>
        <h1 className="brand">{t("trips.title")}</h1>
        <p className="lede">{t("trips.lede")}</p>
      </div>

      <form className="panel stack" onSubmit={onCreate}>
        <label className="muted" htmlFor="trip-title">
          {t("trips.createLabel")}
        </label>
        <div className="row">
          <input
            id="trip-title"
            className="input"
            placeholder={t("trips.createPlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn" type="submit">
            {t("trips.createAction")}
          </button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">{t("trips.loading")}</p> : null}

      {!loading && trips.length === 0 ? (
        <div className="panel">
          <p className="muted">{t("trips.empty")}</p>
        </div>
      ) : (
        <div className="trip-list">
          {trips.map((trip) => (
            <Link className="trip-item" key={trip.id} to={`/trips/${trip.id}`}>
              <strong>{trip.title}</strong>
              <span className="muted">{new Date(trip.createdAt).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
