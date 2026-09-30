// A tiny stand-in for supabase-js's query builder that runs on PGlite, so the
// app's real catalog / video library code can be tested against real SQL.
// It covers what those reads use: select, eq/neq/gt/gte/lt/lte, like/ilike, is,
// in, contains/overlaps, not, or (PostgREST syntax, nested and()/or()),
// textSearch, order, range, limit, maybeSingle. Anything else throws.
import type { PGlite } from "@electric-sql/pglite";

type Result = { data: unknown; error: { message: string } | null };

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`postgrest-pglite: unsupported column "${name}"`);
  return `"${name}"`;
};

/** Splits on commas that are not inside (), {} or double quotes. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === "(" || ch === "{")) depth += 1;
    if (!quoted && (ch === ")" || ch === "}")) depth -= 1;
    if (ch === "," && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const unquote = (v: string) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
const listOf = (v: string) => splitTop(v.replace(/^[({]|[)}]$/g, "")).map(unquote);

class Query implements PromiseLike<Result> {
  private cols = "*";
  private where: string[] = [];
  private params: unknown[] = [];
  private orders: string[] = [];
  private offsetN: number | null = null;
  private limitN: number | null = null;
  private singleRow = false;

  constructor(
    private db: PGlite,
    private table: string,
  ) {}

  private p(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }

  /** One condition; `value` is a JS value (builder methods) or raw text (or-strings). */
  private cond(col: string, op: string, value: unknown, raw: boolean): string {
    const c = ident(col);
    const text = (v: unknown) => (raw ? unquote(String(v)) : v);
    const arr = (v: unknown) => (raw ? listOf(String(v)) : (v as unknown[]));
    switch (op) {
      case "eq":
        return `${c} = ${this.p(text(value))}`;
      case "neq":
        return `${c} <> ${this.p(text(value))}`;
      case "gt":
        return `${c} > ${this.p(text(value))}`;
      case "gte":
        return `${c} >= ${this.p(text(value))}`;
      case "lt":
        return `${c} < ${this.p(text(value))}`;
      case "lte":
        return `${c} <= ${this.p(text(value))}`;
      case "like":
        return `${c}::text like ${this.p(String(text(value)).replace(/\*/g, "%"))}`;
      case "ilike":
        return `${c}::text ilike ${this.p(String(text(value)).replace(/\*/g, "%"))}`;
      case "is": {
        const v = String(value).toLowerCase();
        if (v === "null") return `${c} is null`;
        if (v === "true") return `${c} is true`;
        if (v === "false") return `${c} is false`;
        throw new Error(`postgrest-pglite: is.${v}`);
      }
      case "in":
        return `${c} = any(${this.p(arr(value))})`;
      case "cs":
        return `${c} @> ${this.p(arr(value))}`;
      case "cd":
        return `${c} <@ ${this.p(arr(value))}`;
      case "ov":
        return `${c} && ${this.p(arr(value))}`;
      default:
        throw new Error(`postgrest-pglite: operator ${op}`);
    }
  }

  /** PostgREST logic tree: "a.eq.1,and(b.is.null,c.ilike.x),or(...)" */
  private logic(expr: string, joiner: "or" | "and"): string {
    const parts = splitTop(expr).map((item) => {
      const group = item.match(/^(not\.)?(and|or)\((.*)\)$/s);
      if (group) {
        const inner = `(${this.logic(group[3], group[2] as "and" | "or")})`;
        return group[1] ? `not ${inner}` : inner;
      }
      const m = item.match(/^([a-z_][a-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/is);
      if (!m) throw new Error(`postgrest-pglite: cannot parse "${item}"`);
      const c = this.cond(m[1], m[3], m[4], true);
      return m[2] ? `not (${c})` : c;
    });
    return parts.join(` ${joiner} `);
  }

  select(cols = "*") {
    this.cols = cols
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c === "*" ? "*" : ident(c)))
      .join(", ");
    return this;
  }
  eq(c: string, v: unknown) {
    this.where.push(this.cond(c, "eq", v, false));
    return this;
  }
  neq(c: string, v: unknown) {
    this.where.push(this.cond(c, "neq", v, false));
    return this;
  }
  gt(c: string, v: unknown) {
    this.where.push(this.cond(c, "gt", v, false));
    return this;
  }
  gte(c: string, v: unknown) {
    this.where.push(this.cond(c, "gte", v, false));
    return this;
  }
  lt(c: string, v: unknown) {
    this.where.push(this.cond(c, "lt", v, false));
    return this;
  }
  lte(c: string, v: unknown) {
    this.where.push(this.cond(c, "lte", v, false));
    return this;
  }
  like(c: string, v: string) {
    this.where.push(this.cond(c, "like", v, false));
    return this;
  }
  ilike(c: string, v: string) {
    this.where.push(this.cond(c, "ilike", v, false));
    return this;
  }
  is(c: string, v: null | boolean) {
    this.where.push(this.cond(c, "is", String(v), false));
    return this;
  }
  in(c: string, v: unknown[]) {
    this.where.push(this.cond(c, "in", v, false));
    return this;
  }
  contains(c: string, v: unknown[]) {
    this.where.push(this.cond(c, "cs", v, false));
    return this;
  }
  overlaps(c: string, v: unknown[]) {
    this.where.push(this.cond(c, "ov", v, false));
    return this;
  }
  not(c: string, op: string, v: unknown) {
    this.where.push(`not (${this.cond(c, op, v === null ? "null" : v, op === "is")})`);
    return this;
  }
  or(expr: string) {
    this.where.push(`(${this.logic(expr, "or")})`);
    return this;
  }
  textSearch(c: string, query: string, opts: { type?: string; config?: string } = {}) {
    const config = this.p(opts.config ?? "simple");
    const fn = opts.type === "websearch" ? "websearch_to_tsquery" : opts.type === "phrase" ? "phraseto_tsquery" : opts.type === "plain" ? "plainto_tsquery" : "to_tsquery";
    this.where.push(`to_tsvector(${config}::regconfig, ${ident(c)}) @@ ${fn}(${config}::regconfig, ${this.p(query)})`);
    return this;
  }
  order(c: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir = opts.ascending === false ? "desc" : "asc";
    const nulls = opts.nullsFirst == null ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${ident(c)} ${dir}${nulls}`);
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  limit(nRows: number) {
    this.limitN = nRows;
    return this;
  }
  maybeSingle() {
    this.singleRow = true;
    return this;
  }

  sql(): string {
    let s = `select ${this.cols} from public.${ident(this.table)}`;
    if (this.where.length) s += ` where ${this.where.join(" and ")}`;
    if (this.orders.length) s += ` order by ${this.orders.join(", ")}`;
    if (this.limitN != null) s += ` limit ${this.limitN}`;
    if (this.offsetN != null) s += ` offset ${this.offsetN}`;
    return s;
  }

  async run(): Promise<Result> {
    try {
      const res = await this.db.query(this.sql(), this.params);
      const rows = res.rows as Record<string, unknown>[];
      const types = new Map(res.fields.map((f) => [f.name, f.dataTypeID]));
      // Values as PostgREST's JSON would carry them: int8/numeric as numbers,
      // timestamps as ISO text, dates as YYYY-MM-DD.
      const json = (k: string, v: unknown) => {
        if (v == null) return v;
        const t = types.get(k);
        if (t === 20 || t === 1700 || typeof v === "bigint") return Number(v);
        if (v instanceof Date) return t === 1082 ? v.toISOString().slice(0, 10) : v.toISOString();
        return v;
      };
      const data = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, json(k, v)])));
      return { data: this.singleRow ? (data[0] ?? null) : data, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, fail);
  }
}

/** A supabase-js-like client whose `.from()` queries PGlite (as the service role would). */
export function pgliteClient(db: PGlite) {
  const log: string[] = [];
  return {
    log,
    from(table: string) {
      const q = new Query(db, table);
      const origRun = q.run.bind(q);
      q.run = async () => {
        log.push(q.sql());
        return origRun();
      };
      return q;
    },
    rpc() {
      throw new Error("postgrest-pglite: rpc is not supported");
    },
  };
}
