// Roofing development-type category filters — empty by design.
//
// Roofing has no clean NSW development-type category: most roofing work is
// exempt/implicit and never surfaces as a named DA category (docs/25 §1.1), so
// the pack is vocabulary-only and relies on the tsvector rule pass + rerank for
// precision. This is exactly the recall gap that makes demolition (a named NSW
// development type) the stronger trade #2.
//
// The file exists so the pack's shape is uniform across trades and so a future
// audit can populate roofing categories here once per-application
// development-type persistence (#26) lands, without touching any code path.
export const ROOFING_DEVELOPMENT_TYPES: string[] = [];
