import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalCallout, prose } from "@/components/legal/legal-page";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description:
    "How to cancel an A2A Firewall subscription, when access continues after cancellation, and how to request a refund including eligibility windows and processing times.",
};

const mailto = (email: string) => `mailto:${email}`;

export const revalidate = 3600;

export default function RefundPage() {
  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      description={`This policy explains how to cancel an ${SITE.brandName} subscription, what happens to your access, and the circumstances in which a refund is granted. It forms part of the Terms of Service.`}
    >
      <LegalCallout title="The short version">
        <p>
          <strong>
            Cancel any time, at no cost. Your subscription remains fully active until the end of
            the billing period you have already paid for.
          </strong>{" "}
          We never charge a cancellation fee, and cancelling stops all future renewals
          automatically &mdash; you do not need to contact support to prevent a renewal you
          have already cancelled.
        </p>
      </LegalCallout>

      <LegalSection id="how-to-cancel" title="1. How to cancel">
        <p className={prose.p}>
          You can cancel your subscription at any time, for any reason, by emailing{" "}
          <a href={mailto(SITE.emails.billing)} className={prose.a}>
            {SITE.emails.billing}
          </a>{" "}
          from the email address on your account with the subject line
          &ldquo;Subscription cancellation&rdquo;. No reason needs to be given.
        </p>
        <p className={prose.p}>
          You may also cancel from within the Service if a cancellation control is available in
          your account. Either route has the same effect. Cancellation is not automatic on
          account deletion: if you delete your account or close your browser without telling us,
          the subscription will renew at the next billing date.
        </p>
      </LegalSection>

      <LegalSection id="what-happens" title="2. What happens when you cancel">
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>You keep full access to the end of the paid
            period.</strong> All plan features, quotas, and data continue to work until the last
            day you have paid for. Cancelling does not cut your service short.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>No further charges.</strong> The subscription does
            not renew and no further payment is taken once cancellation is confirmed.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Your plan is not downgraded early.</strong> Your
            paid entitlements persist for the remainder of the period, then the account returns
            to the Free plan automatically.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Your data is retained, then released.</strong> Data
            remains available throughout the paid period and for 30 days afterwards so you can
            export it. After that it may be permanently deleted in line with the{" "}
            <Link href="/privacy" className={prose.a}>
              Privacy Policy
            </Link>
            .
          </li>
        </ul>
        <p className={prose.p}>
          We confirm the cancellation in writing to the account email address within{" "}
          <strong className={prose.strong}>{SITE.responseTimes.billing}</strong>, confirming the
          effective date and that no further charges will be made. If you have not received that
          confirmation, contact us before your next billing date &mdash; we will reconcile the
          record and confirm the outcome either way.
        </p>
      </LegalSection>

      <LegalSection id="billing-periods" title="3. Monthly and annual billing">
        <div className="mb-6 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated">
                <th className="px-3 py-2.5 font-semibold text-ink-primary">&nbsp;</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Monthly</th>
                <th className="px-3 py-2.5 font-semibold text-ink-primary">Annual</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5 font-semibold text-ink-primary">Charged</td>
                <td className="px-3 py-2.5">
                  Once per month, on the same date each month, until cancelled
                </td>
                <td className="px-3 py-2.5">Once per year, on the anniversary date</td>
              </tr>
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5 font-semibold text-ink-primary">
                  Access after cancelling
                </td>
                <td className="px-3 py-2.5">Until the last day of the month paid for</td>
                <td className="px-3 py-2.5">Until the last day of the year paid for</td>
              </tr>
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5 font-semibold text-ink-primary">Cancellation fee</td>
                <td className="px-3 py-2.5">None</td>
                <td className="px-3 py-2.5">None</td>
              </tr>
              <tr className="border-b border-hairline align-top">
                <td className="px-3 py-2.5 font-semibold text-ink-primary">
                  Unused time on cancellation
                </td>
                <td className="px-3 py-2.5">
                  Refundable if requested within 7 days of the charge
                </td>
                <td className="px-3 py-2.5">Not refundable on cancellation</td>
              </tr>
              <tr className="align-top">
                <td className="px-3 py-2.5 font-semibold text-ink-primary">
                  Refund on cancellation
                </td>
                <td className="px-3 py-2.5">
                  Full refund if requested within 7 days of the initial purchase
                </td>
                <td className="px-3 py-2.5">
                  Full refund if requested within 7 days of the initial purchase
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={prose.p}>
          All prices are stated in Indian Rupees and are{" "}
          <strong className={prose.strong}>inclusive of all applicable taxes</strong>. See{" "}
          <Link href="/pricing" className={prose.a}>
            Pricing
          </Link>{" "}
          for current plan prices.
        </p>
      </LegalSection>

      <LegalSection id="refunds" title="4. When a refund is granted">
        <h3 className={prose.h3}>4.1 Refunds we commit to</h3>
        <ul className={prose.ul}>
          <li className={prose.li}>
            <strong className={prose.strong}>Cooling-off period.</strong> Request a full
            refund within{" "}
            <strong className={prose.strong}>7 days of the initial purchase</strong> of a paid
            plan. We do not ask why, and we do not require you to justify the request.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Pro-rata on monthly plans.</strong> If you request
            a refund within 7 days of a monthly charge, the unused portion of that month is
            refunded on a pro-rata basis.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Duplicate or incorrect charges.</strong> If you are
            charged more than once for the same subscription period, or charged for a
            subscription you did not start, the duplicate amount is refunded in full.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Charges taken after cancellation.</strong> If you
            cancelled and we charge you again, the charge is refunded in full.
          </li>
          <li className={prose.li}>
            <strong className={prose.strong}>Service failure on our part.</strong> If a
            material service failure materially deprives you of the benefit of your plan, we
            will refund the affected period on a pro-rata basis. Contact us within 30 days of
            the affected period.
          </li>
        </ul>

        <h3 className={prose.h3}>4.2 Where a refund is not available</h3>
        <ul className={prose.ul}>
          <li className={prose.li}>
            Unused time remaining on an <strong className={prose.strong}>annual</strong>{" "}
            subscription after the 7-day cooling-off period. Cancelling an annual plan stops
            future renewals but does not entitle you to a refund of the remaining months; you
            retain access for the full period paid for.
          </li>
          <li className={prose.li}>
            Used time on any plan after the 7-day cooling-off period has passed. Paid-for time
            is yours to use, and unused time on monthly plans after that window is not
            refundable.
          </li>
          <li className={prose.li}>
            Accounts suspended or terminated for material breach of the{" "}
            <Link href="/terms" className={prose.a}>
              Terms of Service
            </Link>{" "}
            during the current period.
          </li>
          <li className={prose.li}>
            Change-of-mind cancellations after the 7-day window, unless required by law or as
            a matter of good faith under Section 4.1.
          </li>
        </ul>
        <LegalCallout title="No charge for cancelling">
          <p>
            Cancelling itself is always free and always takes effect at the end of your paid
            period. The items in Section 4.2 concern <em>getting money back for time you have
            not used</em>, not whether cancellation is permitted. You can always cancel, and
            always keep the service you have already paid for.
          </p>
        </LegalCallout>
      </LegalSection>

      <LegalSection id="request" title="5. Requesting a refund">
        <ol className={prose.ol}>
          <li className={prose.li}>
            Email{" "}
            <a href={mailto(SITE.emails.billing)} className={prose.a}>
              {SITE.emails.billing}
            </a>{" "}
            from the email address on your account, with the subject line
            &ldquo;Refund request&rdquo;.
          </li>
          <li className={prose.li}>
            Include the email address on the account and, if you have it, the Razorpay payment
            or subscription identifier.
          </li>
          <li className={prose.li}>
            We will confirm receipt within{" "}
            <strong className={prose.strong}>{SITE.responseTimes.billing}</strong> and tell you
            whether the request is approved and, if not, why.
          </li>
        </ol>
        <p className={prose.p}>
          You do not need to cancel your subscription in order to request a refund, and
          requesting a refund does not by itself cancel a subscription. If you want both, say
          so in the same email.
        </p>
      </LegalSection>

      <LegalSection id="processing" title="6. How refunds are issued and paid">
        <ul className={prose.ul}>
          <li className={prose.li}>
            Refunds are issued to the original payment method through our payment processor,
            Razorpay. We cannot refund to a different card, account, or person.
          </li>
          <li className={prose.li}>
            An approved refund is initiated within{" "}
            <strong className={prose.strong}>5 business days</strong> of approval and
            typically reaches your account within{" "}
            <strong className={prose.strong}>5 to 10 business days</strong>, depending on your
            bank or card issuer.
          </li>
          <li className={prose.li}>
            Refunds are inclusive of all taxes charged. No deduction is made for the days you
            used the Service within a pro-rata refund.
          </li>
          <li className={prose.li}>
            Refunds are returned in Indian Rupees. Where the original charge was in another
            currency, any conversion difference is borne by the customer.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="disputes" title="7. Failed payments and disputes">
        <p className={prose.p}>
          If a renewal payment fails, we will attempt to retry it. If payment continues to
          fail, the account is moved to the Free plan. Your data is not deleted when this
          happens, and reactivating restores your workspace. Any amount successfully charged but
          subsequently reversed by your bank is refunded in full.
        </p>
        <p className={prose.p}>
          If you believe you have been charged incorrectly, please contact us first &mdash; we
          can usually resolve billing issues directly and faster than a formal dispute. Where a
          formal dispute or chargeback is raised through your bank, we will provide the relevant
          transaction and service records so your bank can reach a decision. Chargebacks are
          governed by your bank&rsquo;s rules and applicable consumer law.
        </p>
      </LegalSection>

      <LegalSection id="changes-refund" title="8. Changes to this policy">
        <p className={prose.p}>
          We may update this policy. Material changes will be notified by email and by a notice
          on this page at least 30 days before taking effect. Changes apply to cancellation and
          refund requests made after the change takes effect; a request made before a change
          takes effect is governed by the policy in force when you made it.
        </p>
      </LegalSection>

      <LegalSection id="contact-refund" title="9. Contact">
        <p className={prose.p}>
          For cancellations, refunds, or billing questions, email{" "}
          <a href={mailto(SITE.emails.billing)} className={prose.a}>
            {SITE.emails.billing}
          </a>{" "}
          or see the{" "}
          <Link href="/contact" className={prose.a}>
            Contact page
          </Link>
          . This policy forms part of the{" "}
          <Link href="/terms" className={prose.a}>
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
