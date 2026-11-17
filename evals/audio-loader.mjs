import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, relative, extname, isAbsolute } from "node:path";
const mimes = {
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};
export async function loadAudioManifest(manifestPath) {
  const path = await realpath(manifestPath),
    root = dirname(path);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (
    !Array.isArray(manifest.cases) ||
    !manifest.cases.length ||
    manifest.cases.length > 20
  )
    throw Error("Manifest requires 1–20 cases.");
  const ids = new Set();
  const rows = [];
  for (const row of manifest.cases) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id))
      throw Error("Invalid/duplicate audio ID.");
    ids.add(row.id);
    if (row.syntheticContent !== true || row.consentToProcess !== true)
      throw Error(
        "Only consented recordings of fictional content are allowed.",
      );
    if (
      !["en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN"].includes(row.language) ||
      typeof row.reference !== "string" ||
      !row.reference.trim() ||
      row.reference.length > 2000
    )
      throw Error("Invalid language/reference.");
    if (typeof row.file !== "string" || isAbsolute(row.file))
      throw Error("Audio file must be relative to manifest.");
    const audioPath = await realpath(resolve(root, row.file));
    const rel = relative(root, audioPath);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw Error("Audio path escapes manifest directory.");
    const mime = mimes[extname(audioPath).toLowerCase()],
      info = await stat(audioPath);
    if (
      !mime ||
      !info.isFile() ||
      info.size === 0 ||
      info.size > 5 * 1024 * 1024
    )
      throw Error("Unsupported/oversized audio.");
    rows.push({ ...row, audioPath, mime, bytes: info.size });
  }
  return rows;
}
