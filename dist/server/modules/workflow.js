import { confirmationMatches } from "../translation-checks.js";
const transitions = {
  created: ["consented", "cancelled"],
  consented: ["transcribed", "cancelled", "failed"],
  transcribed: ["translated", "cancelled", "failed"],
  translated: ["translation_confirmed", "cancelled", "failed"],
  translation_confirmed: ["extracted", "cancelled", "failed"],
  extracted: ["clarifying", "awaiting_review", "failed", "cancelled"],
  clarifying: ["awaiting_review", "failed", "cancelled"],
  awaiting_review: ["approved", "failed", "cancelled"],
  approved: ["exported", "cancelled"],
  exported: ["cancelled"],
  failed: ["created"],
  cancelled: ["created"],
};
export class Workflow {
  constructor() {
    this.state = "created";
    this.revision = 0;
    this.history = ["created"];
    this.translationConfirmation = null;
  }
  confirmTranslation(record) {
    if (
      this.state !== "translated" ||
      !confirmationMatches(record, record?.original, record?.english)
    )
      throw Error("Read back and confirm the translation first.");
    this.translationConfirmation = structuredClone(record);
    this.move("translation_confirmed");
  }
  move(next) {
    if (!transitions[this.state]?.includes(next))
      throw Error(`Invalid transition: ${this.state} → ${next}`);
    this.state = next;
    this.history.push(next);
  }
  reset() {
    this.state = "created";
    this.revision++;
    this.history = ["created"];
    this.translationConfirmation = null;
  }
  accept(revision) {
    return revision === this.revision && this.state !== "cancelled";
  }
}
