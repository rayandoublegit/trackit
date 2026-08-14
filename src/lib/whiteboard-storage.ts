import { workspaceStorageKey } from "@/lib/workspaces";

export type WbDrawTool = "pen" | "pencil" | "marker";

export type WbStroke = {
  id: string;
  type: "stroke";
  tool: WbDrawTool;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

export type WbSticky = {
  id: string;
  type: "sticky";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text: string;
};

export type WbTextBox = {
  id: string;
  type: "text";
  x: number;
  y: number;
  w: number;
  text: string;
  fontSize: number;
  color: string;
  /** CSS font-family stack */
  fontFamily?: string;
};

export const WB_TEXT_FONTS: Array<{ id: string; label: string; family: string }> = [
  { id: "inter", label: "Inter Display", family: "'InterDisplay', 'Inter', system-ui, sans-serif" },
  { id: "instrument", label: "Instrument Sans", family: "'InstrumentSans', system-ui, sans-serif" },
  { id: "system", label: "System", family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", family: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", family: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  { id: "tahoma", label: "Tahoma", family: "Tahoma, Verdana, sans-serif" },
  { id: "geneva", label: "Geneva", family: "Geneva, Verdana, sans-serif" },
  { id: "avenir", label: "Avenir", family: "Avenir, 'Avenir Next', Montserrat, sans-serif" },
  { id: "futura", label: "Futura", family: "Futura, 'Trebuchet MS', Arial, sans-serif" },
  { id: "gill", label: "Gill Sans", family: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { id: "optima", label: "Optima", family: "Optima, Candara, sans-serif" },
  { id: "century", label: "Century Gothic", family: "'Century Gothic', CenturyGothic, AppleGothic, sans-serif" },
  { id: "franklin", label: "Franklin Gothic", family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif" },
  { id: "impact", label: "Impact", family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
  { id: "times", label: "Times New Roman", family: "'Times New Roman', Times, serif" },
  { id: "palatino", label: "Palatino", family: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: "garamond", label: "Garamond", family: "Garamond, Baskerville, 'Times New Roman', serif" },
  { id: "baskerville", label: "Baskerville", family: "Baskerville, 'Times New Roman', serif" },
  { id: "didot", label: "Didot", family: "Didot, 'Bodoni MT', Georgia, serif" },
  { id: "bodoni", label: "Bodoni", family: "'Bodoni MT', Didot, Georgia, serif" },
  { id: "hoefler", label: "Hoefler Text", family: "'Hoefler Text', 'Times New Roman', serif" },
  { id: "charter", label: "Charter", family: "Charter, Georgia, serif" },
  { id: "rockwell", label: "Rockwell", family: "Rockwell, 'Courier New', Courier, serif" },
  { id: "courier", label: "Courier New", family: "'Courier New', Courier, monospace" },
  { id: "menlo", label: "Menlo", family: "Menlo, Monaco, 'Courier New', monospace" },
  { id: "monaco", label: "Monaco", family: "Monaco, Menlo, 'Courier New', monospace" },
  { id: "consolas", label: "Consolas", family: "Consolas, 'Courier New', monospace" },
  { id: "lucida", label: "Lucida Console", family: "'Lucida Console', Monaco, monospace" },
  { id: "american", label: "American Typewriter", family: "'American Typewriter', 'Courier New', serif" },
  { id: "copperplate", label: "Copperplate", family: "Copperplate, 'Copperplate Gothic Light', fantasy" },
  { id: "brush", label: "Brush Script", family: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: "comic", label: "Comic Sans", family: "'Comic Sans MS', 'Chalkboard SE', cursive" },
  { id: "chalk", label: "Chalkboard", family: "'Chalkboard SE', 'Comic Sans MS', cursive" },
  { id: "marker", label: "Marker Felt", family: "'Marker Felt', 'Comic Sans MS', cursive" },
  { id: "papyrus", label: "Papyrus", family: "Papyrus, fantasy" },
  { id: "noteworthy", label: "Noteworthy", family: "Noteworthy, 'Segoe Print', cursive" },
  { id: "snell", label: "Snell Roundhand", family: "'Snell Roundhand', 'Segoe Script', cursive" },
  { id: "zapfino", label: "Zapfino", family: "Zapfino, 'Segoe Script', cursive" },
];

export const WB_DEFAULT_TEXT_FONT = WB_TEXT_FONTS[0].family;

export type WbShape = {
  id: string;
  type: "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};

export type WbConnector = {
  id: string;
  type: "connector";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
};

export type WbItem = WbStroke | WbSticky | WbTextBox | WbShape | WbConnector;

export type WbCamera = { x: number; y: number; zoom: number };

export type WbDoc = {
  items: WbItem[];
  camera: WbCamera;
};

export type WbBoardMeta = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

export const WB_BOARDS_EVENT = "trackit:whiteboards-updated";
export const WB_ACTIVE_EVENT = "trackit:whiteboard-active";

export const WB_BOARD_COLORS = [
  "#F5D76E",
  "#FF8A80",
  "#80D8FF",
  "#A5D6A7",
  "#CE93D8",
  "#FFB74D",
  "#90CAF9",
  "#F48FB1",
] as const;

const STICKY_COLORS = ["#FFE566", "#FFB4C8", "#B8E0FF", "#C8F0C8", "#E8D4FF"] as const;

function normalizeBoard(b: Partial<WbBoardMeta> & { id: string; name: string }): WbBoardMeta {
  return {
    id: b.id,
    name: b.name || "Whiteboard",
    color: b.color || WB_BOARD_COLORS[0],
    createdAt: b.createdAt || Date.now(),
    updatedAt: b.updatedAt || Date.now(),
  };
}

function boardsKey(userId?: string) {
  return workspaceStorageKey(`trackit.whiteboards.meta.${userId || "anon"}`);
}

function docKey(boardId: string, userId?: string) {
  return workspaceStorageKey(`trackit.whiteboard.doc.${userId || "anon"}.${boardId}`);
}

function activeKey(userId?: string) {
  return workspaceStorageKey(`trackit.whiteboard.active.${userId || "anon"}`);
}

function legacyTextKey(userId?: string) {
  return workspaceStorageKey(`trackit.whiteboard.${userId || "anon"}`);
}

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyWbDoc(): WbDoc {
  return { items: [], camera: { x: 0, y: 0, zoom: 1 } };
}

export function loadWbBoards(userId?: string): WbBoardMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(boardsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Array<Partial<WbBoardMeta> & { id: string; name: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map(normalizeBoard);
        const needsWrite = parsed.some((b, i) => !b.color || b.color !== normalized[i].color);
        if (needsWrite) {
          try {
            localStorage.setItem(boardsKey(userId), JSON.stringify(normalized));
          } catch {
            /* ignore */
          }
        }
        return normalized;
      }
    }
    const legacy = localStorage.getItem(legacyTextKey(userId));
    const board: WbBoardMeta = {
      id: newId("wb"),
      name: "Whiteboard",
      color: WB_BOARD_COLORS[0],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const doc = emptyWbDoc();
    if (legacy?.trim()) {
      doc.items.push({
        id: newId("txt"),
        type: "text",
        x: 80,
        y: 80,
        w: 420,
        text: legacy,
        fontSize: 16,
        color: "#1a1a1a",
      });
    }
    saveWbBoards(userId, [board]);
    saveWbDoc(board.id, userId, doc);
    setActiveWbBoardId(userId, board.id);
    return [board];
  } catch {
    return [];
  }
}

export function saveWbBoards(userId: string | undefined, boards: WbBoardMeta[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(boardsKey(userId), JSON.stringify(boards));
    window.dispatchEvent(new CustomEvent(WB_BOARDS_EVENT));
  } catch {
    /* ignore */
  }
}

export function loadWbDoc(boardId: string, userId?: string): WbDoc {
  if (typeof window === "undefined") return emptyWbDoc();
  try {
    const raw = localStorage.getItem(docKey(boardId, userId));
    if (!raw) return emptyWbDoc();
    const parsed = JSON.parse(raw) as WbDoc;
    if (!parsed || !Array.isArray(parsed.items)) return emptyWbDoc();
    return {
      items: parsed.items.map((it) => {
        if (it.type !== "text") return it;
        return {
          ...it,
          fontFamily: it.fontFamily || WB_DEFAULT_TEXT_FONT,
        };
      }),
      camera: parsed.camera || { x: 0, y: 0, zoom: 1 },
    };
  } catch {
    return emptyWbDoc();
  }
}

export function saveWbDoc(boardId: string, userId: string | undefined, doc: WbDoc) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(docKey(boardId, userId), JSON.stringify(doc));
  } catch {
    /* ignore */
  }
}

export function getActiveWbBoardId(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

export function setActiveWbBoardId(userId: string | undefined, boardId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(activeKey(userId), boardId);
    window.dispatchEvent(new CustomEvent(WB_ACTIVE_EVENT, { detail: { boardId } }));
  } catch {
    /* ignore */
  }
}

export function createWbBoard(
  userId: string | undefined,
  name: string,
  color?: string,
): WbBoardMeta {
  const boards = loadWbBoards(userId);
  const board: WbBoardMeta = {
    id: newId("wb"),
    name: name.trim() || "Whiteboard",
    color: color || WB_BOARD_COLORS[boards.length % WB_BOARD_COLORS.length],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveWbBoards(userId, [board, ...boards]);
  saveWbDoc(board.id, userId, emptyWbDoc());
  setActiveWbBoardId(userId, board.id);
  return board;
}

export function renameWbBoard(userId: string | undefined, boardId: string, name: string) {
  const boards = loadWbBoards(userId).map((b) =>
    b.id === boardId ? { ...b, name: name.trim() || b.name, updatedAt: Date.now() } : b,
  );
  saveWbBoards(userId, boards);
}

export function updateWbBoardColor(userId: string | undefined, boardId: string, color: string) {
  const boards = loadWbBoards(userId).map((b) =>
    b.id === boardId ? { ...b, color, updatedAt: Date.now() } : b,
  );
  saveWbBoards(userId, boards);
}

export function updateWbBoardMeta(
  userId: string | undefined,
  boardId: string,
  patch: Partial<Pick<WbBoardMeta, "name" | "color">>,
) {
  const boards = loadWbBoards(userId).map((b) =>
    b.id === boardId
      ? {
          ...b,
          name: patch.name != null ? patch.name.trim() || b.name : b.name,
          color: patch.color || b.color,
          updatedAt: Date.now(),
        }
      : b,
  );
  saveWbBoards(userId, boards);
}

export function deleteWbBoard(userId: string | undefined, boardId: string) {
  const boards = loadWbBoards(userId).filter((b) => b.id !== boardId);
  saveWbBoards(userId, boards);
  try {
    localStorage.removeItem(docKey(boardId, userId));
  } catch {
    /* ignore */
  }
  const active = getActiveWbBoardId(userId);
  if (active === boardId) {
    if (boards[0]) setActiveWbBoardId(userId, boards[0].id);
    else {
      const created = createWbBoard(userId, "Whiteboard");
      setActiveWbBoardId(userId, created.id);
    }
  }
}

export function touchWbBoard(userId: string | undefined, boardId: string) {
  const boards = loadWbBoards(userId).map((b) =>
    b.id === boardId ? { ...b, updatedAt: Date.now() } : b,
  );
  saveWbBoards(userId, boards);
}

export function nextStickyColor(index: number) {
  return STICKY_COLORS[index % STICKY_COLORS.length];
}

export function newWbItemId(prefix: string) {
  return newId(prefix);
}
