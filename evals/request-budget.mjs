// Local evaluation gate: reserve 60 paise before every outbound model request,
// including retries/errors. At most 25 requests fit the approved INR 15 budget.
// Reservation assumes <=40k input tokens and <=2200 output tokens at the checked
// INR 10/25 per-million rates, plus 20% tax/rounding headroom and margin.
export function createRequestBudget({
  limitPaise = 1500,
  reservePaise = 60,
} = {}) {
  let reservedPaise = 0,
    calls = 0;
  return {
    reserve(body) {
      const input = JSON.parse(body);
      if (
        input.model !== "sarvam-105b" ||
        input.max_tokens !== 2200 ||
        !Array.isArray(input.messages) ||
        Buffer.byteLength(JSON.stringify(input.messages), "utf8") > 12000
      )
        throw Error(
          "Evaluation payload exceeds conservative budget assumptions.",
        );
      if (reservedPaise + reservePaise > limitPaise) {
        const error = new Error(
          "Approved evaluation request budget exhausted.",
        );
        error.code = "budget";
        throw error;
      }
      reservedPaise += reservePaise;
      calls++;
    },
    snapshot() {
      return {
        approvedINR: limitPaise / 100,
        reservedINR: reservedPaise / 100,
        perRequestReserveINR: reservePaise / 100,
        calls,
        maxCalls: Math.floor(limitPaise / reservePaise),
        pricingSource: "https://docs.sarvam.ai/api/getting-started/pricing",
        pricingChecked: "2026-11-18",
        inputAllowanceTokens: 40000,
        outputLimitTokens: 2200,
        note: "Conservative per-request reservations include failed requests; actual charges are estimated separately from returned usage, not measured from account balance.",
      };
    },
  };
}
