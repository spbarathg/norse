// Redis removed. This module is kept to avoid breaking imports.
export type Redis = unknown;
export function getRedis(): never {
  throw new Error("Redis has been removed from this project. Use in-memory state instead.");
}