/**
 * Adapter database untuk Turso (libSQL).
 *
 * Seluruh route memakai API bergaya D1: prepare(...).bind(...).first()/all()/run()
 * dan batch(). File ini menyediakan bentuk yang sama di atas @libsql/client,
 * sehingga logika pesanan, sesi, dan rate limit tidak perlu ditulis ulang.
 */
import { createClient, type Client, type InStatement } from "@libsql/client";

export type BindValue = string | number | boolean | null | Uint8Array;

export interface RunResult {
  success: true;
  meta: { changes: number; last_row_id: number | null };
  results: Array<Record<string, unknown>>;
}

export interface PreparedStatement {
  bind(...values: BindValue[]): PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }>;
  run(): Promise<RunResult>;
}

export interface Database {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<RunResult[]>;
}

function toRunResult(result: {
  rows: unknown[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
}): RunResult {
  return {
    success: true,
    meta: {
      changes: result.rowsAffected,
      last_row_id:
        result.lastInsertRowid === undefined ? null : Number(result.lastInsertRowid),
    },
    results: result.rows as Array<Record<string, unknown>>,
  };
}

class LibsqlStatement implements PreparedStatement {
  constructor(
    private readonly client: Client,
    private readonly sql: string,
    private readonly args: BindValue[] = [],
  ) {}

  bind(...values: BindValue[]): PreparedStatement {
    return new LibsqlStatement(this.client, this.sql, values);
  }

  private statement(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute(this.statement());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }> {
    const result = await this.client.execute(this.statement());
    return { results: result.rows as unknown as T[], success: true };
  }

  async run(): Promise<RunResult> {
    return toRunResult(await this.client.execute(this.statement()));
  }

  /** Dipakai internal oleh batch(); bukan bagian dari kontrak D1. */
  toInStatement(): InStatement {
    return this.statement();
  }
}

class LibsqlDatabase implements Database {
  constructor(private readonly client: Client) {}

  prepare(sql: string): PreparedStatement {
    return new LibsqlStatement(this.client, sql);
  }

  /** Seperti batch() D1: semua statement dijalankan dalam satu transaksi. */
  async batch(statements: PreparedStatement[]): Promise<RunResult[]> {
    if (statements.length === 0) return [];

    const batch = statements.map((statement) => {
      if (!(statement instanceof LibsqlStatement)) {
        throw new TypeError("Statement bukan berasal dari database ini.");
      }
      return statement.toInStatement();
    });

    const results = await this.client.batch(batch, "write");
    return results.map(toRunResult);
  }
}

export function createDatabase(options: {
  url: string;
  authToken?: string;
}): Database {
  const client = createClient({
    url: options.url,
    authToken: options.authToken,
    intMode: "number",
  });
  return new LibsqlDatabase(client);
}
