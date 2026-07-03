import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ProjectIntelligence AU",
  description: "Privacy Policy for ProjectIntelligence AU Sydney roofing digest.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0A1E30] text-[#9FB3C8] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-[#627D98] text-sm">
            Last updated: April 2026 | Jurisdiction: Australia (NSW)
          </p>
        </div>

        {/* Content */}
        <article className="prose prose-invert max-w-none space-y-6 text-[#9FB3C8]">
          {/* 1. Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              1. Introduction
            </h2>
            {/* HUMAN INPUT REQUIRED (issue #96 B4): "00 000 000 000" is a
                placeholder ABN. Replace with the real registered ABN before
                launch — do not invent one. Also appears in the contact block
                below and in terms/page.tsx. */}
            <p>
              ProjectIntelligence AU (ABN 00 000 000 000, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is committed to protecting your privacy in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose and manage your personal information. By using our service, you consent to our collection and use of personal information as outlined in this policy.
            </p>
            <p>
              <strong>Contact for Privacy Matters:</strong>{" "}
              <a href="mailto:privacy@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                privacy@projectintelligence.com.au
              </a>
            </p>
          </section>

          {/* 2. Information We Collect (APP 5) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              2. Information We Collect (Australian Privacy Principle 5 — Notification)
            </h2>
            <p>
              We collect personal information directly from you and, in some cases, from third parties. The types of personal information we collect include:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Account data:</strong> email address, password hash, Australian mobile number (+61), name
              </li>
              <li>
                <strong>Business information:</strong> Australian Business Number (ABN), roofing licence number, trade type
              </li>
              <li>
                <strong>Subscription data:</strong> billing address, payment card details (processed via Stripe; we do not store card numbers), plan type, trial/active status
              </li>
              <li>
                <strong>Location data:</strong> Greater Sydney LGA preferences (your nominated service areas for digest filtering)
              </li>
              <li>
                <strong>Usage data:</strong> digest open/click events, feedback (thumbs up/down) on development applications, interaction timestamps
              </li>
              <li>
                <strong>Feedback data:</strong> your ratings (up/down) on each development application in your digest
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, device type, pages visited (via PostHog analytics if you consent)
              </li>
            </ul>
            <p className="mt-4">
              We do not require you to provide personal information to access our landing page. We only collect personal information when you create an account or use our service.
            </p>
          </section>

          {/* 3. How We Use Your Information (APP 6) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              3. How We Use Your Information (Australian Privacy Principle 6 — Use and Disclosure)
            </h2>
            <p>We use your personal information for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Service delivery:</strong> to create your account, deliver your Sunday digest, process your feedback, and provide customer support
              </li>
              <li>
                <strong>Billing:</strong> to process subscription payments, manage your trial and renewal, and issue invoices
              </li>
              <li>
                <strong>Communication:</strong> to send you digest emails, SMS alerts, account notifications, billing confirmations, and password reset links
              </li>
              <li>
                <strong>Improvement:</strong> to analyse digest accuracy, improve our relevance pipeline, and measure feature usage (with your consent for analytics)
              </li>
              <li>
                <strong>Legal compliance:</strong> to comply with Australian tax law, fraud prevention, and legal requests
              </li>
              <li>
                <strong>Marketing:</strong> to send you promotional emails about features or plans (you can opt out anytime)
              </li>
            </ul>
          </section>

          {/* 4. Third-Party Data Processors (APP 1 & 6) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              4. Third-Party Processors (Australian Privacy Principle 1 — Open and Transparent Management)
            </h2>
            <p>
              We share your personal information with the following service providers to deliver our service. Each processor is contractually bound to protect your data:
            </p>
            <table className="w-full mt-4 border border-[#102A43]">
              <thead className="bg-[#102A43]">
                <tr>
                  <th className="border border-[#102A43] px-3 py-2 text-left text-white">Service</th>
                  <th className="border border-[#102A43] px-3 py-2 text-left text-white">Data Received</th>
                  <th className="border border-[#102A43] px-3 py-2 text-left text-white">Purpose</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Stripe AU</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Card details, email, ABN</td>
                  <td className="border border-[#102A43] px-3 py-2">Billing, AUD/GST</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Resend</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Email, digest content</td>
                  <td className="border border-[#102A43] px-3 py-2">Email delivery</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Twilio</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Mobile number, SMS content</td>
                  <td className="border border-[#102A43] px-3 py-2">SMS delivery</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Anthropic (Claude)</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Anonymised DA descriptions, your LGA bundle</td>
                  <td className="border border-[#102A43] px-3 py-2">Relevance scoring AI</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>OpenAI</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Anonymised DA descriptions, roofing vocabulary</td>
                  <td className="border border-[#102A43] px-3 py-2">Embedding generation</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>PostHog</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Usage events, IP address</td>
                  <td className="border border-[#102A43] px-3 py-2">Analytics (consent-gated)</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Sentry</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Error logs, request headers</td>
                  <td className="border border-[#102A43] px-3 py-2">Error monitoring</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>GCP Cloud Storage</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Digest PDFs (if exported)</td>
                  <td className="border border-[#102A43] px-3 py-2">Blob storage</td>
                </tr>
                <tr>
                  <td className="border border-[#102A43] px-3 py-2"><strong>Vercel</strong></td>
                  <td className="border border-[#102A43] px-3 py-2">Your requests, analytics</td>
                  <td className="border border-[#102A43] px-3 py-2">Hosting and deployment</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 text-sm">
              These processors may be located outside Australia (USA, EU). By using our service, you consent to overseas disclosure. We require all processors to maintain security measures equivalent to the Privacy Act 1988{"."}
            </p>
          </section>

          {/* 5. Data Retention (APP 11 & 13) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              5. Data Retention and Deletion (Australian Privacy Principles 11 & 13 — Security & Correction)
            </h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Active accounts:</strong> Your email, password hash, LGA preferences, feedback, and digest history are retained while your account is active.
              </li>
              <li>
                <strong>Trial accounts:</strong> Trial data is deleted 30 days after trial expiration if not converted to a paid subscription.
              </li>
              <li>
                <strong>Cancelled subscriptions:</strong> Your account is marked as inactive; you retain read-only access to digest history for 30 days, then hard-deleted.
              </li>
              <li>
                <strong>Feedback data:</strong> Your thumbs ratings are retained as long as your account is active and used to improve your personalised ranking.
              </li>
              <li>
                <strong>Development Application records:</strong> We retain raw DA data (source: NSW Planning Portal, council feeds) indefinitely for historical queries; your feedback ratings are tied to DA IDs.
              </li>
              <li>
                <strong>Email/SMS logs:</strong> Delivery records from Resend and Twilio are retained for 90 days for compliance and support purposes.
              </li>
              <li>
                <strong>Backups:</strong> Deleted data may persist in backups for up to 30 days.
              </li>
            </ul>
          </section>

          {/* 6. Your Privacy Rights (APP 12) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              6. Your Privacy Rights (Australian Privacy Principle 12 — Access and Correction)
            </h2>
            <p>
              Under the Privacy Act 1988, you have the following rights:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Right to access:</strong> You can request a copy of all personal information we hold about you by clicking &ldquo;Download my data&rdquo; in your account settings, or emailing {" "}
                <a href="mailto:privacy@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                  privacy@projectintelligence.com.au
                </a>
                {". We will provide your data in JSON format within 14 days."}
              </li>
              <li>
                <strong>Right to correction:</strong> If your personal information is inaccurate, you can update your email, mobile number, and LGA preferences directly in your account settings.
              </li>
              <li>
                <strong>Right to deletion:</strong> You can request account deletion by clicking &ldquo;Delete account&rdquo; in your account settings. We will delete your data within 14 days (hard delete within 30 days of marked deletion).
              </li>
              <li>
                <strong>Right to complain:</strong> If you believe we have breached the Privacy Act 1988, you can lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at {" "}
                <a href="https://www.oaic.gov.au" className="text-[#D97706] hover:text-[#F59E0B]">
                  www.oaic.gov.au
                </a>
                {" "}or call 1300 363 992.
              </li>
            </ul>
          </section>

          {/* 7. Security (APP 11) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              7. Security (Australian Privacy Principle 11 — Security of Personal Information)
            </h2>
            <p>
              We implement reasonable security measures to protect your personal information:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Encryption:</strong> All data in transit uses TLS 1.2+. Passwords are hashed using argon2id. Payment cards are tokenised by Stripe.
              </li>
              <li>
                <strong>Database security:</strong> Postgres is hosted on Google Cloud SQL with encryption at rest and managed backups.
              </li>
              <li>
                <strong>Access control:</strong> Only authorised personnel can access your data. API endpoints require Lucia session authentication.
              </li>
              <li>
                <strong>Monitoring:</strong> We use Sentry error tracking and PostHog analytics to detect suspicious activity.
              </li>
            </ul>
            <p className="mt-4">
              No security system is impenetrable. We cannot guarantee absolute security, but we commit to industry-standard protections.
            </p>
          </section>

          {/* 8. Cookies and Tracking (APP 1) */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              8. Cookies and Tracking (Australian Privacy Principle 1 — Open and Transparent Management)
            </h2>
            <p>
              We use the following cookies and tracking technologies:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Essential cookies (no consent required):</strong> Lucia session cookie (httpOnly, SameSite=Lax) for authentication. Strictly necessary for service operation.
              </li>
              <li>
                <strong>Analytics cookies (consent required):</strong> PostHog SDK for feature usage, event tracking, and feature flags. You can opt out in your account settings or use the banner at first visit.
              </li>
              <li>
                <strong>Marketing cookies:</strong> Not used in V1.
              </li>
            </ul>
            <p className="mt-4">
              You can manage your cookie preferences by clicking the &ldquo;Manage Cookies&rdquo; button in the footer, or by clearing your browser cookies. Opting out of analytics will not affect your service usage.
            </p>
          </section>

          {/* 9. Policy Changes */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              9. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will notify you by email to the address on your account. Your continued use of the service constitutes acceptance of the updated policy. We recommend you review this policy periodically.
            </p>
          </section>

          {/* 10. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              10. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy or our privacy practices, please contact:
            </p>
            <div className="bg-[#102A43] rounded-lg p-4 mt-4 space-y-2">
              <p>
                <strong className="text-white">ProjectIntelligence AU</strong>
              </p>
              <p>
                Email:{" "}
                <a href="mailto:privacy@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                  privacy@projectintelligence.com.au
                </a>
              </p>
              {/* HUMAN INPUT REQUIRED (issue #96 B4): placeholder ABN — replace before launch. */}
              <p>ABN: 00 000 000 000</p>
              <p>Jurisdiction: New South Wales, Australia</p>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
