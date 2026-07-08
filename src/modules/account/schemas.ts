// Account module Zod schemas.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
import { z } from "zod";

export const UpdateProfileInput = z.object({
  // Tri-state: a valid E.164 string sets the number, `null` explicitly removes
  // it, and omitting the key leaves it untouched. Nullable (not just optional)
  // is what lets a user clear their mobile — otherwise an empty submit is
  // indistinguishable from "no change" and silently no-ops (#166).
  mobile_e164: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Must be E.164 format e.g. +61400000000")
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const UpdateLgaBundlesInput = z.object({
  bundle_ids: z.array(z.string().min(1)).min(1).max(15),
});
export type UpdateLgaBundlesInput = z.infer<typeof UpdateLgaBundlesInput>;

export const UpdateSavedQueryInput = z.object({
  saved_query_text: z.string().min(5).max(500),
});
export type UpdateSavedQueryInput = z.infer<typeof UpdateSavedQueryInput>;

// Per-user storm-brief opt-out toggle (#20).
export const StormBriefOptInInput = z.object({
  optIn: z.boolean(),
});
export type StormBriefOptInInput = z.infer<typeof StormBriefOptInInput>;
