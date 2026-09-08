export function selectTargetGenreIndex(length: number, key: string) {
  if (!Number.isInteger(length) || length < 1) throw new RangeError('At least one target genre is required.');

  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) % length;
}
