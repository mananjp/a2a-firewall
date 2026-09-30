import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalCallout, prose } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How A2A Firewall collects, uses, stores, and protects personal data, including inter-agent payload handling, payment data processed by Razorpay, and data-subject rights under Indian and global privacy law.",
};

const mailto = (email: string) => `mailto:${email}`;

export const revalidate = 3600;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy & Data Processing Policy"
      description={`This policy explains how ${SITE.tradingAs} collects, uses, stores, shares, and protects personal data across self-hosted and cloud-managed deployments, and how to exercise your rights over it.`}
    >
      <LegalSection id="scope" title="1. Who we are and what this covers">
        <p className={prose.p}>
          This policy applies to the {SITE.brandName} hosted service and website operated by{" "}
          {SITE.entityLine} (the &ldquo;Operator&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
          The Operator is the data fiduciary in respect of personal data processed through the
          hosted service.
        </p>
        <p className={prose.p}>
          {SITE.brandName} is built on <strong className={prose.strong}>privacy by
          design</strong>, <strong className={prose.strong}>zero-trust</strong>, and{" "}
          <strong className={prose.strong}>data minimisation</strong>. It is also consistent
          with the Digital Personal Data Protection Act, 2023 (India), the Reserve Bank of
          India cybersecurity framework, HIPAA, and the EU General Data Protection Regulation
          and California Consumer Privacy Act.
        </p>
        <p className={prose.p}>
          If you self-host the open-source software, you act as the data controller and this
          policy does not govern that deployment; instead, apply your own retention and privacy
          controls, which the software provides.
        </p>
      </LegalSection>

      <LegalSection id="principles" title="2. Guiding principles">
        <ol className={prose.ol}>
          <li className={prose.li}>
            <strong className={prose.strong}>Tenant data isolation.</strong> Workspaces are
            isolated by UUID namespace, dedicated cryptographic keys, and database foreign-key
            constraints.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Automated PII scrubbing.</strong> Personally
            identifiable information &mdash; including Aadhaar numbers, Indian PAN identifiers,
            social security numbers, payment card numbers (Luhn-validated), and contact
            details &mdash; is detected and masked or redacted before logs are persisted.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Data minimisation.</strong> Inspection extracts
            only the features required to make a security decision (intent, tool arguments,
            routing metadata) rather than retaining whole conversation contexts.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>No model training.</strong> We do not use your data
            to train our own models. Where your content reaches an LLM provider, that provider
            processes it under its own terms and retention commitments rather than ours.
          </li>
        </ol>
      </LegalSection>

      <LegalSection id="collect" title="3. Information we collect">
        <h3 className={prose.h3}>3.1 Information you provide</h3>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>Account data.</strong> Name, email address, plus
            workspace names and membership. Access is granted by verifying your email address
            &mdash; we do not ask you to set or transmit a password, so we do not hold a
            password for your account.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Configuration data.</strong> Agent definitions,
            security policies, allowlists, and inspection settings you configure.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Support correspondence.</strong> Messages you
            send us, including anything you choose to attach.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>LLM provider credentials.</strong> If you configure
            your own LLM provider (bring-your-own-key), the key is encrypted at rest using
            per-workspace derived keys and is decrypted only for the duration of an inspection.
          </li>
        </ul>

        <h3 className={prose.h3}>3.2 Inter-agent payloads</h3>
        <p className={prose.p}>
          The service inspects messages exchanged between the agents you register. This
          necessarily includes the content of those messages. Payload content is the most
          sensitive category of data the service handles, and it is treated accordingly: it
          is inspected in memory, excluded from logs wherever possible, and subject to the
          retention limits in{" "}
          <a href="#retention" className={prose.a}>
            Section 7
          </a>
          .
        </p>

        <h3 className={prose.h3}>3.3 Technical data collected automatically</h3>
        <ul className={prose.ul}>
          <li className={prose.li}>
            Request metadata: timestamps, latencies, IP address, agent identifiers, risk
            scores, and violation metadata.
          </li>
          <li className={prose.li}>
            An append-only audit trail: Ed25519 hash-chained records of administrative and
            security actions, designed for non-repudiation.
          </li>
          <li className={prose.li}>
            Application error traces (optional, sampled at 10%) sent to our error monitoring
            provider.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="4. How we use information">
        <p className={prose.p}>
          We use personal data only to: provide and operate the Service; authenticate users and
          enforce plan limits; inspect and score agent traffic for security purposes; detect
          and prevent abuse of the Service; maintain the audit trail required for compliance;
          diagnose faults and improve reliability; respond to support requests; and comply with
          legal obligations.
        </p>
        <p className={prose.p}>
          We do not sell personal data. We do not use Customer Data for advertising. We do not
          use it to train models.
        </p>
      </LegalSection>

      <LegalSection id="payment" title="5. Payment and billing data">
        <LegalCallout title="We never see your card details">
          <p>
            Subscription payments are processed entirely by Razorpay, our payment processor.
            <strong> Full payment card numbers, CVVs, and bank credentials are collected and
            stored by Razorpay, never by {SITE.tradingAs}.</strong> We receive only a
            customer identifier, plan identifier, subscription status, and transaction
            references. Razorpay is an independent controller for payment data and processes
            it under its own privacy policy and RBI-regulated security standards.
          </p>
        </LegalCallout>
        <p className={prose.p}>
          The personal data the Operator processes in relation to billing is limited to your
          name, email address, plan, subscription status, and billing dates. This is retained
          for as long as your subscription is active and for 8 years afterwards where required
          by Indian tax and accounting record-keeping obligations.
        </p>
      </LegalSection>

      <LegalSection id="processors" title="6. Sub-processors and third parties">
        <LegalCallout title="Where your agent content goes: the LLM layer" tone="warn">
          <p>
            Where the LLM detection layer is enabled &mdash; which your plan makes available on
            Pro, Team and Enterprise, but <strong>not available on Free</strong>, and which
            activates only when a LLM provider key is available to the service &mdash; up to the{" "}
            <strong>first 300 characters of each inspected payload</strong> are transmitted to
            our LLM provider (Groq), or to whichever LLM provider you have configured, so that
            the payload can be semantically classified for prompt injection.
          </p>
          <p className="mt-2">
            This is the one point at which agent content leaves your infrastructure. The
            excerpt is sent unredacted; the automated PII scrubbing described in Section 2
            applies to <em>persisted logs</em>, not to this transmission. If your agent traffic
            must never leave your perimeter, do not enable the LLM layer, or configure your own
            LLM provider so that the transfer is covered by your own agreement with that
            provider.
          </p>
        </LegalCallout>
        <p className={prose.p}>
          In addition to the LLM provider, we rely on the following processors. Full details
          are also listed in{" "}
          <Link href="/terms#sub-processors" className={prose.a}>
            Section 8 of the Terms of Service
          </Link>
          .
        </p>
        <div className="mb-6 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated">
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Processor</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Purpose</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Location</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5">Groq / your LLM provider</td>
                <td className="px-3 py-2.5">Payload excerpt classification</td>
                <td className="px-3 py-2.5">United States</td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5">Razorpay</td>
                <td className="px-3 py-2.5">Payments and receipts</td>
                <td className="px-3 py-2.5">India</td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5">Render</td>
                <td className="px-3 py-2.5">Application hosting</td>
                <td className="px-3 py-2.5">United States</td>
              </tr>
              <tr className="border-b border-hairline">
                <td className="px-3 py-2.5">Neon</td>
                <td className="px-3 py-2.5">Managed PostgreSQL</td>
                <td className="px-3 py-2.5">United States</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">Sentry (optional)</td>
                <td className="px-3 py-2.5">Error monitoring</td>
                <td className="px-3 py-2.5">European Union (Germany)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={prose.p}>
          Where a transfer of personal data outside India is necessary, it is made subject to
          appropriate safeguards. You may request details of the safeguards applied by
          contacting the Grievance Officer.
        </p>
      </LegalSection>

      <LegalSection id="deployment" title="7. Data handling by deployment model">
        <div className="mb-6 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated">
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Data category</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">
                  Self-hosted (Docker / Kubernetes)
                </th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">
                  Cloud-managed (hosted Service)
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5">Inter-agent payloads</td>
                <td className="px-3 py-2.5">
                  Stored in your own database under your retention rules
                </td>
                <td className="px-3 py-2.5">
                  Held in memory during inspection and discarded immediately afterwards unless
                  you enable the review queue; a truncated excerpt may be sent to the LLM
                  provider as described in Section 6
                </td>
              </tr>
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5">Signatures &amp; audit records</td>
                <td className="px-3 py-2.5">Hashes and Ed25519 signatures stored locally</td>
                <td className="px-3 py-2.5">
                  Stored in your isolated workspace database, hash-chained for tamper evidence
                </td>
              </tr>
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5">Telemetry &amp; metrics</td>
                <td className="px-3 py-2.5">
                  OpenTelemetry spans routed directly to your own collector (for example
                  Jaeger or Datadog)
                </td>
                <td className="px-3 py-2.5">
                  Aggregated latency and risk metrics without prompt content
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-3 py-2.5">Customer LLM API keys</td>
                <td className="px-3 py-2.5">Held in local container memory</td>
                <td className="px-3 py-2.5">
                  Encrypted at rest; decrypted only for the duration of an inspection
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="retention" title="8. Retention and deletion">
        <p className={prose.p}>
          Workspace administrators control retention via{" "}
          <strong className={prose.strong}>Dashboard &rarr; Data Retention</strong>. Defaults
          are set by plan:
        </p>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>Payloads:</strong> 1 to 90 days (default 7).
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Telemetry records:</strong> 7 to 180 days
            (default 30).
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Audit logs:</strong> minimum 365 days, enforced as
            a compliance floor for administrative and security actions.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Account records:</strong> retained for the life of
            the account plus 8 years where required for tax and accounting purposes.
          </li>
        </ul>
        <p className={prose.p}>
          On expiry, sensitive payload fields are scrubbed before permanent deletion. You may
          also request immediate erasure of a workspace using the purge controls, which
          permanently deletes associated telemetry, logs, and agent metadata.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="9. Cookies and analytics">
        <p className={prose.p}>
          The Service sets no advertising or third-party tracking cookies. Authentication state
          is held in a session token in your browser&rsquo;s storage; we do not use it for
          cross-site tracking. We do not embed third-party analytics beacons. Aggregated
          performance metrics are generated from server-side telemetry rather than from visitor
          tracking.
        </p>
      </LegalSection>

      <LegalSection id="security" title="10. How we protect data">
        <p className={prose.p}>
          We use TLS for data in transit, per-workspace derived encryption keys for secrets at
          rest, Ed25519 agent identities, macaroon capability scoping for delegated requests,
          and a hash-chained audit trail. Access to production systems is restricted to the
          Operator. There is, however, no system that is completely secure, and absolute
        security cannot be guaranteed.
        </p>
        <p className={prose.p}>
          To report a suspected vulnerability, email{" "}
          <a href={mailto(SITE.emails.security)} className={prose.a}>
            {SITE.emails.security}
          </a>{" "}
          rather than disclosing it publicly.
        </p>
      </LegalSection>

      <LegalSection id="automated" title="11. Automated inspection and decision-making">
        <p className={prose.p}>
          The Service makes automated security assessments about inter-agent traffic, using
          deterministic rules and, where enabled, a large language model. It may therefore
          allow, flag, or block a message based on those assessments. Those decisions are
          advisory security controls you configure; you remain responsible for the agents and
          systems you operate.
        </p>
        <p className={prose.p}>
          Assessment outcomes are recorded in the audit trail so that decisions affecting your
          traffic can be reviewed and explained. We do not make decisions producing legal
          effects or similarly significant effects on natural persons.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="12. Your rights">
        <p className={prose.p}>
          Subject to applicable law, you may exercise the following rights over your personal
          data:
        </p>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>Access</strong> &mdash; obtain a copy of the
            personal data we hold about you.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Correction</strong> &mdash; have inaccurate or
            incomplete data rectified.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Erasure</strong> &mdash; request deletion, where
            no legal obligation to retain the data applies.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Data portability</strong> &mdash; receive your
            data in a structured, commonly used format.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Withdraw consent</strong>, where processing is
            based on consent.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Nomination</strong> &mdash; under the Digital
            Personal Data Protection Act, 2023, nominate a person to exercise these rights on
            your behalf in the event of death or incapacity.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Grievance</strong> &mdash; complain to us, and
            thereafter to the Data Protection Board of India.
          </li>
        </ul>
        <p className={prose.p}>
          To exercise any right, email{" "}
          <a href={mailto(SITE.emails.privacy)} className={prose.a}>
            {SITE.emails.privacy}
          </a>{" "}
          from the email address on your account. We may ask you to verify your identity before
          acting on a request.
        </p>
      </LegalSection>

      <LegalSection id="grievance" title="13. Grievance Officer">
        <p className={prose.p}>
          In accordance with the Digital Personal Data Protection Act, 2023, the Operator
          appoints a Grievance Officer. Any grievance may be raised at{" "}
          <a href={mailto(SITE.emails.privacy)} className={prose.a}>
            {SITE.emails.privacy}
          </a>{" "}
          with the subject line &ldquo;Data Protection Grievance&rdquo;. A response will be
          provided within{" "}
          <strong className={prose.strong}>{SITE.responseTimes.privacy}</strong> of receipt. If
          you are not satisfied with our response, you may escalate to the Data Protection
          Board of India.
        </p>
      </LegalSection>

      <LegalSection id="children" title="14. Children's privacy">
        <p className={prose.p}>
          The Service is not directed to children under 18 and we do not knowingly collect
          personal data from them. If you believe a child has provided personal data, contact{" "}
          <a href={mailto(SITE.emails.privacy)} className={prose.a}>
            {SITE.emails.privacy}
          </a>{" "}
          and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes-privacy" title="15. Changes to this policy">
        <p className={prose.p}>
          We may update this policy to reflect changes in the Service or in legal requirements.
          Material changes will be notified by email and by a notice on this page at least 30
          days before taking effect. Prior versions are available on request.
        </p>
      </LegalSection>

      <LegalSection id="contact-privacy" title="16. Contact">
        <p className={prose.p}>
          For privacy inquiries, data-subject requests, or regulatory audit requests, contact{" "}
          <a href={mailto(SITE.emails.privacy)} className={prose.a}>
            {SITE.emails.privacy}
          </a>
          , or write to:
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
        </address>
        <p className={prose.p}>
          See also the{" "}
          <Link href="/terms" className={prose.a}>
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link href="/refund" className={prose.a}>
            Cancellation and Refund Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
