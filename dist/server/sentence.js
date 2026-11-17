// One conservative source boundary policy shared by evidence and review rules.
// Protection is offset-preserving: returned text always comes from the source.
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const abbreviations =
  /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|mg|No)\.|\b(?:e\.g\.|i\.e\.|a\.m\.|p\.m\.)/gi;
export function segmentSentences(text) {
  if (typeof text !== "string") return [];
  const sentences = [];
  for (const line of text.split(/\r?\n/)) {
    const masked = line
      .replace(/(?<=\d)\.(?=\d)/g, "\uE000")
      .replace(abbreviations, (match) => match.replaceAll(".", "\uE000"));
    // Danda is a hard end even when Intl's English locale would not split it.
    const chunks = masked.match(/[^।]+।?|।/g) || [];
    let offset = 0;
    for (const chunk of chunks) {
      for (const span of segmenter.segment(chunk)) {
        const sentence = line
          .slice(offset + span.index, offset + span.index + span.segment.length)
          .trim();
        if (sentence) sentences.push(sentence);
      }
      offset += chunk.length;
    }
  }
  return sentences;
}
export function evidenceUnits(text, sourceId) {
  const sentences = segmentSentences(text);
  if (sourceId !== "clarifications" || typeof text !== "string")
    return sentences;
  // Only application-owned field prefixes may precede a complete answer.
  const answers = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(
          /^(?:concern|symptoms|duration|severity|medicines|allergies|history|questions|ambiguities):\s*/,
          "",
        )
        .trim(),
    )
    .filter(Boolean);
  return [...new Set([...sentences, ...answers])];
}
export const wholeEvidence = (quote, source, sourceId) =>
  typeof quote === "string" && evidenceUnits(source, sourceId).includes(quote);
