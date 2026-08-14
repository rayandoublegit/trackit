"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { getSavedCreators } from "@/lib/db";
import {
  createPlannerMeetingNote,
  loadPlannerMeetingNotes,
  savePlannerMeetingNotes,
  type PlannerMeetingNote,
  type PlannerNoteCreator,
  type PlannerNoteKind,
  type PlannerNoteStatus,
  type PlannerNoteTime,
} from "@/lib/planner-notes-storage";

type CreatorOption = PlannerNoteCreator;

type FilterTime = "all" | PlannerNoteTime;
type FilterStatus = "all" | PlannerNoteStatus;
type FilterKind = "all" | PlannerNoteKind;

function timeLabel(t: PlannerNoteTime, fr: boolean) {
  if (t === "today") return fr ? "Aujourd’hui" : "Today";
  if (t === "tomorrow") return fr ? "Demain" : "Tomorrow";
  if (t === "this_week") return fr ? "Cette semaine" : "This week";
  return fr ? "Plus tard" : "Later";
}

function statusLabel(s: PlannerNoteStatus, fr: boolean) {
  if (s === "incoming") return fr ? "À venir" : "Incoming";
  if (s === "ongoing") return fr ? "En cours" : "Ongoing";
  if (s === "follow_up") return fr ? "Suivi" : "Follow-up";
  return fr ? "Terminé" : "Done";
}

function kindLabel(k: PlannerNoteKind, fr: boolean) {
  if (k === "meeting") return fr ? "Meeting" : "Meeting";
  if (k === "follow_up") return fr ? "Suivi" : "Follow-up";
  return fr ? "Général" : "General";
}

function creatorDisplayName(c: PlannerNoteCreator) {
  return (c.name || c.handle || "").trim() || c.handle;
}

function NoteEditor({
  open,
  fr,
  draft,
  creators,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  fr: boolean;
  draft: PlannerMeetingNote | null;
  creators: CreatorOption[];
  onClose: () => void;
  onSave: (note: PlannerMeetingNote) => void;
  onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState<PlannerNoteTime>("today");
  const [status, setStatus] = useState<PlannerNoteStatus>("incoming");
  const [kind, setKind] = useState<PlannerNoteKind>("meeting");
  const [selected, setSelected] = useState<PlannerNoteCreator[]>([]);

  useEffect(() => {
    if (!open || !draft) return;
    setTitle(draft.title);
    setDescription(draft.description);
    setTime(draft.time);
    setStatus(draft.status);
    setKind(draft.kind);
    setSelected(draft.creators);
  }, [open, draft]);

  if (!open || !draft) return null;

  const toggleCreator = (c: CreatorOption) => {
    setSelected((prev) => {
      const exists = prev.some((x) => x.handle === c.handle);
      if (exists) return prev.filter((x) => x.handle !== c.handle);
      return [...prev, c];
    });
  };

  return (
    <div className="pn-modal" role="dialog" aria-modal="true">
      <button type="button" className="pn-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="pn-modal__panel">
        <div className="pn-modal__head">
          <h3>{draft.title.trim() ? (fr ? "Modifier la note" : "Edit note") : fr ? "Nouvelle note" : "New note"}</h3>
          <button type="button" className="pn-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="pn-field">
          <span>{fr ? "Titre" : "Title"}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={fr ? "Ex. Brief post-call avec Lexie" : "e.g. Post-call brief with Lexie"}
          />
        </label>

        <label className="pn-field">
          <span>{fr ? "Notes" : "Notes"}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={
              fr
                ? "Ce qu’il faut retenir du meeting, prochaines étapes…"
                : "What to remember from the meeting, next steps…"
            }
          />
        </label>

        <div className="pn-field-row">
          <label className="pn-field">
            <span>{fr ? "Type" : "Type"}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as PlannerNoteKind)}>
              <option value="meeting">{kindLabel("meeting", fr)}</option>
              <option value="follow_up">{kindLabel("follow_up", fr)}</option>
              <option value="general">{kindLabel("general", fr)}</option>
            </select>
          </label>
          <label className="pn-field">
            <span>{fr ? "Quand" : "Time"}</span>
            <select value={time} onChange={(e) => setTime(e.target.value as PlannerNoteTime)}>
              <option value="today">{timeLabel("today", fr)}</option>
              <option value="tomorrow">{timeLabel("tomorrow", fr)}</option>
              <option value="this_week">{timeLabel("this_week", fr)}</option>
              <option value="later">{timeLabel("later", fr)}</option>
            </select>
          </label>
          <label className="pn-field">
            <span>{fr ? "Statut" : "Status"}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as PlannerNoteStatus)}>
              <option value="incoming">{statusLabel("incoming", fr)}</option>
              <option value="ongoing">{statusLabel("ongoing", fr)}</option>
              <option value="follow_up">{statusLabel("follow_up", fr)}</option>
              <option value="done">{statusLabel("done", fr)}</option>
            </select>
          </label>
        </div>

        <div className="pn-field">
          <span>{fr ? "Créateurs" : "Creators"}</span>
          {creators.length === 0 ? (
            <p className="pn-hint">
              {fr
                ? "Aucun créateur enregistré. Ajoute-en depuis Findit pour les attribuer ici."
                : "No saved creators yet. Add some from Findit to assign them here."}
            </p>
          ) : (
            <div className="pn-creator-pick">
              {creators.map((c) => {
                const on = selected.some((x) => x.handle === c.handle);
                return (
                  <button
                    key={c.handle}
                    type="button"
                    className={`pn-creator-chip${on ? " is-on" : ""}`}
                    onClick={() => toggleCreator(c)}
                  >
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" />
                    ) : (
                      <span className="pn-avatar-fallback">{creatorDisplayName(c).slice(0, 1).toUpperCase()}</span>
                    )}
                    <span>@{c.handle}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pn-modal__actions">
          {onDelete ? (
            <button type="button" className="pn-btn pn-btn--ghost" onClick={() => onDelete(draft.id)}>
              {fr ? "Supprimer" : "Delete"}
            </button>
          ) : (
            <span />
          )}
          <div className="pn-modal__actions-right">
            <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
              {fr ? "Annuler" : "Cancel"}
            </button>
            <button
              type="button"
              className="pn-btn pn-btn--primary"
              onClick={() => {
                if (!title.trim()) return;
                onSave({
                  ...draft,
                  title: title.trim(),
                  description: description.trim(),
                  time,
                  status,
                  kind,
                  creators: selected,
                  updatedAt: Date.now(),
                });
              }}
            >
              {fr ? "Enregistrer" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlannerNotesView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const [notes, setNotes] = useState<PlannerMeetingNote[]>([]);
  const [creatorPool, setCreatorPool] = useState<CreatorOption[]>([]);
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterTime, setFilterTime] = useState<FilterTime>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [draft, setDraft] = useState<PlannerMeetingNote | null>(null);

  useEffect(() => {
    setNotes(loadPlannerMeetingNotes(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const rows = await getSavedCreators(userId);
        setCreatorPool(
          (rows || []).map((r) => {
            const row = r as {
              handle?: string;
              username?: string;
              full_name?: string;
              display_name?: string;
              avatar_url?: string;
            };
            const handle = String(row.handle || row.username || "").replace(/^@/, "");
            return {
              handle,
              name: String(row.full_name || row.display_name || handle),
              avatarUrl: row.avatar_url || undefined,
            };
          }).filter((c) => c.handle),
        );
      } catch {
        setCreatorPool([]);
      }
    })();
  }, [userId]);

  const persist = (next: PlannerMeetingNote[]) => {
    setNotes(next);
    savePlannerMeetingNotes(userId, next);
  };

  const filtered = useMemo(() => {
    return notes
      .filter((n) => (filterKind === "all" ? true : n.kind === filterKind))
      .filter((n) => (filterTime === "all" ? true : n.time === filterTime))
      .filter((n) => (filterStatus === "all" ? true : n.status === filterStatus))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, filterKind, filterTime, filterStatus]);

  const openNew = () => setDraft(createPlannerMeetingNote({ kind: "meeting", status: "incoming", time: "today" }));

  return (
    <div className={`pn-page${isMobile ? " is-mobile" : ""}`}>
      <div className="pn-header">
        <div className="pn-header__title">
          <span className="pn-header__icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6.5A2.5 2.5 0 016.5 4H14l6 6v7.5A2.5 2.5 0 0117.5 20h-11A2.5 2.5 0 014 17.5v-11z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M14 4v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </span>
          <h1>Notes</h1>
        </div>
        <button type="button" className="pn-add" onClick={openNew}>
          <span aria-hidden>+</span>
          {fr ? "Ajouter une note" : "Add Notes"}
        </button>
      </div>

      <div className="pn-filters">
        <label className="pn-filter">
          <span>{fr ? "Type" : "Task"}:</span>
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as FilterKind)}>
            <option value="all">{fr ? "Tous" : "All"}</option>
            <option value="meeting">{kindLabel("meeting", fr)}</option>
            <option value="follow_up">{kindLabel("follow_up", fr)}</option>
            <option value="general">{kindLabel("general", fr)}</option>
          </select>
        </label>
        <label className="pn-filter">
          <span>{fr ? "Temps" : "Time"}:</span>
          <select value={filterTime} onChange={(e) => setFilterTime(e.target.value as FilterTime)}>
            <option value="all">{fr ? "Tous" : "All"}</option>
            <option value="today">{timeLabel("today", fr)}</option>
            <option value="tomorrow">{timeLabel("tomorrow", fr)}</option>
            <option value="this_week">{timeLabel("this_week", fr)}</option>
            <option value="later">{timeLabel("later", fr)}</option>
          </select>
        </label>
        <label className="pn-filter">
          <span>{fr ? "Statut" : "Status"}:</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}>
            <option value="all">{fr ? "Tous" : "All"}</option>
            <option value="incoming">{statusLabel("incoming", fr)}</option>
            <option value="ongoing">{statusLabel("ongoing", fr)}</option>
            <option value="follow_up">{statusLabel("follow_up", fr)}</option>
            <option value="done">{statusLabel("done", fr)}</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="pn-empty">
          <p>
            {fr
              ? "Aucune note pour l’instant. Capture tes points de meeting et lie-les à un créateur pour les retrouver après."
              : "No notes yet. Capture meeting takeaways and link them to a creator for easy follow-up."}
          </p>
          <button type="button" className="pn-add" onClick={openNew}>
            <span aria-hidden>+</span>
            {fr ? "Ajouter une note" : "Add Notes"}
          </button>
        </div>
      ) : (
        <div className="pn-list">
          {filtered.map((note) => {
            const names = note.creators.map(creatorDisplayName).filter(Boolean);
            return (
              <button key={note.id} type="button" className="pn-card" onClick={() => setDraft(note)}>
                <div className="pn-card__top">
                  <div className="pn-card__title-row">
                    <h2>{note.title || (fr ? "Sans titre" : "Untitled")}</h2>
                    <span className={`pn-badge pn-badge--time pn-badge--${note.time}`}>{timeLabel(note.time, fr)}</span>
                    <span className={`pn-badge pn-badge--status pn-badge--${note.status}`}>{statusLabel(note.status, fr)}</span>
                  </div>
                  <span className="pn-card__chev" aria-hidden>
                    ›
                  </span>
                </div>
                {note.description ? <p className="pn-card__desc">{note.description}</p> : null}
                <div className="pn-card__footer">
                  <div className="pn-card__avatars">
                    {note.creators.slice(0, 4).map((c) =>
                      c.avatarUrl ? (
                        <img key={c.handle} src={c.avatarUrl} alt="" />
                      ) : (
                        <span key={c.handle} className="pn-avatar-fallback">
                          {creatorDisplayName(c).slice(0, 1).toUpperCase()}
                        </span>
                      ),
                    )}
                  </div>
                  <p className="pn-card__people">
                    {names.length > 0 ? (
                      <>
                        {fr ? "Avec " : "Collaborate with "}
                        <strong>{names.slice(0, 3).join(", ")}</strong>
                        {names.length > 3 ? ` +${names.length - 3}` : ""}
                      </>
                    ) : (
                      <span className="pn-card__people-muted">
                        {fr ? "Aucun créateur attribué" : "No creator assigned"}
                      </span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <NoteEditor
        open={!!draft}
        fr={fr}
        draft={draft}
        creators={creatorPool}
        onClose={() => setDraft(null)}
        onSave={(note) => {
          const exists = notes.some((n) => n.id === note.id);
          persist(exists ? notes.map((n) => (n.id === note.id ? note : n)) : [note, ...notes]);
          setDraft(null);
        }}
        onDelete={
          draft && notes.some((n) => n.id === draft.id)
            ? (id) => {
                persist(notes.filter((n) => n.id !== id));
                setDraft(null);
              }
            : undefined
        }
      />
    </div>
  );
}
