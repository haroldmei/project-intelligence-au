// Vertical packs — public surface. The registry resolves a pack by id (slug);
// types holds the pack contract + pure tsquery/vocabulary helpers; rerank-prompt
// composes the trade-specific system prompt. Consumers (filters.ts, rerank.ts)
// import from here rather than reaching into individual modules.
export type { VerticalPack, VerticalVocabulary } from "./types";
export { keywordsToTsQuery, packTsQuery, matchesVocabulary } from "./types";
export {
  getActivePacks,
  getPack,
  getRegisteredPack,
  isFlagEnabled,
  registeredSlugs,
} from "./registry";
export { composeRerankSystemPrompt } from "./rerank-prompt";
