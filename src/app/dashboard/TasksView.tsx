"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { TASKS_UPDATED_EVENT } from "@/lib/assistant-actions";
import { workspaceStorageKey } from "@/lib/workspaces";

type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  due?: string;
  color: number;
};

type Mode = "ai" | "manual";

const TASK_COLORS = ["#0047ff", "#f97316", "#10b981", "#a855f7", "#ef4444", "#06b6d4", "#e11d48", "#84cc16"];

function storageKey(userId?: string) {
  return workspaceStorageKey(`trackit.home.tasks.${userId || "anon"}`);
}

function colorForId(id: string, n = TASK_COLORS.length) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % n;
}

function normalizeTask(raw: Partial<Task> & { id: string; title: string }): Task {
  return {
    id: raw.id,
    title: raw.title,
    done: Boolean(raw.done),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    due: raw.due || "",
    color: typeof raw.color === "number" ? raw.color % TASK_COLORS.length : colorForId(raw.id),
  };
}

export function TasksView({
  userId,
  isMobile,
  displayName,
}: {
  userId?: string;
  isMobile?: boolean;
  displayName?: string | null;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<Mode>("ai");
  const [prompt, setPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const firstName =
    (displayName || "").trim().split(/\s+/)[0] ||
    (fr ? "toi" : "there");

  const suggestions = useMemo(
    () =>
      fr
        ? [
            "Envoyer un follow-up à 18:00",
            "Contacter @lena demain matin",
            "Préparer le brief campagne payouts",
          ]
        : [
            "Send a follow-up at 6pm",
            "Contact @lena tomorrow morning",
            "Prep the payouts campaign brief",
          ],
    [fr],
  );

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(storageKey(userId));
        if (!raw) return;
        const parsed = JSON.parse(raw) as Array<Partial<Task> & { id: string; title: string }>;
        setTasks(parsed.map(normalizeTask));
      } catch {
        /* ignore */
      }
    };
    load();
    // Refresh when the assistant (Mino) adds a task while this view is kept alive.
    window.addEventListener(TASKS_UPDATED_EVENT, load);
    return () => window.removeEventListener(TASKS_UPDATED_EVENT, load);
  }, [userId]);

  const persist = (next: Task[]) => {
    setTasks(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const nextColor = () => {
    const used = tasks.map((t) => t.color);
    for (let i = 0; i < TASK_COLORS.length; i++) {
      if (!used.includes(i)) return i;
    }
    return tasks.length % TASK_COLORS.length;
  };

  const addTask = (title: string, due = "") => {
    const t = title.trim();
    if (!t) return;
    const id = `${Date.now()}`;
    persist([
      {
        id,
        title: t,
        done: false,
        createdAt: Date.now(),
        due,
        color: nextColor(),
      },
      ...tasks,
    ]);
  };

  const parsePrompt = async () => {
    const text = prompt.trim();
    if (!text || parsing) return;
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/parse-task", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        task?: { title: string; due: string };
      };
      if (!res.ok || !data.ok || !data.task) {
        setError(data.error || (fr ? "Impossible de comprendre la tâche" : "Couldn’t parse the task"));
        return;
      }
      addTask(data.task.title, data.task.due || "");
      setPrompt("");
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setParsing(false);
    }
  };

  const addManual = () => {
    const t = manualTitle.trim();
    if (!t) return;
    addTask(t);
    setManualTitle("");
    setAddingManual(false);
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const formatDue = (due?: string) => {
    if (!due) return "";
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(fr ? "fr-FR" : "en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderTaskRow = (task: Task, opts?: { done?: boolean }) => {
    const color = TASK_COLORS[task.color % TASK_COLORS.length];
    return (
      <li key={task.id} className={`tsk-row${opts?.done ? " is-done" : ""}`} style={{ ["--tsk-color" as string]: color }}>
        <button
          type="button"
          className="tsk-check"
          aria-label={opts?.done ? "Undo" : "Done"}
          onClick={() =>
            persist(tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
          }
        />
        <div className="tsk-row__body">
          <span className="tsk-row__title">{task.title}</span>
          {task.due ? <span className="tsk-row__due">{formatDue(task.due)}</span> : null}
        </div>
        <button
          type="button"
          className="tsk-row__del"
          onClick={() => persist(tasks.filter((t) => t.id !== task.id))}
          aria-label="Delete"
        >
          ×
        </button>
      </li>
    );
  };

  return (
    <div className={`tsk-page${isMobile ? " is-mobile" : ""}`}>
      <div className="tsk-topbar">
        <div className="mtg-mode">
          <button type="button" className={mode === "ai" ? "is-active" : ""} onClick={() => setMode("ai")}>
            {fr ? "Prompt IA" : "AI prompt"}
          </button>
          <button type="button" className={mode === "manual" ? "is-active" : ""} onClick={() => setMode("manual")}>
            {fr ? "Manuel" : "Manual"}
          </button>
        </div>
      </div>

      {mode === "ai" ? (
        <div className="tsk-hero">
          <h1 className="tsk-hero__greet">
            {fr
              ? `${firstName} ! Prêt à vider ta to-do ?`
              : `${firstName}! Ready to clear your to-do?`}
          </h1>

          <div className="mtg-promptbox">
            <div className="mtg-promptbox__led" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </div>
            <div className="mtg-promptbox__glow" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </div>
            <div className="mtg-promptbox__inner">
              <div className="mtg-promptbox__row">
                <svg className="mtg-promptbox__search" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M16.2 16.2 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    fr
                      ? `Hey ${firstName}… décris ta tâche`
                      : `Hey ${firstName}… describe your task`
                  }
                  rows={isMobile ? 3 : 2}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void parsePrompt();
                    }
                  }}
                />
              </div>
              <div className="mtg-promptbox__bar">
                <span className="mtg-promptbox__meta">
                  {fr ? "Propulsé par" : "Powered by"}
                  <img src="/claude-logo.svg" alt="Claude" className="mtg-promptbox__claude" width={16} height={16} />
                </span>
                <button
                  type="button"
                  className="mtg-promptbox__send"
                  disabled={!prompt.trim() || parsing}
                  onClick={() => void parsePrompt()}
                  aria-label={fr ? "Ajouter la tâche" : "Add task"}
                >
                  {parsing ? (
                    "…"
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                      <path
                        d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error ? <p className="tsk-error">{error}</p> : null}

          <div className="mtg-chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="mtg-chip"
                onClick={() => {
                  setPrompt(s);
                  textareaRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="tsk-list-block">
            <div className="tsk-list-block__label">{fr ? "À faire" : "To do"}</div>
            {open.length === 0 && done.length === 0 ? (
              <p className="tsk-empty">
                {fr
                  ? "Il semblerait que votre to-do soit encore vide — ajoutez une première tâche pour lancer la machine."
                  : "Looks like your to-do is still empty — add a first task to get things moving."}
              </p>
            ) : (
              <ul className="tsk-list">{open.map((t) => renderTaskRow(t))}</ul>
            )}
            {done.length > 0 ? (
              <div className="tsk-done">
                <div className="tsk-list-block__label">{fr ? "Terminées" : "Done"}</div>
                <ul className="tsk-list">{done.map((t) => renderTaskRow(t, { done: true }))}</ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="tsk-manual">
          <h1 className="tsk-manual__title">{fr ? "Tasks" : "Tasks"}</h1>

          {open.length === 0 && done.length === 0 && !addingManual ? (
            <p className="tsk-empty tsk-empty--manual">
              {fr
                ? "Il semblerait que votre to-do soit encore vide — créez une nouvelle tâche pour démarrer."
                : "Looks like your to-do is still empty — create a new task to get started."}
            </p>
          ) : (
            <ul className="tsk-manual__list">
              {open.map((t) => renderTaskRow(t))}
              {done.map((t) => renderTaskRow(t, { done: true }))}
            </ul>
          )}

          {addingManual ? (
            <div className="tsk-manual__compose">
              <span className="tsk-manual__compose-check" aria-hidden />
              <input
                ref={manualInputRef}
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder={fr ? "Nom de la tâche…" : "Task name…"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManual();
                  if (e.key === "Escape") {
                    setAddingManual(false);
                    setManualTitle("");
                  }
                }}
                autoFocus
              />
              <button type="button" className="tsk-manual__save" disabled={!manualTitle.trim()} onClick={addManual}>
                {fr ? "Ajouter" : "Add"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tsk-manual__add"
              onClick={() => {
                setAddingManual(true);
                queueMicrotask(() => manualInputRef.current?.focus());
              }}
            >
              <span className="tsk-manual__add-plus" aria-hidden>
                +
              </span>
              {fr ? "Créer une nouvelle task" : "Add task"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
