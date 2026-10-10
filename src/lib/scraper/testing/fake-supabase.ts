// In-memory stand-in for the supabase-js calls the scraper makes (tests only).
// Tables are arrays of rows; upserts honour onConflict / ignoreDuplicates;
// inserts enforce the same unique keys as the real schema (primary keys, the
// unique creators_index.username and "one live job per target" on scrape_jobs).
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null; count?: number | null };

const KEYS: Record<string, string[][]> = {
  creators_index: [["username"]],
  creator_snapshots: [["platform", "username", "captured_on"]],
  creator_videos: [["platform", "video_id"]],
  creator_video_snapshots: [["platform", "video_id", "captured_on"]],
  scrape_jobs: [["id"]],
  scrape_runs: [["id"]],
};

const DEFAULTS: Record<string, () => Row> = {
  creators_index: () => ({ scrape_failures: 0, scrape_priority: 5, platform: "tiktok" }),
  scrape_jobs: () => ({ status: "queued", attempts: 0, priority: 5, run_after: new Date(0).toISOString(), locked_at: null, created_at: new Date().toISOString() }),
  scrape_runs: () => ({ started_at: new Date().toISOString(), api_calls: 0, jobs_done: 0, notes: null }),
};

const sameKey = (a: Row, b: Row, cols: string[]) => cols.every((c) => a[c] === b[c]);

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  rpcCalls: { name: string; args: any }[] = [];
  uploads: string[] = [];
  private seq = 1;
  rpcs: Record<string, (args: any, db: FakeSupabase) => any> = {
    refresh_creator_rollup: () => null,
    enqueue_tracked_creators: () => 0,
    claim_scrape_jobs: (args, db) => {
      const now = new Date().toISOString();
      const ready = db
        .table("scrape_jobs")
        .filter((j) => j.status === "queued" && j.run_after <= now && (args.p_kinds as string[]).includes(j.kind))
        .sort((a, b) => a.priority - b.priority || String(a.run_after).localeCompare(String(b.run_after)))
        .slice(0, Math.max(0, args.p_limit));
      for (const j of ready) Object.assign(j, { status: "running", locked_at: now, attempts: j.attempts + 1 });
      return ready.map((j) => ({ ...j }));
    },
  };

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  /** Insert or refuse on a unique key, like Postgres. */
  put(name: string, row: Row): string | null {
    const full: Row = { ...(DEFAULTS[name]?.() ?? {}), ...row };
    if ((name === "scrape_jobs" || name === "scrape_runs") && full.id == null) full.id = this.seq++;
    for (const cols of KEYS[name] ?? []) {
      if (this.table(name).some((r) => sameKey(r, full, cols))) return `duplicate key value violates unique constraint (${cols.join(",")})`;
    }
    if (name === "scrape_jobs" && ["queued", "running"].includes(full.status)) {
      const live = this.table(name).some(
        (j) => ["queued", "running"].includes(j.status) && j.kind === full.kind && j.platform === full.platform && j.target === full.target,
      );
      if (live) return "duplicate key value violates unique constraint scrape_jobs_live_uq";
    }
    this.table(name).push(full);
    return null;
  }

  from(name: string) {
    return new FakeQuery(this, name);
  }

  rpc(name: string, args: any = {}): Promise<Result> {
    this.rpcCalls.push({ name, args });
    const fn = this.rpcs[name];
    if (!fn) return Promise.resolve({ data: null, error: { message: `Could not find the function public.${name} in the schema cache` } });
    return Promise.resolve({ data: fn(args, this), error: null });
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        this.uploads.push(`${bucket}/${path}`);
        return { error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
    }),
  };

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filters: ((r: Row) => boolean)[] = [];
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] | null = null;
  private ignoreDuplicates = false;
  private returning = false;
  private one: "single" | "maybe" | null = null;
  private limitN: number | null = null;
  private from_ = 0;
  private headOnly = false;
  private wantCount = false;
  private orderBy: { col: string; asc: boolean } | null = null;

  constructor(
    private db: FakeSupabase,
    private name: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : (KEYS[this.name]?.[0] ?? null);
    this.ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  gte(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] >= v);
    return this;
  }
  gt(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] > v);
    return this;
  }
  lte(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] <= v);
    return this;
  }
  lt(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] < v);
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (v === null ? r[c] == null : r[c] === v));
    return this;
  }
  ilike(c: string, v: string) {
    const re = new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    this.filters.push((r) => re.test(String(r[c] ?? "")));
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.from_ = from;
    this.limitN = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }

  private matches(): Row[] {
    return this.db.table(this.name).filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): Result {
    const rows = this.db.table(this.name);
    if (this.op === "insert") {
      const inserted: Row[] = [];
      const snapshot = [...rows];
      for (const r of this.payload) {
        const err = this.db.put(this.name, r);
        if (err) {
          this.db.tables[this.name] = snapshot; // the whole statement fails
          return { data: null, error: { message: err } };
        }
        inserted.push(this.db.table(this.name)[this.db.table(this.name).length - 1]);
      }
      return this.shape(inserted);
    }
    if (this.op === "upsert") {
      const out: Row[] = [];
      for (const r of this.payload) {
        const existing = this.conflict ? rows.find((x) => sameKey(x, r, this.conflict!)) : undefined;
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, r);
          out.push(existing);
        } else {
          const err = this.db.put(this.name, r);
          if (err) return { data: null, error: { message: err } };
          out.push(this.db.table(this.name)[this.db.table(this.name).length - 1]);
        }
      }
      return this.shape(out);
    }
    if (this.op === "update") {
      const hit = this.matches();
      for (const r of hit) Object.assign(r, this.patch);
      return this.shape(hit);
    }
    if (this.op === "delete") {
      const hit = new Set(this.matches());
      this.db.tables[this.name] = rows.filter((r) => !hit.has(r));
      return this.shape([...hit]);
    }
    let found = this.matches();
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      found = [...found].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
    }
    const count = found.length;
    found = found.slice(this.from_, this.limitN == null ? undefined : this.from_ + this.limitN);
    if (this.headOnly) return { data: null, error: null, count };
    const res = this.shape(found.map((r) => ({ ...r })));
    return this.wantCount ? { ...res, count } : res;
  }

  private shape(rows: Row[]): Result {
    if (this.op !== "select" && !this.returning && !this.one) return { data: null, error: null };
    if (this.one === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
    if (this.one === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.run()).then(ok, fail);
    } catch (e) {
      return Promise.reject(e).then(ok, fail);
    }
  }
}
