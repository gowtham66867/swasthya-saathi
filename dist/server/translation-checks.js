// Coarse comparison only: a flag requests human review, never repairs a translation.
const digitStarts = [0x30, 0x660, 0x6f0, 0x966, 0xbe6, 0xc66, 0xce6];
const asciiDigits = (text) =>
  [...text]
    .map((c) => {
      const code = c.codePointAt(0);
      const start = digitStarts.find((s) => code >= s && code <= s + 9);
      return start === undefined ? c : String(code - start);
    })
    .join("");
const units = [
  [
    "mg",
    /\bmg\b|milligrams?|मिलीग्राम|மில்லிகிராம்|మిల్లీగ్రా(?:ము)?|ಮಿಲಿಗ್ರಾಂ/giu,
  ],
  [
    "mcg",
    /\bmcg\b|micrograms?|माइक्रोग्राम|மைக்ரோகிராம்|మైక్రోగ్రామ్|ಮೈಕ್ರೋಗ್ರಾಂ/giu,
  ],
  [
    "ml",
    /\bml\b|millilit(?:er|re)s?|मिलीलीटर|மில்லிலிட்டர்|మిల్లీలీటర్|ಮಿಲಿಲೀಟರ್/giu,
  ],
  [
    "g",
    /\bg\b|\bgrams?\b|(?:^|\s)ग्राम|(?:^|\s)கிராம்|(?:^|\s)గ్రాము|(?:^|\s)ಗ್ರಾಂ/giu,
  ],
];
const negative =
  /\b(?:no|not|never|without|don't|doesn't|denies)\b|नहीं|नही|இல்லை|இல்லாத|లేదు|లేవు|కాదు|ಇಲ್ಲ|ಅಲ್ಲ/giu;
const sorted = (values) => values.sort().join("|");
export function translationSignals(original, english) {
  const signals = [];
  if (typeof original !== "string" || typeof english !== "string")
    return signals;
  const flag = (kind, text) =>
    signals.push({
      kind: "translation-" + kind,
      sourceId: "original",
      quote: original,
      text,
    });
  const numbers = (s) => asciiDigits(s).match(/\d+(?:\.\d+)?/g) || [];
  if (sorted(numbers(original)) !== sorted(numbers(english)))
    flag(
      "numbers",
      "Number mismatch between original and English. Confirm each quantity with the patient.",
    );
  const unitList = (s) =>
    units.flatMap(([unit, pattern]) =>
      [...s.matchAll(pattern)].map(() => unit),
    );
  if (sorted(unitList(original)) !== sorted(unitList(english)))
    flag(
      "units",
      "Unit marker mismatch. Do not assume unit conversion or equivalence.",
    );
  if (
    (original.match(negative) || []).length !==
    (english.match(negative) || []).length
  )
    flag(
      "negation",
      "Negation marker mismatch. Review denial scope with the patient.",
    );
  return signals;
}
export function confirmationMatches(record, original, english) {
  return Boolean(
    record?.confirmed &&
      record.original === original &&
      record.english === english &&
      record.backTranslation?.trim() &&
      record.readAloud === true &&
      record.confirmedAt,
  );
}
