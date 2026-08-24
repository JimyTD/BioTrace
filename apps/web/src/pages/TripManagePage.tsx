import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { t } from "@biotrace/messages";
import { useBackClose } from "../androidBack";
import { api, type Trip, type TripMember } from "../api";
import { copyText } from "../copyText";

export default function TripManagePage({ userId }: { userId: string }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  useBackClose(() => navigate(`/trips/${id}`));
  const inviteInputRef = useRef<HTMLInputElement | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [metaManual, setMetaManual] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualPlace, setManualPlace] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSavedFlash, setMetaSavedFlash] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [allowJoinBusy, setAllowJoinBusy] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const isAdmin = Boolean(trip?.isAdmin);

  async function refresh() {
    const [tripRes, membersRes] = await Promise.all([
      api.getTrip(id),
      api.listTripMembers(id),
    ]);
    setTrip(tripRes.trip);
    setTitleDraft(tripRes.trip.title);
    setMetaManual(Boolean(tripRes.trip.metaManualEnabled));
    setManualDate(tripRes.trip.manualDateText ?? "");
    setManualPlace(tripRes.trip.manualPlaceText ?? "");
    setMembers(membersRes.members);
    setLoaded(true);
  }

  useEffect(() => {
    setLoaded(false);
    refresh()
      .then(() => undefined)
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("trips.loadFailed"));
        setLoaded(true);
      });
  }, [id]);

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
    const code = trip?.inviteCode?.trim();
    if (!code) {
      setError(t("share.inviteMissing"));
      return;
    }
    setError(null);
    try {
      const ok = await copyText(code, { selectEl: inviteInputRef.current });
      if (!ok) {
        setError(t("share.copyFailed"));
        return;
      }
      setCopiedFlash(true);
      window.setTimeout(() => setCopiedFlash(false), 2000);
    } catch {
      setError(t("share.copyFailed"));
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

  return (
    <div className="stack page-album-manage">
      <header className="page-head me-sub-head">
        <Link className="text-link" to={`/trips/${id}`}>
          ← {t("trips.manageBack")}
        </Link>
        <h1 className="page-title">{t("trips.manage")}</h1>
      </header>

      {!loaded ? <p className="muted">{t("app.loading")}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {loaded && trip ? (
        <>
          <form className="me-section stack" onSubmit={onSaveTitle}>
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

          <form className="me-section stack" onSubmit={onSaveMeta}>
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
              {trip.autoDateSummary || trip.autoPlaceSummary
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

          <section className="me-section stack">
            <h2 className="me-section-title">{t("share.section")}</h2>
            {isAdmin ? (
              <>
                <label className="muted" htmlFor="trip-invite-code">
                  {t("share.inviteCode")}
                </label>
                <div className="row">
                  <input
                    id="trip-invite-code"
                    ref={inviteInputRef}
                    className="input"
                    value={trip.inviteCode ?? ""}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button className="btn secondary" type="button" onClick={() => void onCopyInvite()}>
                    {copiedFlash ? t("share.copied") : t("share.copyCode")}
                  </button>
                </div>
                <label className="row trip-meta-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(trip.allowJoin)}
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
            {(trip.memberCount ?? 1) > 1 || !isAdmin ? (
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
            <form className="me-section stack danger-zone" onSubmit={onDeleteTrip}>
              <p className="muted">{t("trips.deleteHint")}</p>
              {(trip.memberCount ?? 1) > 1 ? (
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
        </>
      ) : null}
    </div>
  );
}
