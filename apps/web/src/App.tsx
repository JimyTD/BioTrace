import { useEffect, useState } from "react";
import { listenAndroidBack } from "./androidBack";
import {
  matchPath,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { t } from "@biotrace/messages";
import { api, type User } from "./api";
import ForceAppUpdateGate from "./components/ForceAppUpdateGate";
import PageOverlay from "./PageOverlay";
import CollectionPage from "./pages/CollectionPage";
import CollectionSpeciesCardPage from "./pages/CollectionSpeciesCardPage";
import CollectionSpeciesPage from "./pages/CollectionSpeciesPage";
import CollectionTreePage from "./pages/CollectionTreePage";
import CollectionVolumePage from "./pages/CollectionVolumePage";
import LoginPage from "./pages/LoginPage";
import OnboardInsert from "./components/OnboardInsert";
import { hasOnboardSeen, markOnboardSeen } from "./onboardSeen";
import MapPage from "./pages/MapPage";
import MeAboutPage from "./pages/MeAboutPage";
import MeAppearancePage from "./pages/MeAppearancePage";
import MeIdentifyPage from "./pages/MeIdentifyPage";
import MePage from "./pages/MePage";
import MeProfilePage from "./pages/MeProfilePage";
import MeSecurityPage from "./pages/MeSecurityPage";
import ObservationDetailPage from "./pages/ObservationDetailPage";
import ObservationSettlePage from "./pages/ObservationSettlePage";
import PinLocationPage from "./pages/PinLocationPage";
import SettleArtPreviewPage from "./pages/SettleArtPreviewPage";
import TripBookLayer from "./components/TripBookLayer";
import TripAlbumPage from "./pages/TripAlbumPage";
import TripManagePage from "./pages/TripManagePage";
import TripsPage from "./pages/TripsPage";
import { peekLiftBackground } from "./photoLiftHandoff";
import { RealLocationContext } from "./realLocation";

function TripsShelf({ userId }: { userId: string }) {
  const { id } = useParams();
  return (
    <>
      <TripsPage activeTripId={id} bookOpen={Boolean(id)} />
      {id ? (
        <TripBookLayer tripId={id}>
          <TripAlbumPage userId={userId} />
        </TripBookLayer>
      ) : null}
    </>
  );
}

function CollectionLayout() {
  return (
    <>
      <CollectionPage />
      <Outlet />
    </>
  );
}

function SpeciesListLayout() {
  return (
    <>
      <CollectionSpeciesPage />
      <Outlet />
    </>
  );
}

function AppShell({
  user,
  setUser,
  onOpenHelp,
}: {
  user: User;
  setUser: (user: User | null) => void;
  onOpenHelp: () => void;
}) {
  const location = useLocation();
  const background = peekLiftBackground(location);
  const overlayPhoto =
    Boolean(background) &&
    Boolean(
      matchPath("/observations/:id", location.pathname) ||
        matchPath("/settle/:id", location.pathname),
    );
  const collectionHeld = Boolean(
    location.pathname.startsWith("/collection") ||
      (background && background.pathname.startsWith("/collection")),
  );

  return (
    <RealLocationContext.Provider value={location}>
      <div className="app-shell">
        <header className="app-topbar">
          <span className="app-wordmark">{t("app.name")}</span>
        </header>
        <main className="content">
          <Routes location={overlayPhoto ? background : location}>
            <Route element={<TripsShelf userId={user.id} />}>
              <Route index element={null} />
              <Route path="trips/:id" element={null} />
            </Route>
            <Route path="/trips/:id/manage" element={<TripManagePage userId={user.id} />} />
            <Route path="/observations/:id/pin" element={<PinLocationPage />} />
            <Route path="/observations/:id" element={<ObservationDetailPage userId={user.id} />} />
            <Route path="/settle/:id" element={<ObservationSettlePage userId={user.id} />} />
            <Route path="/dev/settle-art" element={<SettleArtPreviewPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/collection" element={<CollectionLayout />}>
              <Route index element={null} />
              <Route
                path="volumes/:id"
                element={
                  <PageOverlay className="is-volume">
                    <CollectionVolumePage />
                  </PageOverlay>
                }
              />
            </Route>
            <Route path="/collection/species" element={<SpeciesListLayout />}>
              <Route index element={null} />
              <Route
                path=":id"
                element={
                  <PageOverlay className="is-species">
                    <CollectionSpeciesCardPage />
                  </PageOverlay>
                }
              />
            </Route>
            <Route path="/collection/tree" element={<CollectionTreePage />} />
            <Route path="/collection/tree/*" element={<CollectionTreePage />} />
            <Route
              path="/me"
              element={<MePage user={user} onLogout={() => setUser(null)} onOpenHelp={onOpenHelp} />}
            />
            <Route
              path="/me/profile"
              element={<MeProfilePage user={user} onUserUpdated={setUser} />}
            />
            <Route path="/me/security" element={<MeSecurityPage />} />
            <Route path="/me/identify" element={<MeIdentifyPage />} />
            <Route path="/me/appearance" element={<MeAppearancePage />} />
            <Route path="/me/about" element={<MeAboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {overlayPhoto ? (
            <PageOverlay className="is-photo">
              <Routes location={location}>
                <Route path="/observations/:id" element={<ObservationDetailPage userId={user.id} />} />
                <Route path="/settle/:id" element={<ObservationSettlePage userId={user.id} />} />
              </Routes>
            </PageOverlay>
          ) : null}
        </main>
        <nav className="nav" aria-label={t("app.name")}>
          <NavLink to="/" end>
            {t("nav.trips")}
          </NavLink>
          <NavLink to="/map">{t("nav.map")}</NavLink>
          <NavLink
            to="/collection"
            className={({ isActive }) => (isActive || collectionHeld ? "active" : undefined)}
          >
            {t("nav.collection")}
          </NavLink>
          <NavLink to="/me">{t("nav.me")}</NavLink>
        </nav>
      </div>
    </RealLocationContext.Provider>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [flyleaf, setFlyleaf] = useState(false);
  const [onboardReplay, setOnboardReplay] = useState(false);

  useEffect(() => listenAndroidBack(), []);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user);
        setFlyleaf(!r.user);
      })
      .catch(() => {
        setUser(null);
        setFlyleaf(true);
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="login-screen is-boot">
        <p className="muted">{t("app.loading")}</p>
      </div>
    );
  }

  const showOnboard = Boolean(
    user && !flyleaf && (onboardReplay || !hasOnboardSeen(user.id)),
  );

  return (
    <>
      {user ? (
        <>
          <ForceAppUpdateGate enabled />
          <AppShell
            user={user}
            onOpenHelp={() => setOnboardReplay(true)}
            setUser={(next) => {
              setUser(next);
              if (!next) {
                setFlyleaf(true);
                setOnboardReplay(false);
              }
            }}
          />
        </>
      ) : null}
      {showOnboard && user ? (
        <OnboardInsert
          mode={onboardReplay ? "replay" : "first"}
          onClose={() => {
            markOnboardSeen(user.id);
            setOnboardReplay(false);
          }}
        />
      ) : null}
      {flyleaf ? (
        <LoginPage
          onLoggedIn={setUser}
          onOpened={() => setFlyleaf(false)}
        />
      ) : null}
    </>
  );
}
