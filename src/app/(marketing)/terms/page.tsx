import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — ProjectIntelligence AU",
  description: "Terms of Service for ProjectIntelligence AU Sydney roofing digest.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0A1E30] text-[#9FB3C8] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-[#627D98] text-sm">
            Last updated: April 2026 | Jurisdiction: NSW, Australia
          </p>
        </div>

        {/* Content */}
        <article className="prose prose-invert max-w-none space-y-6 text-[#9FB3C8]">
          {/* 1. Acceptance */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, registering for, or using ProjectIntelligence AU (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, do not use the Service.
            </p>
            <p>
              We may update these Terms at any time. Continued use of the Service after updates constitutes acceptance. We recommend you review these Terms periodically.
            </p>
          </section>

          {/* 2. Eligibility */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              2. Eligibility
            </h2>
            <p>To use the Service, you must be:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>At least 18 years old</li>
              <li>A registered Australian Business (ABN) or sole trader with a roofing licence (Class RT or Roof Plumber)</li>
              <li>Located in Greater Sydney (service area: 15 designated LGAs)</li>
              <li>Able to enter into a legally binding contract</li>
            </ul>
            <p className="mt-4">
              Users located outside Greater Sydney or in other trades are not permitted in V1 and will be placed on a waitlist.
            </p>
          </section>

          {/* 3. Account Registration and Responsibilities */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              3. Account Registration and Your Responsibilities
            </h2>
            <p>When you register, you must:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Provide accurate, current, and complete information (email, mobile, ABN, licence number)</li>
              <li>Maintain the confidentiality of your password</li>
              <li>Notify us immediately of any unauthorised use of your account</li>
              <li>Ensure only you access your account; you are liable for all activities under your account</li>
              <li>Keep your email and mobile number updated for digest delivery and account communications</li>
            </ul>
            <p className="mt-4">
              We reserve the right to suspend or terminate your account if we believe your information is false or fraudulent.
            </p>
          </section>

          {/* 4. Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              4. Acceptable Use Policy
            </h2>
            <p>You agree NOT to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Scrape or export:</strong> Extract, republish, or resell digest content, development application data, or relevance scores for commercial purposes
              </li>
              <li>
                <strong>Reverse engineer:</strong> Attempt to discover, reproduce, or circumvent the relevance pipeline or AI models
              </li>
              <li>
                <strong>Automate:</strong> Use bots, scripts, or automated tools to access the Service without written permission
              </li>
              <li>
                <strong>Spam:</strong> Send unsolicited emails, SMS, or contact roofing applicants via information in the digest for pyramid schemes, unsolicited sales, or harassment
              </li>
              <li>
                <strong>Impersonate:</strong> Use another user&apos;s account or misrepresent your identity
              </li>
              <li>
                <strong>Interfere:</strong> Disrupt, overload, or attempt to compromise the Service infrastructure
              </li>
              <li>
                <strong>Violate law:</strong> Use the Service to conduct illegal activity, fraud, or harassment
              </li>
            </ul>
            <p className="mt-4">
              Violations may result in account suspension or termination without refund. We log all usage and monitor for abuse.
            </p>
          </section>

          {/* 5. Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              5. Intellectual Property
            </h2>
            <p>
              <strong>Our IP:</strong> All platform content, UI design, ranking algorithms, email templates, and trademarks are owned by ProjectIntelligence AU or our licensors. You may not reproduce, distribute, or modify our intellectual property without permission.
            </p>
            <p className="mt-4">
              <strong>Your feedback:</strong> Your thumbs-up/down feedback and account data remain yours. By providing feedback, you grant us a non-exclusive, royalty-free license to use it to improve the Service.
            </p>
            <p className="mt-4">
              <strong>Development Application data:</strong> All DA data (address, description, applicant name, portal links) originates from public NSW Planning Portal and council feeds. We do not claim ownership; we facilitate access with our relevance layer.
            </p>
          </section>

          {/* 6. Third-Party Data and Links */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              6. Third-Party Data and External Links
            </h2>
            <p>
              <strong>Source data:</strong> Development applications are sourced from the NSW Planning Portal Online DA Service and local council APIs, which are public resources. We are a facilitator, not a data owner.
            </p>
            <p className="mt-4">
              <strong>Portal links:</strong> Digest emails include direct links to council DA portals (e.g., Penrith Council, Blacktown Council). We are not responsible for the content, accuracy, or availability of third-party portals.
            </p>
            <p className="mt-4">
              <strong>AI limitations:</strong> Our relevance pipeline uses AI models to filter and rank DAs. The &ldquo;why this matched&rdquo; explanations are AI-generated and may contain errors. You should verify DA details by visiting the source council portal.
            </p>
          </section>

          {/* 7. Payment and Billing */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              7. Payment, Billing, and Subscription Terms
            </h2>
            <p>
              <strong>Pricing:</strong> Solo plan: AUD 99/month, GST included. Prices displayed at checkout match what is charged.
            </p>
            <p className="mt-4">
              <strong>Trial:</strong> New accounts start with a 28-day full-access trial at no charge. No payment is required during the trial. On day 29, if you have not cancelled, your saved card is charged AUD 99 (Solo, GST included) for the first month.
            </p>
            <p className="mt-4">
              <strong>No free tier:</strong> After the trial, the Service is not available at zero cost. Trial is the entry point; there is no perpetual free tier.
            </p>
            <p className="mt-4">
              <strong>Billing:</strong> Subscription renews automatically each month. Billing is processed by Stripe AU. Charges appear on your card statement as &ldquo;ProjectIntelligence AU.&rdquo;
            </p>
            <p className="mt-4">
              <strong>Cancellation and refunds:</strong> You can cancel your subscription anytime from Account → Subscription → Cancel. Cancellation is effective immediately; you retain read-only access to digest history until your paid period ends. No refunds are issued for partial months. On day 29 of cancellation, your account and all data are permanently deleted.
            </p>
            <p className="mt-4">
              <strong>Failed payment:</strong> If your card is declined, we will attempt to re-charge on the next billing date. After 3 failed attempts, your subscription is marked past_due and access is suspended. Contact support to update your payment method.
            </p>
          </section>

          {/* 8. Service Availability and Uptime */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              8. Service Availability
            </h2>
            <p>
              We aim to deliver your Sunday 6 pm AEST digest reliably. However, we do not guarantee 100% uptime or uninterrupted access. Service may be unavailable due to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Planned maintenance</li>
              <li>Third-party service failures (Stripe, Resend, Twilio, AWS, GCP)</li>
              <li>Data source API outages (NSW Planning Portal, council feeds)</li>
              <li>Network issues or natural disasters</li>
            </ul>
            <p className="mt-4">
              We will attempt to restore service as quickly as possible. In the event of extended outage ({`>`} 24 hours), we may issue account credits at our discretion.
            </p>
          </section>

          {/* 9. Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              9. Limitation of Liability
            </h2>
            <p>
              <strong>As-is service:</strong> The Service is provided &ldquo;as is&rdquo; without warranties. We do not warrant that the Service will be error-free, uninterrupted, or fit for a particular purpose.
            </p>
            <p className="mt-4">
              <strong>No liability for:</strong> We are not liable for:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Inaccuracy or incompleteness of DA data sourced from third parties</li>
              <li>Missed development applications not appearing in your digest</li>
              <li>False positives or false negatives from the relevance pipeline</li>
              <li>Loss of business, revenue, or profit from using the Service</li>
              <li>Data loss, breaches, or unauthorised access due to factors beyond our control</li>
              <li>Third-party service failures (Stripe, Resend, Twilio, AWS, GCP)</li>
            </ul>
            <p className="mt-4">
              <strong>Capped liability:</strong> In no event shall ProjectIntelligence AU be liable for indirect, incidental, special, or consequential damages. Our total liability is capped at the amount you paid in the 12 months prior to the claim.
            </p>
            <p className="mt-4">
              <strong>Indemnification:</strong> You agree to indemnify and hold harmless ProjectIntelligence AU from any claims arising from your misuse of the Service, violation of these Terms, or violation of applicable laws.
            </p>
          </section>

          {/* 10. Dispute Resolution */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              10. Dispute Resolution
            </h2>
            <p>
              <strong>Governing law:</strong> These Terms are governed by the laws of New South Wales, Australia, without regard to conflict of law principles.
            </p>
            <p className="mt-4">
              <strong>Jurisdiction:</strong> Both parties consent to the exclusive jurisdiction of the courts of New South Wales and the Federal Court of Australia.
            </p>
            <p className="mt-4">
              <strong>Dispute process:</strong> If a dispute arises, you must first contact us at{" "}
              <a href="mailto:support@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                support@projectintelligence.com.au
              </a>
              {" "}to attempt resolution. If unresolved within 30 days, either party may pursue legal action.
            </p>
          </section>

          {/* 11. Termination */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              11. Termination
            </h2>
            <p>
              <strong>Your termination:</strong> You can cancel your subscription anytime from your account settings. Cancellation takes effect immediately.
            </p>
            <p className="mt-4">
              <strong>Our termination:</strong> We may suspend or terminate your account if you:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Violate these Terms or our Acceptable Use Policy</li>
              <li>Fail to pay for 3+ billing cycles</li>
              <li>Provide false or fraudulent information</li>
              <li>Abuse the Service or harass our support team</li>
            </ul>
            <p className="mt-4">
              Upon termination, your account and all data are deleted within 30 days (soft delete immediate, hard delete after 30 days).
            </p>
          </section>

          {/* 12. Severability */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              12. Severability
            </h2>
            <p>
              If any provision of these Terms is found to be unenforceable, the remaining provisions remain in effect. We will replace the unenforceable provision with one that is valid and achieves the original intent as closely as possible.
            </p>
          </section>

          {/* 13. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              13. Contact Us
            </h2>
            <p>
              Questions about these Terms? Contact us:
            </p>
            <div className="bg-[#102A43] rounded-lg p-4 mt-4 space-y-2">
              <p>
                <strong className="text-white">ProjectIntelligence AU</strong>
              </p>
              <p>
                Email:{" "}
                <a href="mailto:support@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                  support@projectintelligence.com.au
                </a>
              </p>
              <p>ABN: 00 000 000 000</p>
              <p>Jurisdiction: New South Wales, Australia</p>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
