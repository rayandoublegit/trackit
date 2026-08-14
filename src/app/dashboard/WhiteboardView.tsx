"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { useDashboardTheme } from "./DashboardThemeProvider";
import {
  emptyWbDoc,
  getActiveWbBoardId,
  loadWbBoards,
  loadWbDoc,
  newWbItemId,
  nextStickyColor,
  saveWbDoc,
  setActiveWbBoardId,
  touchWbBoard,
  updateWbBoardMeta,
  WB_ACTIVE_EVENT,
  WB_BOARD_COLORS,
  WB_BOARDS_EVENT,
  WB_DEFAULT_TEXT_FONT,
  WB_TEXT_FONTS,
  type WbCamera,
  type WbConnector,
  type WbDoc,
  type WbDrawTool,
  type WbItem,
  type WbShape,
  type WbSticky,
  type WbStroke,
  type WbTextBox,
} from "@/lib/whiteboard-storage";

type Tool = "select" | "hand" | "draw" | "shape" | "connector" | "sticky" | "text";
type DrawStyle = WbDrawTool;

const DRAW_COLORS = ["#111111", "#ffffff", "#0047ff", "#e11d48", "#16a34a", "#f59e0b", "#a855f7", "#38bdf8"];

function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: WbCamera,
) {
  return {
    x: (clientX - rect.left - camera.x) / camera.zoom,
    y: (clientY - rect.top - camera.y) / camera.zoom,
  };
}

function hitTest(item: WbItem, x: number, y: number): boolean {
  if (item.type === "sticky" || item.type === "shape") {
    return x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
  }
  if (item.type === "text") {
    const h = Math.max(28, item.fontSize * 1.4 * Math.max(1, item.text.split("\n").length));
    return x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + h;
  }
  return false;
}

function cloneDoc(doc: WbDoc): WbDoc {
  return JSON.parse(JSON.stringify(doc)) as WbDoc;
}

export function WhiteboardView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const { theme } = useDashboardTheme();
  const stageRef = useRef<HTMLDivElement>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("Whiteboard");
  const [boardColor, setBoardColor] = useState<string>(WB_BOARD_COLORS[0]);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const nameWrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<WbDoc>({ items: [], camera: { x: 0, y: 0, zoom: 1 } });
  const [tool, setTool] = useState<Tool>("select");
  const [drawStyle, setDrawStyle] = useState<DrawStyle>("pen");
  const [drawColor, setDrawColor] = useState("#111111");
  const [penSize, setPenSize] = useState(3.5);
  const [pencilSize, setPencilSize] = useState(2);
  const [markerSize, setMarkerSize] = useState(16);
  const [textSize, setTextSize] = useState(18);
  const [textFont, setTextFont] = useState(WB_DEFAULT_TEXT_FONT);
  const [drawPanelOpen, setDrawPanelOpen] = useState(false);
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [topRightHidden, setTopRightHidden] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<WbDoc[]>([]);
  const [future, setFuture] = useState<WbDoc[]>([]);
  const drawingRef = useRef<WbStroke | null>(null);
  const shapeDragRef = useRef<{ id: string; x0: number; y0: number } | null>(null);
  const panRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number; ix: number; iy: number } | null>(null);
  const spacePan = useRef(false);
  const stickyCount = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  const boardIdRef = useRef(boardId);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    boardIdRef.current = boardId;
  }, [boardId]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (renaming || editingId || colorOpen || resetConfirmOpen) return;
      setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, renaming, editingId, colorOpen, resetConfirmOpen]);

  const resetBoard = useCallback(() => {
    const next = emptyWbDoc();
    setHistory((h) => [...h.slice(-40), cloneDoc(docRef.current)]);
    setFuture([]);
    docRef.current = next;
    setDoc(next);
    setSelectedId(null);
    setEditingId(null);
    stickyCount.current = 0;
    const id = boardIdRef.current;
    if (id) {
      saveWbDoc(id, userId, next);
      touchWbBoard(userId, id);
    }
    setResetConfirmOpen(false);
  }, [userId]);

  const loadActive = useCallback(() => {
    const boards = loadWbBoards(userId);
    if (boards.length === 0) return;
    let id = getActiveWbBoardId(userId) || boards[0].id;
    if (!boards.some((b) => b.id === id)) id = boards[0].id;
    setActiveWbBoardId(userId, id);
    setBoardId(id);
    const meta = boards.find((b) => b.id === id);
    setBoardName(meta?.name || "Whiteboard");
    setBoardColor(meta?.color || WB_BOARD_COLORS[0]);
    setRenaming(false);
    setColorOpen(false);
    const next = loadWbDoc(id, userId);
    docRef.current = next;
    setDoc(next);
    setSelectedId(null);
    setEditingId(null);
    setHistory([]);
    setFuture([]);
    setDrawPanelOpen(false);
    setTextPanelOpen(false);
  }, [userId]);

  useEffect(() => {
    loadActive();
    const onBoards = () => {
      const boards = loadWbBoards(userId);
      const id = getActiveWbBoardId(userId);
      if (id) {
        const meta = boards.find((b) => b.id === id);
        if (meta) {
          setBoardName(meta.name);
          setBoardColor(meta.color || WB_BOARD_COLORS[0]);
        }
      }
    };
    const onActive = () => loadActive();
    window.addEventListener(WB_BOARDS_EVENT, onBoards);
    window.addEventListener(WB_ACTIVE_EVENT, onActive);
    return () => {
      window.removeEventListener(WB_BOARDS_EVENT, onBoards);
      window.removeEventListener(WB_ACTIVE_EVENT, onActive);
    };
  }, [loadActive, userId]);

  const persist = useCallback(
    (next: WbDoc, opts?: { recordHistory?: boolean }) => {
      if (opts?.recordHistory) {
        setHistory((h) => [...h.slice(-40), cloneDoc(docRef.current)]);
        setFuture([]);
      }
      docRef.current = next;
      setDoc(next);
      const id = boardIdRef.current;
      if (!id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveWbDoc(id, userId, next);
        touchWbBoard(userId, id);
      }, 180);
    },
    [userId],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [cloneDoc(docRef.current), ...f].slice(0, 40));
      docRef.current = prev;
      setDoc(prev);
      const id = boardIdRef.current;
      if (id) saveWbDoc(id, userId, prev);
      return h.slice(0, -1);
    });
  }, [userId]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, cloneDoc(docRef.current)].slice(-40));
      docRef.current = next;
      setDoc(next);
      const id = boardIdRef.current;
      if (id) saveWbDoc(id, userId, next);
      return f.slice(1);
    });
  }, [userId]);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        spacePan.current = true;
      }
      if (isTyping(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "v") {
        setTool("select");
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
      if (k === "h") {
        setTool("hand");
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
      if (k === "d") {
        setTool("draw");
        setDrawPanelOpen(true);
        setTextPanelOpen(false);
      }
      if (k === "r") {
        setTool("shape");
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
      if (k === "a") {
        setTool("connector");
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
      if (k === "n") {
        setTool("sticky");
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
      if (k === "t") {
        setTool("text");
        setTextPanelOpen(true);
        setDrawPanelOpen(false);
      }
      if (k === "f") {
        e.preventDefault();
        setFullscreen((v) => !v);
      }
      if (k === "backspace" || k === "delete") {
        if (selectedId) {
          e.preventDefault();
          persist(
            {
              ...docRef.current,
              items: docRef.current.items.filter((it) => it.id !== selectedId),
            },
            { recordHistory: true },
          );
          setSelectedId(null);
          setEditingId(null);
        }
      }
      if (k === "escape") {
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePan.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [persist, redo, selectedId, undo]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setDrawPanelOpen(false);
        setTextPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const camera = doc.camera;

  const setCamera = (cam: WbCamera) => persist({ ...docRef.current, camera: cam });

  const updateItem = (id: string, patch: Partial<WbItem>, recordHistory = false) => {
    const cur = docRef.current;
    persist(
      {
        ...cur,
        items: cur.items.map((it) => (it.id === id ? ({ ...it, ...patch } as WbItem) : it)),
      },
      { recordHistory },
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    persist(
      { ...docRef.current, items: docRef.current.items.filter((it) => it.id !== selectedId) },
      { recordHistory: true },
    );
    setSelectedId(null);
    setEditingId(null);
  };

  const currentDrawSize =
    drawStyle === "marker" ? markerSize : drawStyle === "pencil" ? pencilSize : penSize;

  const setCurrentDrawSize = (n: number) => {
    if (drawStyle === "marker") setMarkerSize(n);
    else if (drawStyle === "pencil") setPencilSize(n);
    else setPenSize(n);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!stageRef.current) return;
    if (editingId && (e.target as HTMLElement).closest?.("[data-wb-edit]")) return;

    const rect = stageRef.current.getBoundingClientRect();
    const world = screenToWorld(e.clientX, e.clientY, rect, camera);
    const activeTool = spacePan.current || e.button === 1 ? "hand" : tool;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (activeTool === "hand") {
      panRef.current = { px: e.clientX, py: e.clientY, cx: camera.x, cy: camera.y };
      setEditingId(null);
      return;
    }

    if (activeTool === "select") {
      const hit = [...docRef.current.items]
        .reverse()
        .find((it) => (it.type === "sticky" || it.type === "text" || it.type === "shape") && hitTest(it, world.x, world.y));
      if (hit && (hit.type === "sticky" || hit.type === "text" || hit.type === "shape")) {
        setSelectedId(hit.id);
        if (hit.type === "text") {
          setTextSize(hit.fontSize);
          setTextFont(hit.fontFamily || WB_DEFAULT_TEXT_FONT);
          setDrawColor(hit.color);
        }
        dragRef.current = { id: hit.id, ox: world.x, oy: world.y, ix: hit.x, iy: hit.y };
      } else {
        setSelectedId(null);
        setEditingId(null);
        panRef.current = { px: e.clientX, py: e.clientY, cx: camera.x, cy: camera.y };
      }
      return;
    }

    if (activeTool === "sticky") {
      const sticky: WbSticky = {
        id: newWbItemId("stk"),
        type: "sticky",
        x: world.x - 80,
        y: world.y - 80,
        w: 180,
        h: 180,
        color: nextStickyColor(stickyCount.current++),
        text: "",
      };
      persist({ ...docRef.current, items: [...docRef.current.items, sticky] }, { recordHistory: true });
      setSelectedId(sticky.id);
      setEditingId(sticky.id);
      setTool("select");
      return;
    }

    if (activeTool === "text") {
      const box: WbTextBox = {
        id: newWbItemId("txt"),
        type: "text",
        x: world.x,
        y: world.y,
        w: 260,
        text: "",
        fontSize: textSize,
        fontFamily: textFont,
        color: drawColor === "#ffffff" && theme !== "dark" ? "#1a1a1a" : drawColor,
      };
      persist({ ...docRef.current, items: [...docRef.current.items, box] }, { recordHistory: true });
      setSelectedId(box.id);
      setEditingId(box.id);
      setTool("select");
      setTextPanelOpen(false);
      return;
    }

    if (activeTool === "shape") {
      const shape: WbShape = {
        id: newWbItemId("shp"),
        type: "shape",
        x: world.x,
        y: world.y,
        w: 4,
        h: 4,
        color: drawColor,
      };
      shapeDragRef.current = { id: shape.id, x0: world.x, y0: world.y };
      persist({ ...docRef.current, items: [...docRef.current.items, shape] }, { recordHistory: true });
      setSelectedId(shape.id);
      return;
    }

    if (activeTool === "connector") {
      const conn: WbConnector = {
        id: newWbItemId("con"),
        type: "connector",
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
        color: drawColor,
        width: Math.max(2, penSize),
      };
      shapeDragRef.current = { id: conn.id, x0: world.x, y0: world.y };
      persist({ ...docRef.current, items: [...docRef.current.items, conn] }, { recordHistory: true });
      setSelectedId(conn.id);
      return;
    }

    if (activeTool === "draw") {
      const stroke: WbStroke = {
        id: newWbItemId("str"),
        type: "stroke",
        tool: drawStyle,
        color: drawColor,
        width: currentDrawSize,
        points: [world],
      };
      drawingRef.current = stroke;
      persist({ ...docRef.current, items: [...docRef.current.items, stroke] }, { recordHistory: true });
      setSelectedId(null);
      setEditingId(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();

    if (panRef.current) {
      const dx = e.clientX - panRef.current.px;
      const dy = e.clientY - panRef.current.py;
      setCamera({ ...camera, x: panRef.current.cx + dx, y: panRef.current.cy + dy });
      return;
    }

    if (dragRef.current) {
      const world = screenToWorld(e.clientX, e.clientY, rect, camera);
      const { id, ox, oy, ix, iy } = dragRef.current;
      updateItem(id, { x: ix + (world.x - ox), y: iy + (world.y - oy) });
      return;
    }

    if (shapeDragRef.current) {
      const world = screenToWorld(e.clientX, e.clientY, rect, camera);
      const { id, x0, y0 } = shapeDragRef.current;
      const cur = docRef.current.items.find((it) => it.id === id);
      if (cur?.type === "shape") {
        updateItem(id, {
          x: Math.min(x0, world.x),
          y: Math.min(y0, world.y),
          w: Math.max(4, Math.abs(world.x - x0)),
          h: Math.max(4, Math.abs(world.y - y0)),
        });
      } else if (cur?.type === "connector") {
        updateItem(id, { x2: world.x, y2: world.y });
      }
      return;
    }

    if (drawingRef.current) {
      const world = screenToWorld(e.clientX, e.clientY, rect, camera);
      const stroke = drawingRef.current;
      const nextPoints = [...stroke.points, world];
      const nextStroke = { ...stroke, points: nextPoints };
      drawingRef.current = nextStroke;
      const cur = docRef.current;
      persist({
        ...cur,
        items: cur.items.map((it) => (it.id === stroke.id ? nextStroke : it)),
      });
    }
  };

  const onPointerUp = () => {
    panRef.current = null;
    dragRef.current = null;
    drawingRef.current = null;
    shapeDragRef.current = null;
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cam = docRef.current.camera;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const nextZoom = Math.min(2.5, Math.max(0.25, cam.zoom * factor));
      const wx = (mx - cam.x) / cam.zoom;
      const wy = (my - cam.y) / cam.zoom;
      persist({
        ...docRef.current,
        camera: {
          zoom: nextZoom,
          x: mx - wx * nextZoom,
          y: my - wy * nextZoom,
        },
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [persist]);

  const zoomPct = Math.round(camera.zoom * 100);

  const tools = useMemo(
    () =>
      [
        { id: "select" as const, label: fr ? "Sélection" : "Select", shortcut: "V" },
        { id: "hand" as const, label: fr ? "Main" : "Hand", shortcut: "H" },
        { id: "draw" as const, label: fr ? "Dessin" : "Draw", shortcut: "D" },
        { id: "shape" as const, label: fr ? "Forme" : "Shape", shortcut: "R" },
        { id: "connector" as const, label: fr ? "Flèche" : "Arrow", shortcut: "A" },
        { id: "sticky" as const, label: "Sticky", shortcut: "N" },
        { id: "text" as const, label: "Text", shortcut: "T" },
      ] as const,
    [fr],
  );

  const pickTool = (id: Tool) => {
    if (id === "draw") {
      setTool("draw");
      setDrawPanelOpen((o) => (tool === "draw" ? !o : true));
      setTextPanelOpen(false);
      return;
    }
    if (id === "text") {
      setTool("text");
      setTextPanelOpen((o) => (tool === "text" ? !o : true));
      setDrawPanelOpen(false);
      return;
    }
    setTool(id);
    setDrawPanelOpen(false);
    setTextPanelOpen(false);
  };

  const stageToolClass = tool === "draw" ? `draw-${drawStyle}` : tool;

  const startRename = () => {
    setDraftName(boardName);
    setRenaming(true);
    setColorOpen(false);
  };

  const commitRename = useCallback(() => {
    if (!boardId) {
      setRenaming(false);
      return;
    }
    const next = draftName.trim() || boardName;
    updateWbBoardMeta(userId, boardId, { name: next });
    setBoardName(next);
    setRenaming(false);
  }, [boardId, boardName, draftName, userId]);

  const pickBoardColor = (color: string) => {
    if (!boardId) return;
    setBoardColor(color);
    updateWbBoardMeta(userId, boardId, { color });
    setColorOpen(false);
  };

  useEffect(() => {
    if (!renaming && !colorOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!nameWrapRef.current?.contains(e.target as Node)) {
        if (renaming) commitRename();
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [renaming, colorOpen, commitRename]);

  return (
    <div
      className={`wb-app${isMobile ? " is-mobile" : ""}${theme === "dark" ? " is-dark" : ""}${fullscreen ? " is-fullscreen" : ""}`}
    >
      <div className="wb-top">
        <div className="wb-top__name-wrap" ref={nameWrapRef}>
          <div className={`wb-top__name${renaming ? " is-editing" : ""}`}>
            <button
              type="button"
              className="wb-top__dot"
              style={{ background: boardColor }}
              title={fr ? "Couleur" : "Color"}
              onClick={() => setColorOpen((v) => !v)}
            />
            {renaming ? (
              <>
                <input
                  value={draftName}
                  autoFocus
                  maxLength={60}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setRenaming(false);
                      setDraftName(boardName);
                    }
                  }}
                  placeholder={fr ? "Nom du whiteboard" : "Whiteboard name"}
                />
                <button
                  type="button"
                  className="wb-top__confirm"
                  title={fr ? "Valider" : "Save"}
                  onClick={commitRename}
                >
                  →
                </button>
              </>
            ) : (
              <button
                type="button"
                className="wb-top__name-label"
                onClick={startRename}
                title={fr ? "Renommer" : "Rename"}
              >
                {boardName}
              </button>
            )}
          </div>
          {colorOpen ? (
            <div className="wb-top__colors" role="listbox" aria-label={fr ? "Couleur" : "Color"}>
              {WB_BOARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={boardColor === c ? "is-active" : ""}
                  style={{ background: c }}
                  onClick={() => pickBoardColor(c)}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className={`wb-top__right${topRightHidden ? " is-hidden" : ""}`}>
          {!topRightHidden ? (
            <>
              {!isMobile ? (
                <div className="wb-top__hint">
                  {fr
                    ? "Glisse pour naviguer · molette pour zoomer · espace = main"
                    : "Drag to pan · scroll to zoom · space = hand"}
                </div>
              ) : null}
              <button
                type="button"
                className="wb-top__fs"
                onClick={() => setResetConfirmOpen(true)}
                title={fr ? "Réinitialiser le whiteboard" : "Reset whiteboard"}
                aria-label={fr ? "Réinitialiser le whiteboard" : "Reset whiteboard"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="wb-top__fs"
                onClick={() => setFullscreen((v) => !v)}
                title={
                  fullscreen
                    ? fr
                      ? "Quitter le plein écran (F)"
                      : "Exit fullscreen (F)"
                    : fr
                      ? "Plein écran (F)"
                      : "Fullscreen (F)"
                }
                aria-label={
                  fullscreen
                    ? fr
                      ? "Quitter le plein écran (F)"
                      : "Exit fullscreen (F)"
                    : fr
                      ? "Plein écran (F)"
                      : "Fullscreen (F)"
                }
                aria-pressed={fullscreen}
              >
                {fullscreen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="wb-top__fs"
            onClick={() => setTopRightHidden((v) => !v)}
            title={topRightHidden ? (fr ? "Afficher" : "Show") : fr ? "Masquer" : "Hide"}
            aria-label={topRightHidden ? (fr ? "Afficher les contrôles" : "Show controls") : fr ? "Masquer" : "Hide"}
            aria-pressed={topRightHidden}
          >
            {topRightHidden ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 3l18 18M10.6 10.7a2.5 2.5 0 0 0 3.5 3.5M9.4 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-4.2 4.8M6.1 6.1A17.7 17.7 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {resetConfirmOpen ? (
        <div
          className="wb-reset-overlay"
          onClick={() => setResetConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="wb-reset-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wb-reset-title"
          >
            <h3 id="wb-reset-title">
              {fr ? "Réinitialiser le whiteboard ?" : "Reset whiteboard?"}
            </h3>
            <p>
              {fr
                ? "Tous les éléments (dessins, notes, formes, texte) seront effacés. Cette action peut être annulée avec Undo."
                : "All items (drawings, notes, shapes, text) will be cleared. You can undo this with Undo."}
            </p>
            <button type="button" className="wb-reset-modal__primary" onClick={resetBoard}>
              {fr ? "Oui, réinitialiser" : "Yes, reset"}
            </button>
            <button type="button" className="wb-reset-modal__secondary" onClick={() => setResetConfirmOpen(false)}>
              {fr ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={`wb-stage tool-${stageToolClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="wb-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <svg className="wb-strokes" aria-hidden>
            {doc.items
              .filter((it): it is WbStroke => it.type === "stroke")
              .map((stroke) => {
                if (stroke.points.length < 2) return null;
                const d = stroke.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
                const opacity = stroke.tool === "marker" ? 0.45 : stroke.tool === "pencil" ? 0.75 : 1;
                return (
                  <path
                    key={stroke.id}
                    d={d}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={opacity}
                  />
                );
              })}
            {doc.items
              .filter((it): it is WbConnector => it.type === "connector")
              .map((c) => (
                <g key={c.id}>
                  <defs>
                    <marker
                      id={`arrow-${c.id}`}
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill={c.color} />
                    </marker>
                  </defs>
                  <line
                    x1={c.x1}
                    y1={c.y1}
                    x2={c.x2}
                    y2={c.y2}
                    stroke={c.color}
                    strokeWidth={c.width}
                    strokeLinecap="round"
                    markerEnd={`url(#arrow-${c.id})`}
                  />
                </g>
              ))}
            {doc.items
              .filter((it): it is WbShape => it.type === "shape")
              .map((s) => (
                <rect
                  key={s.id}
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  rx={10}
                  ry={10}
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth={2.5}
                  className={selectedId === s.id ? "wb-shape-selected" : undefined}
                />
              ))}
          </svg>

          {doc.items
            .filter((it): it is WbSticky | WbTextBox => it.type === "sticky" || it.type === "text")
            .map((item) => {
              const selected = selectedId === item.id;
              if (item.type === "sticky") {
                return (
                  <div
                    key={item.id}
                    className={`wb-sticky${selected ? " is-selected" : ""}`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.w,
                      height: item.h,
                      background: item.color,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(item.id);
                      setSelectedId(item.id);
                    }}
                  >
                    {editingId === item.id ? (
                      <textarea
                        data-wb-edit
                        autoFocus
                        value={item.text}
                        onChange={(e) => updateItem(item.id, { text: e.target.value })}
                        onBlur={() => setEditingId(null)}
                        onPointerDown={(e) => e.stopPropagation()}
                        placeholder={fr ? "Note…" : "Note…"}
                      />
                    ) : (
                      <p>{item.text || (fr ? "Double-clique pour écrire" : "Double-click to write")}</p>
                    )}
                  </div>
                );
              }
              const fontFamily = item.fontFamily || WB_DEFAULT_TEXT_FONT;
              return (
                <div
                  key={item.id}
                  className={`wb-textbox${selected ? " is-selected" : ""}`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.w,
                    color: item.color,
                    fontSize: item.fontSize,
                    fontFamily,
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(item.id);
                    setSelectedId(item.id);
                    setTextSize(item.fontSize);
                    setTextFont(fontFamily);
                    setTextPanelOpen(true);
                    setTool("text");
                  }}
                >
                  {editingId === item.id ? (
                    <textarea
                      data-wb-edit
                      autoFocus
                      value={item.text}
                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                      onBlur={() => setEditingId(null)}
                      onPointerDown={(e) => e.stopPropagation()}
                      placeholder={fr ? "Texte…" : "Text…"}
                      style={{ fontFamily, fontSize: item.fontSize, color: item.color }}
                    />
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap", fontFamily }}>
                      {item.text || (fr ? "Double-clique pour écrire" : "Double-click to write")}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div className={`wb-toolbar-wrap${toolbarCollapsed ? " is-collapsed" : ""}`} ref={toolbarRef}>
        <button
          type="button"
          className="wb-toolbar-toggle"
          onClick={() => {
            setToolbarCollapsed((v) => !v);
            if (!toolbarCollapsed) {
              setDrawPanelOpen(false);
              setTextPanelOpen(false);
            }
          }}
          title={toolbarCollapsed ? (fr ? "Afficher la barre d’outils" : "Show toolbar") : fr ? "Abaisser la barre d’outils" : "Hide toolbar"}
          aria-label={toolbarCollapsed ? (fr ? "Afficher la barre d’outils" : "Show toolbar") : fr ? "Abaisser la barre d’outils" : "Hide toolbar"}
          aria-expanded={!toolbarCollapsed}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d={toolbarCollapsed ? "M6 10l6 6 6-6" : "M6 14l6-6 6 6"}
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {!toolbarCollapsed && drawPanelOpen && tool === "draw" ? (
          <div className="wb-flyout" role="dialog" aria-label={fr ? "Options dessin" : "Draw options"}>
            <div className="wb-flyout__title">{fr ? "Outil" : "Tool"}</div>
            <div className="wb-flyout__styles">
              {(
                [
                  { id: "pen" as const, label: fr ? "Bic" : "Pen" },
                  { id: "pencil" as const, label: fr ? "Crayon" : "Pencil" },
                  { id: "marker" as const, label: fr ? "Feutre" : "Marker" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`wb-flyout__style${drawStyle === s.id ? " is-active" : ""}`}
                  onClick={() => setDrawStyle(s.id)}
                >
                  <ToolIcon name={s.id} size={22} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
            <label className="wb-flyout__slider">
              <span>
                {fr ? "Épaisseur" : "Thickness"}
                <strong>{Math.round(currentDrawSize)}</strong>
              </span>
              <input
                type="range"
                min={drawStyle === "marker" ? 8 : 1}
                max={drawStyle === "marker" ? 40 : 20}
                step={0.5}
                value={currentDrawSize}
                onChange={(e) => setCurrentDrawSize(Number(e.target.value))}
              />
              <div className="wb-flyout__preview">
                <span
                  style={{
                    width: Math.max(4, currentDrawSize * 1.2),
                    height: Math.max(4, currentDrawSize * 1.2),
                    background: drawColor,
                    opacity: drawStyle === "marker" ? 0.45 : drawStyle === "pencil" ? 0.75 : 1,
                  }}
                />
              </div>
            </label>
            <div className="wb-flyout__title">{fr ? "Couleur" : "Color"}</div>
            <div className="wb-flyout__colors">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`wb-swatch${drawColor === c ? " is-active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setDrawColor(c)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!toolbarCollapsed && textPanelOpen && tool === "text" ? (
          <div className="wb-flyout wb-flyout--text" role="dialog" aria-label={fr ? "Options texte" : "Text options"}>
            <div className="wb-flyout__title">{fr ? "Police" : "Font"}</div>
            <div className="wb-flyout__fonts" role="listbox" aria-label={fr ? "Police d’écriture" : "Typeface"}>
              {WB_TEXT_FONTS.map((f) => {
                const active = textFont === f.family;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`wb-flyout__font${active ? " is-active" : ""}`}
                    style={{ fontFamily: f.family }}
                    title={f.label}
                    onClick={() => {
                      setTextFont(f.family);
                      if (selectedId) {
                        const sel = docRef.current.items.find((it) => it.id === selectedId);
                        if (sel?.type === "text") updateItem(selectedId, { fontFamily: f.family });
                      }
                    }}
                  >
                    <span className="wb-flyout__font-name">{f.label}</span>
                    <span className="wb-flyout__font-preview">Aa</span>
                  </button>
                );
              })}
            </div>
            <label className="wb-flyout__slider">
              <span>
                {fr ? "Taille du texte" : "Text size"}
                <strong>{textSize}</strong>
              </span>
              <input
                type="range"
                min={12}
                max={72}
                step={1}
                value={textSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTextSize(next);
                  if (selectedId) {
                    const sel = docRef.current.items.find((it) => it.id === selectedId);
                    if (sel?.type === "text") updateItem(selectedId, { fontSize: next });
                  }
                }}
              />
            </label>
            <div className="wb-flyout__title">{fr ? "Couleur" : "Color"}</div>
            <div className="wb-flyout__colors">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`wb-swatch${drawColor === c ? " is-active" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    setDrawColor(c);
                    if (selectedId) {
                      const sel = docRef.current.items.find((it) => it.id === selectedId);
                      if (sel?.type === "text") updateItem(selectedId, { color: c });
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!toolbarCollapsed ? (
          <div className="wb-toolbar" role="toolbar" aria-label="Whiteboard tools">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? "is-active" : ""}
                title={`${t.label} (${t.shortcut})`}
                onClick={() => pickTool(t.id)}
              >
                <span className="wb-toolbar__key">{t.shortcut}</span>
                <ToolIcon name={t.id === "draw" ? drawStyle : t.id} size={24} />
              </button>
            ))}
            <span className="wb-toolbar__sep" />
            <button type="button" title="Undo" onClick={undo} disabled={history.length === 0}>
              <span className="wb-toolbar__key">⌘Z</span>
              <ToolIcon name="undo" size={22} />
            </button>
            <button type="button" title="Redo" onClick={redo} disabled={future.length === 0}>
              <ToolIcon name="redo" size={22} />
            </button>
            <button type="button" title={fr ? "Supprimer" : "Delete"} onClick={deleteSelected} disabled={!selectedId}>
              <ToolIcon name="trash" size={22} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="wb-zoom">
        <button type="button" onClick={() => setCamera({ ...camera, zoom: Math.max(0.25, camera.zoom * 0.9) })}>
          −
        </button>
        <span>{zoomPct}%</span>
        <button type="button" onClick={() => setCamera({ ...camera, zoom: Math.min(2.5, camera.zoom * 1.1) })}>
          +
        </button>
        <button type="button" onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}>
          {fr ? "Reset" : "Reset"}
        </button>
      </div>
    </div>
  );
}

function ToolIcon({
  name,
  size = 24,
}: {
  name: Tool | DrawStyle | "trash" | "undo" | "redo";
  size?: number;
}) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const };
  switch (name) {
    case "select":
      return (
        <svg {...common}>
          <path d="M5 3l6.5 16.5 2.4-6.6L20.5 11 5 3z" fill="currentColor" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path
            d="M8 11V7.2a1.6 1.6 0 013.2 0V11m0-2.8a1.6 1.6 0 013.2 0V12m0-2.2a1.6 1.6 0 013.2 0v5.2a5.2 5.2 0 01-5.2 5.2H11A5.2 5.2 0 015.8 15v-3.8A1.6 1.6 0 019 11.2V11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "draw":
    case "pen":
      return (
        <svg {...common}>
          <path
            d="M14.2 4.2l5.6 5.6M4 20l1.6-5.8L15.8 4a2.1 2.1 0 013 0l1.2 1.2a2.1 2.1 0 010 3L8.8 18.4 4 20z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path
            d="M4 20l4.4-1.2L19.2 8a1.9 1.9 0 000-2.7L18.5 4.6a1.9 1.9 0 00-2.7 0L5.2 15.2 4 20z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M13.2 6.4l4.4 4.4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "marker":
      return (
        <svg {...common}>
          <path d="M7.2 15.2 16 6.4l3.2 3.2-8.8 8.8H7.2v-3.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14.4 8l3.2 3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7.2 18.8h5.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
    case "shape":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      );
    case "connector":
      return (
        <svg {...common}>
          <path d="M6 18 L18 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M11 6h7v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sticky":
      return (
        <svg {...common}>
          <path d="M6 4.5h9.2L18.5 8v11.5H6V4.5z" fill="#F6D45C" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M15.2 4.5V8H18.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8.5 12h7M8.5 15h5" stroke="#1a1a1a" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 9.2h8M12 9.2V16.5M9.8 16.5h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common}>
          <path d="M8 8H4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 12a7 7 0 107-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "redo":
      return (
        <svg {...common}>
          <path d="M16 8h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.5 12a7 7 0 11-7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
