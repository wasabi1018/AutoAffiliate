export function rakutenItems(response: Record<string, unknown>): unknown[] | null {
  const nested = objectValue(response.data) ?? objectValue(response.result);
  const items = response.items ?? response.Items ?? nested?.items ?? nested?.Items;
  if (!Array.isArray(items)) return null;

  return items.map((entry) => {
    const value = objectValue(entry);
    return value?.item ?? value?.Item ?? entry;
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
