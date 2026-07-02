// Feedback Zod schemas — reused by both portal POST and HMAC GET handlers.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
import { z } from "zod";

/** Portal POST /api/feedback body */
export const PortalFeedbackInput = z.object({
  da_id: z.string().min(1),
  feedback: z.enum(["up", "down", "remove"]),
});
export type PortalFeedbackInput = z.infer<typeof PortalFeedbackInput>;
