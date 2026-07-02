// Shared NSW ePlanning open-data API auth (issue #9).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// The Online DA / CDC / PCC Data APIs are all served by the SAME NSW ePlanning
// subscription on the NSW Azure API Management gateway. APIM authenticates the
// subscription key via the `Ocp-Apim-Subscription-Key` request header, so all
// three adapters (sources.ts, cdc.ts, pcc.ts) send it through this one helper —
// change the header once, everywhere, if the gateway convention ever moves.
//
// The subscription key is provisioned by email from the ePlanning team (human-
// owned), so every adapter no-ops without `NSW_PLANNING_API_KEY`.

/** The header the NSW ePlanning Azure APIM gateway reads the subscription key from. */
export const EPLANNING_SUBSCRIPTION_KEY_HEADER = "Ocp-Apim-Subscription-Key";

/** Build the auth headers for an authenticated ePlanning open-data API request. */
export function eplanningAuthHeaders(apiKey: string): Record<string, string> {
  return { [EPLANNING_SUBSCRIPTION_KEY_HEADER]: apiKey };
}
