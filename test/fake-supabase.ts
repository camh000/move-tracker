/**
 * Minimal in-memory stand-in for the parts of supabase-js the sync engine
 * uses. One FakeServer is shared by several "devices" so tests can exercise
 * two phones syncing through the same backend. It mimics the Postgres
 * behaviour the sync engine relies on:
 *  - updated_at stamped by the server on insert and update (0003 migration)
 *  - unique box numbers / room names, primary keys (23505)
 *  - foreign keys items→boxes, item_photos→items (23503) with cascade delete
 *  - PostgREST's 1000-row cap on un-ranged selects
 */

type Row = Record<string, unknown> & { id: string };
type Table = "boxes" | "items" | "item_photos" | "rooms";
interface PgError {
  code?: string;
  message: string;
}
type Result = { data: unknown; error: PgError | null };

const MAX_ROWS = 1000;

export class FakeServer {
  tables: Record<Table, Row[]> = { boxes: [], items: [], item_photos: [], rooms: [] };
  storage = new Map<string, Blob>();
  online = true;
  /** Server clock (ms). Advance with tick(). */
  now = Date.parse("2026-10-01T09:00:00Z");
  /** Queued one-off failures: first matching call returns this error. */
  failures: { table: Table; op: "insert" | "update" | "delete" | "select"; error: PgError; rowId?: string }[] = [];
  requests = 0;

  tick(ms = 1000) {
    this.now += ms;
  }

  stamp() {
    this.tick(1);
    // Postgres-style timestamp.
    return new Date(this.now).toISOString().replace("Z", "+00:00");
  }

  takeFailure(table: Table, op: string, rowId?: string): PgError | null {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op && (!f.rowId || f.rowId === rowId));
    if (i < 0) return null;
    return this.failures.splice(i, 1)[0].error;
  }

  client(userId = "user-a") {
    return new FakeClient(this, userId);
  }
}

const offlineError: PgError = { message: "TypeError: Failed to fetch" };

class FakeClient {
  constructor(
    private server: FakeServer,
    private userId: string,
  ) {}

  from(table: Table) {
    return new Query(this.server, table);
  }

  auth = {
    getSession: async () => ({ data: { session: { user: { id: this.userId } } }, error: null }),
    getUser: async () => ({ data: { user: { id: this.userId } }, error: null }),
  };

  storage = {
    from: () => ({
      upload: async (path: string, blob: Blob) => {
        if (!this.server.online) return { data: null, error: offlineError };
        this.server.storage.set(path, blob);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        if (!this.server.online) return { data: null, error: offlineError };
        for (const p of paths) this.server.storage.delete(p);
        return { data: [], error: null };
      },
      download: async (path: string) => {
        if (!this.server.online) return { data: null, error: offlineError };
        const b = this.server.storage.get(path);
        return b ? { data: b, error: null } : { data: null, error: { message: "not found" } };
      },
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://fake/${path}` }, error: null }),
    }),
  };
}

class Query implements PromiseLike<Result> {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private cols = "*";
  private filters: ((r: Row) => boolean)[] = [];
  private eqId: string | undefined;
  private orderBy: { col: string; asc: boolean } | null = null;
  private rangeFrom: number | null = null;
  private rangeTo = 0;
  private lim: number | null = null;
  private single = false;
  private payload: Record<string, unknown> | null = null;

  constructor(
    private server: FakeServer,
    private table: Table,
  ) {}

  select(cols = "*") {
    this.cols = cols;
    return this;
  }
  insert(row: Record<string, unknown>) {
    this.mode = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    if (col === "id") this.eqId = val as string;
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gt(col: string, val: string) {
    this.filters.push((r) => Date.parse(r[col] as string) > Date.parse(val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }

  private rows() {
    return this.server.tables[this.table];
  }

  private run(): Result {
    const s = this.server;
    s.requests++;
    if (!s.online) return { data: null, error: offlineError };
    const rowId = this.mode === "insert" ? (this.payload!.id as string) : this.eqId;
    const injected = s.takeFailure(this.table, this.mode, rowId);
    if (injected) return { data: null, error: injected };

    if (this.mode === "insert") return this.doInsert();
    if (this.mode === "update") {
      for (const r of this.rows().filter((r) => this.filters.every((f) => f(r)))) {
        if (this.table === "items" && this.payload!.box_id && !s.tables.boxes.some((b) => b.id === this.payload!.box_id)) {
          return { data: null, error: { code: "23503", message: "violates foreign key constraint items_box_id_fkey" } };
        }
        Object.assign(r, this.payload, { updated_at: s.stamp() });
      }
      return { data: null, error: null };
    }
    if (this.mode === "delete") {
      for (const r of this.rows().filter((r) => this.filters.every((f) => f(r)))) this.cascadeDelete(this.table, r.id);
      return { data: null, error: null };
    }

    let out = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => ((a[col] as never) < (b[col] as never) ? -1 : (a[col] as never) > (b[col] as never) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.rangeFrom != null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.lim != null) out = out.slice(0, this.lim);
    out = out.slice(0, MAX_ROWS); // PostgREST max-rows
    const projected = out.map((r) => {
      if (this.cols === "*") return { ...r };
      const o: Record<string, unknown> = {};
      for (const c of this.cols.split(",").map((x) => x.trim())) o[c] = r[c];
      return o;
    });
    if (this.single) return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }

  private doInsert(): Result {
    const s = this.server;
    const row = { ...this.payload! } as Row;
    const rows = this.rows();
    if (rows.some((r) => r.id === row.id)) {
      return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${this.table}_pkey"` } };
    }
    if (this.table === "boxes" && rows.some((r) => r.number === row.number)) {
      return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "boxes_number_key"' } };
    }
    if (this.table === "rooms" && rows.some((r) => r.name === row.name)) {
      return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "rooms_name_key"' } };
    }
    if (this.table === "items" && !s.tables.boxes.some((b) => b.id === row.box_id)) {
      return { data: null, error: { code: "23503", message: "violates foreign key constraint items_box_id_fkey" } };
    }
    if (this.table === "item_photos" && !s.tables.items.some((i) => i.id === row.item_id)) {
      return { data: null, error: { code: "23503", message: "violates foreign key constraint item_photos_item_id_fkey" } };
    }
    const defaults: Record<Table, Record<string, unknown>> = {
      boxes: { open_first: false, fragile: false, heavy: false, arrived: false, unpacked: false, sealed: false, notes: null },
      items: { unpacked: false, description: null },
      item_photos: {},
      rooms: {},
    };
    rows.push({ ...defaults[this.table], ...row, updated_at: s.stamp() });
    return { data: null, error: null };
  }

  private cascadeDelete(table: Table, id: string) {
    const s = this.server;
    s.tables[table] = s.tables[table].filter((r) => r.id !== id);
    if (table === "boxes") for (const i of s.tables.items.filter((i) => i.box_id === id)) this.cascadeDelete("items", i.id);
    if (table === "items") s.tables.item_photos = s.tables.item_photos.filter((p) => p.item_id !== id);
  }
}
