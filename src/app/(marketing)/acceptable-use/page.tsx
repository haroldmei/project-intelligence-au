import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — ProjectIntelligence AU",
  description: "Acceptable Use Policy for ProjectIntelligence AU.",
};

export default function AcceptableUsePage() {
  return (
    <main className="min-h-screen bg-[#0A1E30] text-[#9FB3C8] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Acceptable Use Policy
          </h1>
          <p className="text-[#627D98] text-sm">
            Last updated: April 2026
          </p>
        </div>

        {/* Content */}
        <article className="prose prose-invert max-w-none space-y-6 text-[#9FB3C8]">
          {/* 1. Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              1. Policy Overview
            </h2>
            <p>
              This Acceptable Use Policy (&ldquo;AUP&rdquo;) outlines the prohibited activities on the ProjectIntelligence AU platform. By using the Service, you agree to comply with this policy.
            </p>
            <p>
              This policy is supplementary to our Terms of Service. Violations may result in immediate account suspension or termination without refund.
            </p>
          </section>

          {/* 2. Prohibited Activities */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              2. Prohibited Activities
            </h2>
            <p>
              You agree NOT to engage in any of the following:
            </p>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.1 Data Extraction and Resale
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Scrape, extract, or bulk-download development application data, rankings, or metadata for republication or resale
              </li>
              <li>
                Export digests and resell them as your own product or integrate them into a competing service
              </li>
              <li>
                Build a dataset of our ranked DAs to train competing AI models or sell to third parties
              </li>
              <li>
                Use our relevance scores or &ldquo;why this matched&rdquo; explanations without permission
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.2 Contact Data Extraction and Harassment
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Extract applicant names, phone numbers, emails, or ABNs from development applications for unsolicited contact
              </li>
              <li>
                Send spam, phishing, or scam emails/SMS to applicants or council staff listed in DAs
              </li>
              <li>
                Use DA information to harass, threaten, or engage in harassment toward any person
              </li>
              <li>
                Conduct pyramid schemes, MLM recruitment, or unsolicited cold sales via DA contact information
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.3 Reverse Engineering and Circumvention
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Attempt to reverse-engineer, disassemble, or discover the relevance pipeline algorithms
              </li>
              <li>
                Probe the API to extract model weights, embeddings, or prompts
              </li>
              <li>
                Circumvent rate-limiting, authentication, or other security controls
              </li>
              <li>
                Use automated tools to bypass access restrictions or test for vulnerabilities
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.4 Automated Abuse
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Use bots, scripts, or automated tools to access the Service without prior written permission
              </li>
              <li>
                Create multiple accounts to circumvent rate limits, free trial limits, or billing
              </li>
              <li>
                Use the Service for load-testing, stress-testing, or DDoS attacks
              </li>
              <li>
                Engage in automated feedback (thumbs-up/down) to artificially inflate rankings
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.5 Illegal and Fraudulent Activity
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Use the Service to conduct illegal activity, fraud, or money laundering
              </li>
              <li>
                Provide false identity, ABN, or business information at signup
              </li>
              <li>
                Use stolen payment methods or commit card fraud
              </li>
              <li>
                Violate any applicable Australian federal, state, or local law
              </li>
            </ul>

            <h3 className="text-lg font-semibold text-white mt-6 mb-3">
              2.6 Platform Abuse
            </h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Attempt to interfere with, disrupt, or compromise the Service infrastructure or databases
              </li>
              <li>
                Harass, threaten, or abuse ProjectIntelligence AU staff or other users
              </li>
              <li>
                Post defamatory, obscene, or illegal content in feedback or support channels
              </li>
              <li>
                Attempt to gain unauthorised access to other user accounts
              </li>
            </ul>
          </section>

          {/* 3. Data Source Attribution */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              3. Development Application Data Attribution
            </h2>
            <p>
              Development Application data originates from public NSW Planning Portal and local council sources. If you redistribute any DA data obtained via ProjectIntelligence AU:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                You must attribute the original source (NSW Planning Portal Online DA Service or the relevant council)
              </li>
              <li>
                You may not represent it as proprietary data or claim ownership
              </li>
              <li>
                You may not imply endorsement from ProjectIntelligence AU or the councils
              </li>
            </ul>
          </section>

          {/* 4. Enforcement */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              4. Enforcement and Consequences
            </h2>
            <p>
              <strong>Monitoring:</strong> We actively monitor for violations using automated detection, user reports, and manual review.
            </p>
            <p className="mt-4">
              <strong>Escalation:</strong> Violations are handled in the following manner:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>
                <strong>Warning:</strong> First minor violation → email warning explaining the violation and correction required
              </li>
              <li>
                <strong>Suspension:</strong> Repeated minor violations or serious first-time violations → temporary account suspension (24–72 hours)
              </li>
              <li>
                <strong>Termination:</strong> Egregious violations (data resale, contact scraping, fraud) → permanent account termination and data deletion
              </li>
            </ol>
            <p className="mt-4">
              <strong>No refunds:</strong> Suspended or terminated accounts are not eligible for refunds. Any unused subscription balance is forfeited.
            </p>
            <p className="mt-4">
              <strong>Legal action:</strong> In cases of fraud, IP infringement, or contract breach, we reserve the right to pursue civil or criminal legal action.
            </p>
          </section>

          {/* 5. Reporting Violations */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              5. Reporting Violations
            </h2>
            <p>
              If you believe another user is violating this policy, please report it to{" "}
              <a href="mailto:abuse@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                abuse@projectintelligence.com.au
              </a>
              . Include details of the violation and any evidence. We take all reports seriously and will investigate promptly.
            </p>
          </section>

          {/* 6. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-3">
              6. Questions
            </h2>
            <p>
              If you have questions about this policy or need clarification on acceptable use, contact{" "}
              <a href="mailto:support@projectintelligence.com.au" className="text-[#D97706] hover:text-[#F59E0B]">
                support@projectintelligence.com.au
              </a>
              .
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
