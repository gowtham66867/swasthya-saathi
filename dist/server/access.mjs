import { createHash, timingSafeEqual } from "node:crypto";
export function tokenEqual(candidate, expected) {
  if (
    typeof candidate !== "string" ||
    typeof expected !== "string" ||
    !candidate ||
    !expected
  )
    return false;
  // Fixed-size digests avoid unequal-length exceptions without prefix comparison.
  const digest = (text) => createHash("sha256").update(text, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
