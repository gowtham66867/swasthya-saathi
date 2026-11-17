const norm = (s) => [
  ...s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\p{S}\s]/gu, ""),
];
export function characterError(reference, actual) {
  const a = norm(reference),
    b = norm(actual);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return {
    errors: prev[b.length],
    referenceCharacters: a.length,
    rate: prev[b.length] / Math.max(1, a.length),
  };
}
