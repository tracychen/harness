import { createClient, type ClickHouseClient } from '@clickhouse/client';

let _client: ClickHouseClient | null = null;
export function ch(): ClickHouseClient {
  if (!_client) {
    _client = createClient({
      url: process.env.CLICKHOUSE_URL,
      username: process.env.CLICKHOUSE_USER ?? 'default',
      password: process.env.CLICKHOUSE_PASSWORD ?? '',
    });
  }
  return _client;
}

export async function insertRows<T>(table: string, rows: T[]): Promise<void> {
  if (rows.length === 0) return;
  await ch().insert({ table, values: rows, format: 'JSONEachRow' });
}

export async function query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const rs = await ch().query({ query: sql, query_params: params, format: 'JSONEachRow' });
  return rs.json<T>();
}
