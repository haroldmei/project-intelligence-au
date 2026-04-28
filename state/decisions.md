# Decisions Log

> One-line ADRs. Format: `- [YYYY-MM-DD] <phase>: <decision> — because <reason>`

- [2026-04-28] ceo: market analysis complete — 5 open gaps — because preview tier; AI-relevance + price + AU public-data wedge candidate
- [2026-04-28] ceo: critic FAIL — 5 must-fix — because TAM/SAM/SOM math + incumbent pricing unsourced; AI-native unsubstantiated; wedge alternatives absent
- [2026-04-28] ceo: critic FAIL #2 — TAM chain + platitudes — because 4/5 must-fix resolved; TAM incumbent revenue lacks auditable multiplication chain
- [2026-04-28] ceo: PASS on revision 3 — because TAM chains now auditable; platitudes removed; evidence_quality=strong
- [2026-04-28] differentiation: wedge LOCKED — because Niche axis; Sydney roofing subbies; AUD 199/mo; ai_heavy+mobile_first stack flags
- [2026-04-28] differentiation: critic FAIL — weekend-copy test — because incumbent-disincentive argument doesn't block new entrants; need feedback-loop moat or distribution moat
- [2026-04-28] differentiation: PASS — Section 1.5b adds quantified feedback-loop moat — because evidence_quality=strong; LOCKED
- [2026-04-28] human_checkpoint_1: user CONFIRMED wedge — because Sydney roofing subbies, AUD 199/mo, ai_heavy+mobile_first locked
- [2026-04-28] tech-stack-selector: contract LOCKED — because Next15+Tailwind4 / Postgres+pgvector / Lucia / Anthropic+OpenAI / Vercel / Buildkite
- [2026-04-28] tech-stack-selector: PASS — strong evidence — because minor pin nice-to-haves deferred (Lucia, OpenAI embedding, promptfoo); not blocking
- [2026-04-28] product-spec: PASS — 1 critical flow, 3 supporting, 17 V2-tagged — because minor nice-to-haves on AC tightening; non-blocking
- [2026-04-28] analyst: SRS written — because 19 wedge-critical FRs / 11 supporting / 17 V2 / 17 NFRs / 12 open assumptions
- [2026-04-28] designer: PASS + surgical fixes — because model rename haiku=primary; cron 0 7 UTC = 17 AEST; fallback notif policy; auth rate-limit threat-model note
- [2026-04-28] ux-designer: design system + 10-step wireframes shipped — because slate-blue+amber palette avoids all 3 competitor slots; thumb-up/down single-tap is signature micro-interaction
- [2026-04-28] ux-designer-critic: PASS + 3 surgical fixes applied — because step numbering 1-4 of 4; all 12 cards render inline (not Load more); cancel-confirm AlertDialog wireframe added as §7.10b
- [2026-04-28] human_checkpoint_2: user CONFIRMED design target — because slate+amber palette, 10 wireframes + cancel-confirm, density rubric 6→8 after Load-more removed
- [2026-04-28] auth-engineer: Lucia + 8 routes + rate limiter + 04-dev-plan — because argon2id OTP; 5/min IP + 1/min account; tsc clean; email sends stubbed for Phase 6.9
- [2026-04-28] ai-features: RAG pipeline + 22-case eval + cost ledger — because haiku primary, sonnet fallback at confidence<0.5; cost cap AUD 0.13/wk degrades to keyword-only with banner
