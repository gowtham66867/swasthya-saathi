// Deterministic heuristics, not a language or clinical classifier.
// Non-English patterns are author-written; fluent-speaker review is pending.
export const PATTERN_REVIEW_STATUS =
  "hi/ta/te/kn author-written; pending fluent-speaker review";
export const RULE_PATTERNS = {
  instruction: [
    /\b(?:ignore|disregard|forget)\b.{0,45}\b(?:previous|above|prior|earlier)\b/i,
    /\b(?:system prompt|system instruction|act as|you must now|reveal (?:the |your )?(?:prompt|system)|override (?:the |your )|you are now)\b/i,
    /\b(?:(?:please |you (?:must |should )?|assistant[, ]+)(?:prescribe|diagnose)\b|(?:prescribe|diagnose)\b.{0,35}\b(?:for me|antibiotics|opioids|me now))/i,
    /(?:पिछले|पिछली|ऊपर|पहले).{0,35}(?:निर्देश|बात).{0,25}(?:अनदेखा|भूल|नज़रअंदाज़)|(?:सिस्टम प्रॉम्प्ट|डॉक्टर बनकर|तुम अब)/u,
    /(?:முந்தைய|மேலே).{0,45}(?:அறிவுறுத்தல்|வழிமுறை).{0,25}(?:புறக்கணி|மறந்து)|சிஸ்டம் ப்ராம்ப்ட்/u,
    /(?:మునుపటి|పై).{0,35}సూచన.{0,30}(?:పట్టించుకో|విస్మరించు|మర్చిపో)|సిస్టమ్ ప్రాంప్ట్/u,
    /(?:ಹಿಂದಿನ|ಮೇಲಿನ).{0,35}ಸೂಚನೆ.{0,30}(?:ನಿರ್ಲಕ್ಷಿ|ಮರೆತು)|ಸಿಸ್ಟಮ್ ಪ್ರಾಂಪ್ಟ್/u,
  ],
  uncertainty: [
    /\b(?:not sure|do not remember|cannot remember|do not know|don't know|unsure)\b/i,
    /(?:नहीं पता|याद नहीं|निश्चित नहीं)/u,
    /(?:தெரியவில்லை|நினைவில்லை|உறுதியாகத் தெரியாது)/u,
    /(?:తెలియదు|గుర్తులేదు|ఖచ్చితంగా తెలియదు)/u,
    /(?:ಗೊತ್ತಿಲ್ಲ|ನೆನಪಿಲ್ಲ|ಖಚಿತವಿಲ್ಲ)/u,
  ],
  correction: [
    /\b(?:actually|correction\s*:|I meant)\b/i,
    /(?:दरअसल|सुधार\s*:|मेरा मतलब)/u,
    /(?:உண்மையில்|திருத்தம்|நான் சொன்னது)/u,
    /(?:నిజానికి|సవరణ|నా ఉద్దేశం)/u,
    /(?:ವಾಸ್ತವವಾಗಿ|ತಿದ್ದುಪಡಿ|ನನ್ನ ಅರ್ಥ)/u,
  ],
  family: [
    /\b(?:my (?:mother|father|sister|brother|grandmother|grandfather|grandparents|spouse|wife|husband|son|daughter|uncle|aunt)|runs in my family)\b/i,
    /(?:मेरी माँ|मेरी मां|मेरे पिता|मेरे परिवार|मेरी पत्नी|मेरे पति|मेरी बेटी|मेरा बेटा|मेरी दादी|मेरे दादा)/u,
    /(?:என் அம்மா|என் அப்பா|என் குடும்ப|என் கணவர்|என் மனைவி|என் மகள்|என் மகன்)/u,
    /(?:మా అమ్మ|మా నాన్న|మా కుటుంబ|నా భర్త|నా భార్య|నా కుమార్తె|నా కుమారుడు)/u,
    /(?:ನನ್ನ ತಾಯಿ|ನನ್ನ ತಂದೆ|ನಮ್ಮ ಕುಟುಂಬ|ನನ್ನ ಪತಿ|ನನ್ನ ಪತ್ನಿ|ನನ್ನ ಮಗಳು|ನನ್ನ ಮಗ)/u,
  ],
};
export const matchesRule = (kind, quote) =>
  RULE_PATTERNS[kind].some((pattern) => pattern.test(quote));
export const instructionLike = (quote) =>
  typeof quote === "string" && matchesRule("instruction", quote);
// Quoted/reported medical advice stays visible even if it contains trigger words.
export const reportedInstruction = (quote) =>
  /\b(?:my (?:doctor|clinician|nurse)|the doctor)\b.{0,50}\b(?:told|said|advised|asked)\b/i.test(
    quote,
  ) ||
  /(?:डॉक्टर ने|மருத்துவர் சொன்னார்|వైద్యుడు చెప్పారు|ವೈದ್ಯರು ಹೇಳಿದರು)/u.test(
    quote,
  );
export const reportedAdvice = (quote) =>
  reportedInstruction(quote) &&
  /ignore|disregard|prescrib|diagnos|अनदेखा|புறக்கணி|పట్టించుకో|ನಿರ್ಲಕ್ಷಿ/iu.test(
    quote,
  );
export const excludeInstruction = (quote) =>
  instructionLike(quote) && !reportedInstruction(quote);
