export function withIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withIds(item)) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, item]) => {
    next[key] = withIds(item);
  });
  if (next.id === undefined && typeof next._id === "string") next.id = next._id;
  return next as T;
}
