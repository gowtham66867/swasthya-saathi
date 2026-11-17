import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  rm,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadAudioManifest } from "../evals/audio-loader.mjs";
import { validateExtraction } from "../agent.js";
test("v3 frozen holdout integrity and label schema only", async () => {
  const bytes = await readFile(
    new URL("../evals/cases.v3.json", import.meta.url),
  );
  const frozen = JSON.parse(
    await readFile(new URL("../evals/cases.v3.freeze.json", import.meta.url)),
  );
  assert.equal(createHash("sha256").update(bytes).digest("hex"), frozen.sha256);
  for (const c of JSON.parse(bytes)) {
    assert.equal(c.split, "holdout");
    assert.deepEqual(
      validateExtraction(c.expected, {
        english: c.english,
        clarifications: "",
      }),
      [],
    );
  }
});
test("audio loader accepts local manifest and rejects consent, duplicate and path escape", async () => {
  const root = await mkdtemp(join(tmpdir(), "saathi-audio-"));
  try {
    await mkdir(join(root, "input"));
    await writeFile(
      join(root, "input", "fictional.wav"),
      "not a recording; loader test bytes only",
    );
    await writeFile(join(root, "outside.wav"), "test");
    const row = {
      id: "test",
      file: "fictional.wav",
      language: "te-IN",
      reference: "Fictional test",
      syntheticContent: true,
      consentToProcess: true,
    };
    const path = join(root, "input", "manifest.json");
    const save = (cases) => writeFile(path, JSON.stringify({ cases }));
    await save([row]);
    assert.equal((await loadAudioManifest(path))[0].mime, "audio/wav");
    for (const cases of [
      [{ ...row, consentToProcess: false }],
      [row, row],
      [{ ...row, file: "../outside.wav" }],
    ]) {
      await save(cases);
      await assert.rejects(loadAudioManifest(path));
    }
    await symlink(join(root, "outside.wav"), join(root, "input", "escape.wav"));
    await save([{ ...row, file: "escape.wav" }]);
    await assert.rejects(loadAudioManifest(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
