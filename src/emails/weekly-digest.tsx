import {
  toLeadClass,
  LEAD_CLASS_META,
  LEAD_CLASS_GROUP_ORDER,
  type LeadClass,
} from "@/modules/relevance/lead-class";
import { DA_SOURCE_ATTRIBUTION, DA_SOURCE_LICENCE } from "@/lib/attribution";

interface DACard {
  id: string;
  address: string;
  lga: string;
  value?: string;
  why: string;
  scope: string;
  applicant: string;
  relevanceScore: number; // 0-10
  // Honest lead class (issue #14). Optional so pre-#14 callers still typecheck;
  // absent → the ambiguous fallback (builder pipeline).
  leadClass?: LeadClass;
  // ISO yyyy-mm-dd a Construction Certificate was issued against this DA (issue
  // #13), or absent. Present → the "CC issued — work starting" badge renders.
  constructionCertifiedAt?: string | null;
  portalUrl: string;
  thumbUpUrl: string;
  thumbDownUrl: string;
}

// Inline badge palette per class — email clients strip <style>, so the hues
// are inlined here. Mirrors the Tailwind variants in src/components/ui/badge.tsx.
const LEAD_CLASS_EMAIL_STYLE: Record<
  LeadClass,
  { bg: string; fg: string; border: string }
> = {
  fast_track: { bg: "#E0F2FE", fg: "#0C4A6E", border: "#BAE6FD" },
  strata_heritage: { bg: "#F3E8FF", fg: "#6B21A8", border: "#E9D5FF" },
  builder_pipeline: { bg: "#E2E8F0", fg: "#334155", border: "#CBD5E1" },
};

function leadClassBadgeHtml(leadClass: LeadClass): string {
  const s = LEAD_CLASS_EMAIL_STYLE[leadClass];
  const label = escapeHtml(LEAD_CLASS_META[leadClass].label);
  return `<span style="display: inline-block; padding: 4px 8px; margin-left: 6px; background-color: ${s.bg}; color: ${s.fg}; border: 1px solid ${s.border}; border-radius: 4px; font-weight: 500;">${label}</span>`;
}

const CC_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a yyyy-mm-dd date as "1 Jun 2026" without `Date` (a bare
 * `new Date("2026-06-01")` is UTC midnight and can shift a day in AEST). Mirrors
 * the portal ConstructionCertBadge so the email and portal read identically.
 */
function formatCcDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, year, month, day] = m;
  return `${Number(day)} ${CC_MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/**
 * The "CC issued — work starting" badge (issue #13), inlined green ("go") so it
 * survives email clients that strip <style>. Mirrors the `success` Badge variant.
 */
function ccBadgeHtml(isoDate: string): string {
  const label = escapeHtml(`CC issued ${formatCcDate(isoDate)} — work starting`);
  return `<span style="display: inline-block; padding: 4px 8px; margin-left: 6px; background-color: #DCFCE7; color: #14532D; border-radius: 4px; font-weight: 500;">${label}</span>`;
}

function leadClassGroupHeaderHtml(leadClass: LeadClass): string {
  const meta = LEAD_CLASS_META[leadClass];
  const s = LEAD_CLASS_EMAIL_STYLE[leadClass];
  return `
  <tr>
    <td style="padding: 4px 0 8px 0;">
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: ${s.fg}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(meta.label)}</p>
      <p style="margin: 2px 0 0 0; font-size: 12px; color: #829AB1;">${escapeHtml(meta.blurb)}</p>
    </td>
  </tr>
`;
}

/**
 * Escape user-controlled strings before interpolating into the email HTML.
 * `address`, `scope`, `applicant`, `why`, `lga`, `value` originate from
 * council DA portals (untrusted) and the LLM rerank output (could echo
 * prompt-injection content). Email clients sandbox JS, but unescaped HTML
 * still allows link spoofing, hidden tracking pixels, and content injection.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function WeeklyDigestTemplate(props: {
  weekStart: string;
  leadCount: number;
  lgas: string[];
  cards: DACard[];
  // FR-010 quiet week (issue #58): count of DAs the pipeline actually scanned
  // this week. Rendered in the reassurance message when leadCount === 0 so a
  // no-lead week reads as "we looked, nothing strong" rather than a broken
  // "0 leads" email. Optional so pre-#58 callers still typecheck; absent → 0.
  dasChecked?: number;
  // Trailing-window rated-lead recap (issue #186): the user's own on-target rate
  // over the leads they rated — NOT FR-013 ground-truth precision, so it is never
  // labelled "precision". onTarget = 👍 count (N), rated = 👍+👎 count (M).
  ratedLeadRecap?: { onTarget: number; rated: number; rate: number; weeks: number };
  smsEnabled: boolean;
  fallbackUsed?: boolean;
  // One-time note the week a user's thumbs personalisation activates (FR-025,
  // ≥25 feedback rows). Sent once, then suppressed via User.personalisationNotifiedAt.
  personalisationActivated?: boolean;
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const { weekStart, leadCount, lgas, cards, dasChecked, ratedLeadRecap, smsEnabled, fallbackUsed, personalisationActivated, unsubscribeUrl } = props;
  // Spam Act 2003: a functional, no-login unsubscribe in every commercial email.
  // Falls back to the account page if a caller omits the token URL.
  const unsubHref = unsubscribeUrl ?? "/account";

  // FR-010 quiet-week branch (issue #58): a week where nothing scored into the
  // digest must still reassure — "we checked N DAs across your areas" — instead
  // of the trust-eroding empty "0 leads" digest. leadCount === 0 ⟺ no cards.
  const isQuietWeek = leadCount === 0;
  const areasLabel = lgas.join(" + ");
  const checkedCount = dasChecked ?? 0;
  const daWord = checkedCount === 1 ? "DA" : "DAs";

  // Relevance pip: 1-5 dots filled left-to-right, mapped from 0-10 score
  const getPips = (score: number): string => {
    const pips = Math.min(5, Math.max(1, Math.round((score / 10) * 5)));
    return Array(5)
      .fill(0)
      .map((_, i) => (i < pips ? "●" : "○"))
      .join("");
  };

  const renderCard = (card: DACard): string => `
  <tr>
    <td style="padding: 0;">
      <table style="width: 100%; border: 1px solid #E5E5E5; border-radius: 6px; overflow: hidden;">
        <tbody>
          <!-- Card header: LGA + relevance pips -->
          <tr>
            <td style="padding: 12px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 12px; color: #627D98;">
                    <span style="display: inline-block; padding: 4px 8px; background-color: #FEF3C7; color: #78350F; border-radius: 4px; font-weight: 500;">${escapeHtml(card.lga)}</span>${leadClassBadgeHtml(toLeadClass(card.leadClass))}${card.constructionCertifiedAt ? ccBadgeHtml(card.constructionCertifiedAt) : ""}
                  </td>
                  <td style="text-align: right; font-size: 12px; color: #627D98; letter-spacing: 2px;">${getPips(card.relevanceScore)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Address (text-lg weight) -->
          <tr>
            <td style="padding: 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 18px; font-weight: 500; color: #1E3A5F; line-height: 1.4;">${escapeHtml(card.address)}</p>
            </td>
          </tr>

          <!-- Value -->
          ${
            card.value
              ? `
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; color: #627D98;">Est. ${escapeHtml(card.value)}</p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Why (italic) -->
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; font-style: italic; color: #829AB1;">"${escapeHtml(card.why)}"</p>
            </td>
          </tr>

          <!-- Scope -->
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #404040;">${escapeHtml(card.scope)}</p>
            </td>
          </tr>

          <!-- Applicant: only render if non-empty (DAEX records have null
               applicant, would render as "Applicant: " with no name). -->
          ${
            card.applicant && card.applicant.trim()
              ? `
          <tr>
            <td style="padding: 8px 16px; background-color: #FFFFFF; border-bottom: 1px solid #F0F4F8;">
              <p style="margin: 0; font-size: 12px; color: #A3A3A3;">Applicant: ${escapeHtml(card.applicant)}</p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Footer row: View DA link + thumb buttons -->
          <tr>
            <td style="padding: 12px 16px; background-color: #F0F4F8;">
              <table style="width: 100%;">
                <tr>
                  <td>
                    <a href="${card.portalUrl}" style="color: #1E3A5F; text-decoration: none; font-size: 14px; font-weight: 600;">View DA →</a>
                  </td>
                  <td style="text-align: right;">
                    <!-- Thumb buttons: 44×44px link with HMAC-signed token -->
                    <a href="${card.thumbUpUrl}" style="display: inline-block; width: 44px; height: 44px; line-height: 44px; text-align: center; margin-right: 8px; text-decoration: none; font-size: 18px;" title="Thumb up">👍</a>
                    <a href="${card.thumbDownUrl}" style="display: inline-block; width: 44px; height: 44px; line-height: 44px; text-align: center; text-decoration: none; font-size: 18px;" title="Thumb down">👎</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>
  <tr><td style="height: 12px;"></td></tr>
`;

  // Group cards by lead class (issue #14): fast-track, then strata & heritage,
  // then builder pipeline — rank order preserved within each group. A subtle
  // section header introduces each non-empty group.
  const coerced = cards.map((c) => ({ ...c, leadClass: toLeadClass(c.leadClass) }));
  const cardHtml = LEAD_CLASS_GROUP_ORDER.map((leadClass) => {
    // Cards arrive in rank order; filtering preserves it within each group.
    const group = coerced.filter((c) => c.leadClass === leadClass);
    if (group.length === 0) return "";
    return leadClassGroupHeaderHtml(leadClass) + group.map(renderCard).join("");
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #FAFAFA;">
  <table style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tbody>
      <!-- Header -->
      <tr>
        <td style="padding: 24px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #1E3A5F;">ProjectIntelligence</h1>
        </td>
      </tr>

      <!-- Digest header: week date, lead count, LGAs -->
      <tr>
        <td style="padding: 24px 16px; background-color: #FFFFFF; border-bottom: 1px solid #E5E5E5;">
          <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #1E3A5F;">Your Sydney Roofing Digest</h2>
          <p style="margin: 0 0 4px 0; font-size: 14px; color: #627D98;">Week of ${weekStart}</p>
          <p style="margin: 0; font-size: 14px; color: #627D98; font-weight: 600;">${isQuietWeek ? escapeHtml(areasLabel) : `${leadCount} leads · ${escapeHtml(areasLabel)}`}</p>
        </td>
      </tr>

      <!-- Rated-lead recap proof (week 4+, issue #186), or the <4-week onboarding
           nudge before there's enough signal to be honest (CF-1.7, design pillar
           P4). This is the user's own on-target rate over the leads they rated,
           not a ground-truth score. Mirrors the portal header: the badge whenever
           we have a stat, otherwise the same "tap 👍/👎" tip so both surfaces stay
           in lockstep. Suppressed on a quiet week — the no-lead reassurance below
           carries that week instead. -->
      ${
        ratedLeadRecap
          ? `
      <tr>
        <td style="padding: 0 16px;">
          <table style="margin: 12px 0; width: 100%; border: 1px solid #FEF3C7; background-color: #FFFBEB; border-radius: 6px;">
            <tr>
              <td style="padding: 12px 16px; font-size: 14px; color: #78350F; font-weight: 600;">
                ✓ Last ${ratedLeadRecap.weeks} weeks: you marked ${ratedLeadRecap.onTarget} of ${ratedLeadRecap.rated} rated leads on-target (${ratedLeadRecap.rate}%)
              </td>
            </tr>
          </table>
        </td>
      </tr>
      `
          : !isQuietWeek
            ? `
      <tr>
        <td style="padding: 0 16px;">
          <p style="margin: 12px 0 0 0; font-size: 13px; color: #829AB1;">
            Your lead recap unlocks after 4 weeks — tap 👍 or 👎 on each lead to teach your digest.
          </p>
        </td>
      </tr>
      `
            : ""
      }

      ${
        fallbackUsed
          ? `
      <!-- Fallback indicator: weekly cost cap hit, embedding-only ranking -->
      <tr>
        <td style="padding: 8px 16px; background-color: #FFFBEB;">
          <p style="margin: 0; font-size: 12px; color: #78350F;">
            ⚠ Embedding-only ranking this week (AI cost cap reached).
            Cards may be less relevance-filtered than usual.
          </p>
        </td>
      </tr>
      `
          : ""
      }

      ${
        personalisationActivated
          ? `
      <!-- One-time personalisation-on note (FR-025): the user has rated enough
           leads that their 👍/👎 now shape the ranking. Sent once. -->
      <tr>
        <td style="padding: 0 16px;">
          <table style="margin: 12px 0; width: 100%; border: 1px solid #C6F6D5; background-color: #F0FFF4; border-radius: 6px;">
            <tr>
              <td style="padding: 12px 16px; font-size: 14px; color: #22543D;">
                🎯 <strong>Your digest is now personalised.</strong> You&apos;ve rated enough leads that we now tune each week&apos;s ranking to your 👍/👎. Keep rating to sharpen it further.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      `
          : ""
      }

      ${
        isQuietWeek
          ? `
      <!-- FR-010 quiet week (issue #58): reassurance instead of an empty card table -->
      <tr>
        <td style="padding: 16px;">
          <table style="width: 100%; border: 1px solid #E5E5E5; border-radius: 6px;">
            <tbody>
              <tr>
                <td style="padding: 24px 16px; background-color: #FFFFFF;">
                  <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1E3A5F;">No strong re-roof leads this week</p>
                  <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #627D98;">We checked ${checkedCount} ${daWord} across your ${escapeHtml(areasLabel)} and none scored high enough to be worth your time. We'll keep watching — your next digest lands Sunday.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
      `
          : `
      <!-- DA cards -->
      <tr>
        <td style="padding: 16px;">
          <table style="width: 100%;">
            <tbody>
              ${cardHtml}
            </tbody>
          </table>
        </td>
      </tr>
      `
      }

      <!-- End of digest divider -->
      <tr>
        <td style="padding: 24px 16px; text-align: center; color: #829AB1; font-size: 12px;">
          ${isQuietWeek ? `— We checked ${checkedCount} ${daWord} · no strong leads this week —` : `— End of digest · ${leadCount} leads —`}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 24px 16px; background-color: #F0F4F8; border-top: 1px solid #E5E5E5; font-size: 12px; color: #627D98;">
          <p style="margin: 0 0 8px 0;">ProjectIntelligence AU Pty Ltd</p>
          <p style="margin: 0 0 8px 0;">Level 1, 123 Business Street, Sydney NSW 2000 AU</p>
          ${smsEnabled ? '<p style="margin: 0 0 8px 0;">Reply STOP to any SMS to unsubscribe.</p>' : ""}
          <p style="margin: 0 0 8px 0;">
            <a href="${unsubHref}" style="color: #1E3A5F; text-decoration: underline;">Unsubscribe from these emails</a>
          </p>
          <!-- CC-BY attribution: required wherever NSW DA source data is surfaced. -->
          <p style="margin: 0; font-size: 11px; color: #829AB1;">DA data: ${escapeHtml(DA_SOURCE_ATTRIBUTION)}, licensed ${escapeHtml(DA_SOURCE_LICENCE)}.</p>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  return {
    subject: isQuietWeek
      ? `Your Sydney Roofing Digest — we checked ${checkedCount} ${daWord}, no strong leads this week`
      : `Your Sydney Roofing Digest — ${leadCount} leads this week`,
    html,
  };
}
