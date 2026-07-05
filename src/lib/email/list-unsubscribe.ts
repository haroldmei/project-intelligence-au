// RFC-8058 one-click unsubscribe headers for BULK / marketing sends (issue #179).
//
// Kept in its own module (not email/client.ts) so the many tests that stub the
// network send with `vi.mock("@/lib/email/client")` still get the REAL header
// builder — a pure function with no side effects worth mocking.
//
// Gmail & Yahoo's Feb-2024 bulk-sender rules require these two headers so the
// inbox-native "Unsubscribe" affordance works with a single POST; without them a
// bulk email like the weekly digest is downgraded toward spam.

/**
 * Build the List-Unsubscribe / List-Unsubscribe-Post header pair.
 *
 * `url` MUST point at an endpoint that opts the user out ONLY on POST: the inbox
 * one-click sends `POST url` with body `List-Unsubscribe=One-Click`, and — just
 * as importantly — this keeps a corporate link-scanner's automated GET (Outlook
 * SafeLinks, Mimecast, Gmail proxy) from silently unsubscribing the subscriber.
 */
export function buildListUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
