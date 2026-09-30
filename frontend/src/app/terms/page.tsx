import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalCallout, prose } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing use of the A2A Firewall hosted service, including subscriptions, billing, acceptable use, customer data handling, liability, and dispute resolution.",
};

const mailto = (email: string) => `mailto:${email}`;

export const revalidate = 3600;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description={`These Terms govern your access to and use of the ${SITE.brandName} hosted service. By creating an account or subscribing, you agree to them on behalf of yourself or the organisation you represent.`}
    >
      <LegalSection id="acceptance" title="1. Acceptance of these Terms">
        <p className={prose.p}>
          These Terms of Service (the &ldquo;Terms&rdquo;) form a binding agreement between{" "}
          {SITE.legalName}, a sole proprietor trading as &ldquo;{SITE.tradingAs}&rdquo; (the
          &ldquo;Operator&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), and you (the
          &ldquo;Customer&rdquo;, &ldquo;you&rdquo;). The Operator is the only contracting party
          under these Terms.
        </p>
        <p className={prose.p}>
          By creating an account, subscribing to a paid plan, or otherwise using the Service
          (as defined below), you accept these Terms. If you are accepting on behalf of an
          organisation, you represent that you have authority to bind that organisation, and
          &ldquo;you&rdquo; refers to it.
        </p>
        <p className={prose.p}>
          If you do not agree with these Terms, do not use the Service. These Terms apply
          solely to the hosted Service. Use of the open-source software distributed under the
          Apache License 2.0 is governed by that licence instead &mdash; see{" "}
          <strong className={prose.strong}>Section 12</strong>.
        </p>
      </LegalSection>

      <LegalSection id="service" title="2. The Service">
        <p className={prose.p}>
          The &ldquo;Service&rdquo; is {SITE.brandName}, a hosted security and governance mesh for
          autonomous AI agent communication. It provides cryptographic agent identity
          (Ed25519), capability-scoped delegation tokens (macaroons), a multi-layer inspection
          pipeline, and an auditable record of inter-agent traffic.
        </p>
        <p className={prose.p}>
          The Service intercepts and inspects messages exchanged between AI agents that you
          register with the Service. You configure the agents, the policies applied to their
          traffic, and the inspection destinations. The Operator does not control, and is not
          responsible for, the business logic, outputs, or actions of any agent you connect.
        </p>

        <h3 className={prose.h3}>2.1 Open-source software is a separate product</h3>
        <p className={prose.p}>
          The core of {SITE.brandName} is also released as open-source software under the
          Apache License 2.0. That software is a <em>different</em> product from the hosted
          Service:
        </p>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>No subscription is required</strong> to use,
            modify, or self-host the open-source software. Doing so grants you no rights under
            these Terms, and these Terms impose no obligations or warranties on it.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>A subscription grants access to the hosted
            Service only.</strong> It is not a licence, and does not convey any intellectual
            property rights in the open-source software, which remains licensed under the
            Apache License 2.0.
          </li>
          <li className={prose.li}>
            Self-hosted deployments are governed solely by the Apache License 2.0. The Operator
            provides no warranty, support, or indemnity for self-hosted use.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="accounts" title="3. Eligibility and Accounts">
        <p className={prose.p}>
          You must be at least 18 years of age and capable of entering a binding contract to
          use the Service. You are responsible for all activity under your account, for the
          accuracy of registration details, and for keeping your credentials and API keys
          confidential. Notify us promptly at{" "}
          <a href={mailto(SITE.emails.support)} className={prose.a}>
            {SITE.emails.support}
          </a>{" "}
          if you suspect unauthorised access.
        </p>
        <p className={prose.p}>
          You may not share an account or API key between organisations, or circumvent plan
          limits by creating multiple accounts.
        </p>
      </LegalSection>

      <LegalSection id="billing" title="4. Subscriptions, Plans and Billing">
        <LegalCallout title="Pricing and taxes">
          <p>
            All prices are stated in Indian Rupees (&#8377;) and are{" "}
            <strong>inclusive of all applicable taxes and levies</strong>. The Operator is not
            currently registered under the Goods and Services Tax Act, 2017 and does not charge
            GST. Should the Operator become GST-registered, GST will be added to future
            invoices and the Operator will notify existing customers before the change takes
            effect. Any tax liability arising from your use of the Service, including any
            withholding obligation, is your responsibility.
          </p>
        </LegalCallout>
        <p className={prose.p}>
          Paid plans renew automatically at the end of each billing period until cancelled.
          Plans, quotas, and current prices are published on the{" "}
          <Link href="/pricing" className={prose.a}>
            Pricing page
          </Link>
          , which forms part of these Terms.
        </p>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>Payment processing.</strong> Payments are
            processed by Razorpay. The Operator does not receive or store your card number,
            CVV, or other full payment credentials; those are handled entirely by Razorpay.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Payment confirmations.</strong> Razorpay sends
            payment confirmations to the email address associated with your account. The
            Operator does not currently issue separate tax invoices for subscription payments;
            your Razorpay payment record serves as your payment confirmation.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Failed payments.</strong> If a renewal charge
            fails, the Operator may retry it and may suspend or downgrade the account to the
            Free plan until payment succeeds.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Plan changes.</strong> Upgrades take effect
            immediately and are charged on a pro-rata basis for the remainder of the current
            period. Downgrades take effect at the end of the current billing period.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>No usage-based overage.</strong> Where an
            inspection quota is exhausted, further inspections are rejected and your plan is
            not charged extra. You may upgrade at any time.
          </li>
        </ul>
        <p className={prose.p}>
          Cancellation and refund terms are set out in the{" "}
          <Link href="/refund" className={prose.a}>
            Cancellation and Refund Policy
          </Link>
          , which is incorporated into these Terms by reference.
        </p>
      </LegalSection>

      <LegalSection id="cancellation" title="5. Suspension and Termination">
        <p className={prose.p}>
          You may cancel a paid subscription at any time by contacting{" "}
          <a href={mailto(SITE.emails.billing)} className={prose.a}>
            {SITE.emails.billing}
          </a>
          . Access continues until the end of the period you have already paid for; see{" "}
          <Link href="/refund" className={prose.a}>
            Cancellation and Refund Policy
          </Link>
          .
        </p>
        <p className={prose.p}>
          The Operator may suspend or terminate your access immediately, with or without
          notice, if you materially breach these Terms, in particular by using the Service to
          attack, infiltrate, or degrade third-party systems or agents, to process content
          unlawfully, or to evade usage limits. Where practicable, the Operator will notify
          you and allow a reasonable opportunity to remedy the breach.
        </p>
        <p className={prose.p}>
          On termination you may export your data for 30 days. After that, the Operator may
          permanently delete it in accordance with the{" "}
          <Link href="/privacy" className={prose.a}>
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="6. Acceptable Use">
        <p className={prose.p}>
          You agree not to, and not to permit any third party to:
        </p>
        <ul className={prose.ul}>
          <li className={prose.li}>
            use the Service in breach of applicable law, or to facilitate illegal activity;
          </li>
          <li className={prose.li}>
            attack, disrupt, or degrade the Service, its infrastructure, or any third-party
            network or system &mdash; including unauthorised load, penetration testing, or
            exploitation attempts without prior written authorisation;
          </li>
          <li className={prose.li}>
            introduce malware or interfere with the Service&rsquo;s operation;
          </li>
          <li className={prose.li}>
            upload content that infringes the intellectual property or privacy rights of others;
          </li>
          <li className={prose.li}>
            resell, sublicense, or provide the Service as a bureau service to third parties
            without a separate written agreement with the Operator.
          </li>
        </ul>
        <p className={prose.p}>
          Automated agent traffic through the Service must comply with the terms of the AI
          providers and agent platforms you connect. You are solely responsible for the agents
          you register.
        </p>
      </LegalSection>

      <LegalSection id="customer-data" title="7. Customer Data and Agent Traffic">
        <p className={prose.p}>
          <strong className={prose.strong}>You retain all rights in the data you submit to the
          Service.</strong> As between you and the Operator, you are the sole owner of your
          agent definitions, policies, and the contents of the inter-agent payloads you route
          through the Service. The Operator claims no ownership of that data and does not use
          it to train any model.
        </p>
        <p className={prose.p}>
          You grant the Operator a limited licence to host, process, transmit, and display your
          data solely to the extent necessary to operate the Service, to provide support you
          request, and to meet legal obligations.
        </p>
        <p className={prose.p}>
          <strong className={prose.strong}>Agent payloads are inspected in transit.</strong>{" "}
          The Service exists to read and analyse the content of messages between your agents.
          You must therefore have a lawful basis to submit that content, and you are
          responsible for obtaining any notices or consents required from the parties whose
          data the payloads contain. Do not route personal data through the Service unless you
          are satisfied that you are entitled to.
        </p>
      </LegalSection>

      <LegalSection id="sub-processors" title="8. Third-Party Services and Sub-processors">
        <p className={prose.p}>
          The Service relies on third-party providers. Depending on your plan and
          configuration, the following may process data on the Operator&rsquo;s behalf:
        </p>
        <div className="mb-6 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated">
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Provider</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Purpose</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Data involved</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Groq</strong> (or the LLM provider you
                  configure)
                </td>
                <td className="px-3 py-2.5 align-top">
                  Semantic prompt-injection classification
                </td>
                <td className="px-3 py-2.5 align-top">
                  A truncated excerpt of the agent payload (up to the first 300 characters)
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Razorpay</strong>
                </td>
                <td className="px-3 py-2.5 align-top">Subscription billing and receipts</td>
                <td className="px-3 py-2.5 align-top">
                  Name, email, payment instrument reference, transaction history
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Render</strong>
                </td>
                <td className="px-3 py-2.5 align-top">Application hosting</td>
                <td className="px-3 py-2.5 align-top">Application data in transit and at rest</td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Neon</strong>
                </td>
                <td className="px-3 py-2.5 align-top">Managed PostgreSQL hosting</td>
                <td className="px-3 py-2.5 align-top">
                  Workspace records, inspection results, audit logs
                </td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Sentry</strong> (optional)
                </td>
                <td className="px-3 py-2.5 align-top">Error and performance monitoring</td>
                <td className="px-3 py-2.5 align-top">Error traces, sampled at 10%</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 align-top">
                  <strong className={prose.strong}>Your own LLM provider</strong> (optional,
                  bring-your-own-key)
                </td>
                <td className="px-3 py-2.5 align-top">
                  Semantic classification using your own account
                </td>
                <td className="px-3 py-2.5 align-top">
                  Same excerpt, sent under your own provider agreement
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <LegalCallout title="Semantic layer transmits payload excerpts">
          <p>
            Where the LLM detection layer is enabled (Pro, Team and Enterprise plans), up to
            the first 300 characters of each inspected payload are transmitted to the
            configured LLM provider for classification. This is disclosed here because it
            means a limited amount of your agent content leaves your infrastructure. If your
            agent traffic must remain entirely within your own perimeter, do not enable the
            LLM layer, or configure your own LLM provider under a suitable agreement. The
            operator&rsquo;s full handling of this data is described in the{" "}
            <Link href="/privacy" className={prose.a}>
              Privacy Policy
            </Link>
            .
          </p>
        </LegalCallout>
        <p className={prose.p}>
          The Operator may change sub-processors by updating this Section. Material changes
          affecting your data will be notified by email at least 30 days in advance.
        </p>
      </LegalSection>

      <LegalSection id="confidentiality" title="9. Confidentiality">
        <p className={prose.p}>
          Each party will keep the other&rsquo;s non-public information confidential and use
          it only to perform its obligations under these Terms. This obligation does not apply
          to information that is public through no fault of the recipient, already known to
          the recipient without restriction, independently developed, or rightfully received
          from a third party. These obligations survive termination.
        </p>
      </LegalSection>

      <LegalSection id="security" title="10. Security">
        <p className={prose.p}>
          The Operator applies industry-standard safeguards, including TLS for data in
          transit, cryptographic agent identity (Ed25519), scoped delegation tokens
          (macaroons), and a tamper-evident, hash-chained audit trail. Automated PII
          detection and redaction run before log persistence.
        </p>
        <p className={prose.p}>
          No system is perfectly secure. The Operator&rsquo;s practices for reporting
          vulnerabilities are published in the project&rsquo;s{" "}
          <a
            href={`${SITE.repositoryUrl}/blob/main/SECURITY.md`}
            target="_blank"
            rel="noreferrer"
            className={prose.a}
          >
            SECURITY.md
          </a>{" "}
          and may be updated from time to time. Please report suspected vulnerabilities to{" "}
          <a href={mailto(SITE.emails.security)} className={prose.a}>
            {SITE.emails.security}
          </a>{" "}
          rather than disclosing them publicly.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="11. Intellectual Property">
        <p className={prose.p}>
          The Service, including its software, design, documentation, and branding, is owned
          by the Operator and protected by intellectual property law. Except for the limited
          right to use the Service under these Terms, no rights are granted to you.
        </p>
        <p className={prose.p}>
          Feedback you voluntarily provide may be used by the Operator without restriction or
          obligation, but no personal data or Customer Data will be used for that purpose
          without your consent.
        </p>
      </LegalSection>

      <LegalSection id="oss" title="12. Third-Party Open-Source Components">
        <p className={prose.p}>
          The Service incorporates third-party open-source components, including FastAPI,
          SQLAlchemy, Next.js, Tailwind CSS, and the Groq SDK. Those components remain under
          their own licences. The Operator does not warrant or support third-party components
          and is not responsible for any claim arising from them.
        </p>
      </LegalSection>

      <LegalSection id="warranty" title="13. Disclaimer of Warranties">
        <p className={prose.p}>
          Except as expressly stated in these Terms, the Service is provided{" "}
          <strong className={prose.strong}>&ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;</strong>, without warranties of any kind, whether express, implied,
          or statutory, including implied warranties of merchantability, fitness for a
          particular purpose, and non-infringement.
        </p>
        <p className={prose.p}>
          The Service performs security inspection and enforcement. It does not guarantee that
          any malicious, non-compliant, or unauthorised inter-agent communication will be
          detected or blocked. You remain responsible for the security of your own agents and
          systems.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="14. Limitation of Liability">
        <p className={prose.p}>
          To the maximum extent permitted by law, neither party is liable for indirect,
          incidental, special, consequential, exemplary, or punitive damages, or for loss of
          profits, revenue, data, goodwill, or business interruption, arising out of or in
          connection with the Service.
        </p>
        <p className={prose.p}>
          To the maximum extent permitted by law, each party&rsquo;s total aggregate liability
          under these Terms is limited to{" "}
          <strong className={prose.strong}>the total amount you paid the Operator in the
          twelve (12) months immediately preceding the event giving rise to the claim</strong>
          , or &#8377;1,000, whichever is higher.
        </p>
        <p className={prose.p}>
          Nothing in these Terms excludes or limits liability for death or personal injury
          caused by negligence, fraud or fraudulent misrepresentation, or any other liability
          that cannot lawfully be excluded or limited.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" title="15. Indemnification">
        <p className={prose.p}>
          You agree to indemnify, defend, and hold harmless the Operator from any third-party
          claim arising from your use of the Service, your violation of these Terms or
          applicable law, your agents&rsquo; conduct, or your infringement of a third
          party&rsquo;s rights.
        </p>
      </LegalSection>

      <LegalSection id="force-majeure" title="16. Force Majeure">
        <p className={prose.p}>
          Neither party is liable for failure to perform caused by circumstances beyond its
          reasonable control, including acts of God, natural disasters, war, civil unrest,
          epidemic, government action, or failure of third-party infrastructure or network
          providers. The affected party must notify the other promptly. Payment obligations for
          periods after the event are suspended for the duration of the event.
        </p>
      </LegalSection>

      <LegalSection id="law" title="17. Governing Law and Disputes">
        <p className={prose.p}>
          These Terms are governed by the laws of {SITE.governingLaw}, without regard to its
          conflict-of-laws rules. The courts at {SITE.jurisdiction} have exclusive jurisdiction
          over any dispute arising from these Terms, and both parties submit to that
          jurisdiction.
        </p>
        <p className={prose.p}>
          Before commencing proceedings, you agree to attempt resolution by contacting{" "}
          <a href={mailto(SITE.emails.support)} className={prose.a}>
            {SITE.emails.support}
          </a>{" "}
          and allowing up to 30 days for a response. This does not limit either party&rsquo;s
          right to seek urgent injunctive relief.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="18. Changes to these Terms">
        <p className={prose.p}>
          The Operator may update these Terms. Material changes will be notified by email and
          by a notice on this page at least 30 days before taking effect. Continuing to use
          the Service after that date means you accept the revised Terms. If you do not accept
          them, you may cancel as described in{" "}
          <Link href="/refund" className={prose.a}>
            Cancellation and Refund Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="notices" title="19. Notices">
        <p className={prose.p}>
          Formal notices under these Terms must be sent to the Operator at the postal address
          below, and to you at the email address on your account. Email notice is deemed given
          on transmission; postal notice on the fourth business day after posting.
        </p>
        <address className="mb-4 not-italic rounded-xl border border-hairline bg-surface-elevated p-4 text-[13px] leading-relaxed text-ink-muted">
          {SITE.legalName}
          <br />
          Sole proprietor, trading as &ldquo;{SITE.tradingAs}&rdquo;
          <br />
          {SITE.addressLines.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
          <br />
          <a href={mailto(SITE.emails.support)} className={prose.a}>
            {SITE.emails.support}
          </a>
        </address>
      </LegalSection>

      <LegalSection id="contact-terms" title="20. Contact">
        <p className={prose.p}>
          Questions about these Terms can be sent to{" "}
          <a href={mailto(SITE.emails.support)} className={prose.a}>
            {SITE.emails.support}
          </a>
          . See the{" "}
          <Link href="/contact" className={prose.a}>
            Contact page
          </Link>{" "}
          for all support channels, and the{" "}
          <Link href="/privacy" className={prose.a}>
            Privacy Policy
          </Link>{" "}
          for data-handling terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
