import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type User } from "./api";
import CollectionPage from "./pages/CollectionPage";
import LoginPage from "./pages/LoginPage";
import MapPage from "./pages/MapPage";
import MePage from "./pages/MePage";
import ObservationDetailPage from "./pages/ObservationDetailPage";
import ObservationSettlePage from "./pages/ObservationSettlePage";
import TripAlbumPage from "./pages/TripAlbumPage";
import TripsPage from "./pages/TripsPage";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="login-screen">
        <p className="muted">{t("app.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }

  return (
    <div className="app-shell">
      <main className="content">
        <Routes>
          <Route path="/" element={<TripsPage />} />
          <Route path="/trips/:id" element={<TripAlbumPage />} />
          <Route path="/observations/:id" element={<ObservationDetailPage />} />
          <Route path="/settle/:id" element={<ObservationSettlePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route
            path="/me"
            element={
              <MePage user={user} onLogout={() => setUser(null)} onUserUpdated={setUser} />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="nav">
        <NavLink to="/" end>
          {t("nav.trips")}
        </NavLink>
        <NavLink to="/map">{t("nav.map")}</NavLink>
        <NavLink to="/collection">{t("nav.collection")}</NavLink>
        <NavLink to="/me">{t("nav.me")}</NavLink>
      </nav>
    </div>
  );
}
