import type { BoxRow, ItemRow, ItemPhotoRow, RoomRow } from "@/lib/db/dexie";

export type TableName = "boxes" | "items" | "item_photos" | "rooms";
export type OpName = "select" | "insert" | "update" | "delete";

export interface PgError {
  code: string;
  message: string;
}

export interface FailureSpec {
  table: TableName;
  op: OpName;
  times: number;
  error: PgError;
  /** If set, only fails when the operation's row id matches. For inserts, payload.id; for update/delete, the eq("id", X) value. */
  rowId?: string;
}

export interface MockState {
  tables: {
    boxes: BoxRow[];
    items: ItemRow[];
    item_photos: ItemPhotoRow[];
    rooms: RoomRow[];
  };
  user: { id: string } | null;
  failures: FailureSpec[];
  storage: { uploaded: Map<string, Blob>; failUpload: boolean };
  inserts: Record<TableName, Array<Record<string, unknown>>>;
  updates: Record<TableName, Array<{ patch: Record<string, unknown>; eq: [string, unknown] }>>;
  deletes: Record<TableName, Array<[string, unknown]>>;
}

function popFailure(state: MockState, table: TableName, op: OpName, rowId?: string): PgError | null {
  for (let i = 0; i < state.failures.length; i++) {
    const f = state.failures[i];
    if (f.table !== table || f.op !== op || f.times <= 0) continue;
    if (f.rowId != null && f.rowId !== rowId) continue;
    f.times -= 1;
    return f.error;
  }
  return null;
}

interface QueryState {
  filters: Array<[string, unknown]>;
  order: { col: string; ascending: boolean } | null;
  limit: number | null;
  selectCols: string;
}

class TableQuery {
  private q: QueryState = { filters: [], order: null, limit: null, selectCols: "*" };

  constructor(private state: MockState, private table: TableName) {}

  select(cols: string = "*") {
    this.q.selectCols = cols;
    return this;
  }

  eq(col: string, val: unknown) {
    this.q.filters.push([col, val]);
    return this;
  }

  gt(col: string, val: unknown) {
    this.q.filters.push([`__gt__${col}`, val]);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.q.order = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.q.limit = n;
    return this;
  }

  // thenable so `await` resolves to { data, error } even without explicit terminator
  then<TResult1 = { data: unknown; error: PgError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: PgError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.runSelect()).then(onfulfilled, onrejected);
  }

  private runSelect(): { data: unknown; error: PgError | null } {
    const err = popFailure(this.state, this.table, "select");
    if (err) return { data: null, error: err };
    let rows = [...(this.state.tables[this.table] as Array<Record<string, unknown>>)];
    for (const [col, val] of this.q.filters) {
      if (col.startsWith("__gt__")) {
        const realCol = col.slice("__gt__".length);
        rows = rows.filter((r) => (r[realCol] as string | number) > (val as string | number));
      } else {
        rows = rows.filter((r) => r[col] === val);
      }
    }
    if (this.q.order) {
      const { col, ascending } = this.q.order;
      rows.sort((a, b) => {
        const av = a[col] as number;
        const bv = b[col] as number;
        if (av === bv) return 0;
        return ascending ? (av < bv ? -1 : 1) : (av < bv ? 1 : -1);
      });
    }
    if (this.q.limit != null) rows = rows.slice(0, this.q.limit);
    const projected = this.q.selectCols === "*"
      ? rows
      : rows.map((r) => {
          const cols = this.q.selectCols.split(",").map((c) => c.trim());
          const out: Record<string, unknown> = {};
          for (const c of cols) out[c] = r[c];
          return out;
        });
    return { data: projected, error: null };
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]) {
    const rows = Array.isArray(row) ? row : [row];
    const firstId = typeof rows[0]?.id === "string" ? (rows[0].id as string) : undefined;
    const err = popFailure(this.state, this.table, "insert", firstId);
    if (err) {
      return Promise.resolve({ data: null, error: err });
    }
    const tableRows = this.state.tables[this.table] as Array<Record<string, unknown>>;
    for (const r of rows) {
      this.state.inserts[this.table].push({ ...r });
      const existingByPk = tableRows.find((existing) => existing.id === r.id);
      if (existingByPk) {
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint id" },
        });
      }
      if (this.table === "boxes" && typeof r.number === "number") {
        const dupe = tableRows.find((existing) => (existing as BoxRow).number === r.number);
        if (dupe) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint boxes_number_key" },
          });
        }
      }
      if (this.table === "rooms" && typeof r.name === "string") {
        const dupe = tableRows.find((existing) => (existing as RoomRow).name === r.name);
        if (dupe) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint rooms_name_key" },
          });
        }
      }
      tableRows.push({ ...r });
    }
    return Promise.resolve({ data: rows, error: null });
  }

  update(patch: Record<string, unknown>) {
    return {
      eq: (col: string, val: unknown) => {
        const rowId = col === "id" && typeof val === "string" ? val : undefined;
        const err = popFailure(this.state, this.table, "update", rowId);
        if (err) return Promise.resolve({ data: null, error: err });
        const tableRows = this.state.tables[this.table] as Array<Record<string, unknown>>;
        for (const r of tableRows) {
          if (r[col] === val) Object.assign(r, patch);
        }
        this.state.updates[this.table].push({ patch: { ...patch }, eq: [col, val] });
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  delete() {
    return {
      eq: (col: string, val: unknown) => {
        const rowId = col === "id" && typeof val === "string" ? val : undefined;
        const err = popFailure(this.state, this.table, "delete", rowId);
        if (err) return Promise.resolve({ data: null, error: err });
        const tableRows = this.state.tables[this.table] as Array<Record<string, unknown>>;
        const before = tableRows.length;
        for (let i = tableRows.length - 1; i >= 0; i--) {
          if (tableRows[i][col] === val) tableRows.splice(i, 1);
        }
        this.state.deletes[this.table].push([col, val]);
        return Promise.resolve({ data: null, error: null, count: before - tableRows.length });
      },
    };
  }
}

class StorageBucket {
  constructor(private state: MockState, private bucket: string) {}

  async upload(path: string, blob: Blob) {
    void this.bucket;
    if (this.state.storage.failUpload) {
      return { data: null, error: { code: "storage_failure", message: "upload failed" } as PgError };
    }
    this.state.storage.uploaded.set(path, blob);
    return { data: { path }, error: null };
  }

  async remove(paths: string[]) {
    for (const p of paths) this.state.storage.uploaded.delete(p);
    return { data: paths.map((p) => ({ name: p })), error: null };
  }
}

export interface MockSupabaseClient {
  from: (table: TableName) => TableQuery;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }> };
  storage: { from: (bucket: string) => StorageBucket };
}

export interface CreateMockOptions {
  tables?: Partial<MockState["tables"]>;
  user?: { id: string } | null;
  failures?: FailureSpec[];
  storage?: { uploaded?: Map<string, Blob>; failUpload?: boolean };
}

export function createMockSupabase(opts: CreateMockOptions = {}): { client: MockSupabaseClient; state: MockState } {
  const state: MockState = {
    tables: {
      boxes: opts.tables?.boxes ?? [],
      items: opts.tables?.items ?? [],
      item_photos: opts.tables?.item_photos ?? [],
      rooms: opts.tables?.rooms ?? [],
    },
    user: opts.user ?? { id: "test-user-id" },
    failures: opts.failures ?? [],
    storage: {
      uploaded: opts.storage?.uploaded ?? new Map(),
      failUpload: opts.storage?.failUpload ?? false,
    },
    inserts: { boxes: [], items: [], item_photos: [], rooms: [] },
    updates: { boxes: [], items: [], item_photos: [], rooms: [] },
    deletes: { boxes: [], items: [], item_photos: [], rooms: [] },
  };

  const client: MockSupabaseClient = {
    from: (table) => new TableQuery(state, table),
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    storage: {
      from: (bucket) => new StorageBucket(state, bucket),
    },
  };

  return { client, state };
}

export const mockSupabaseRef: { current: MockSupabaseClient } = {
  current: createMockSupabase().client,
};

export function installMockSupabase(opts: CreateMockOptions = {}): MockState {
  const { client, state } = createMockSupabase(opts);
  mockSupabaseRef.current = client;
  return state;
}
