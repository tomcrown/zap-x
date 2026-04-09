import postgres from 'postgres';
import { config } from '../config/index.js';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (_sql) return _sql;
  _sql = postgres(config.db.url, {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return _sql;
}

export default getDb;
