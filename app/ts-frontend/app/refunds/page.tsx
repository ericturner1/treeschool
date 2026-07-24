import { LegalLayout, LegalSection } from "../legal-layout";

export default function RefundsPage() {
  return <LegalLayout title="Refund Policy" intro="We want parents to receive the printable planning service they paid for and to have a clear path when something goes wrong.">
    <LegalSection title="One-time printable plans"><p>If Treeschool cannot process the uploaded curriculum or does not produce the purchased printable plan after reasonable troubleshooting, contact support within 14 days of purchase for repair, rerun, or a refund. We may ask for information needed to identify the purchase and diagnose the failure.</p></LegalSection>
    <LegalSection title="Change-of-mind requests"><p>Because processing begins after files are uploaded, change-of-mind refunds are not guaranteed once generation has begun. Contact us promptly and we will consider the work already performed and applicable consumer rights.</p></LegalSection>
    <LegalSection title="Subscriptions"><p>Subscriptions can be managed through the Stripe Customer Portal. Cancellation stops future renewal but normally does not retroactively refund the current billing period. The introductory payment is not refundable after Treeschool successfully generates a requested lesson plan. If a technical failure prevents Treeschool from producing the plan after reasonable troubleshooting, contact support within 14 days for repair, rerun, or a refund. Billing mistakes and duplicate charges will be corrected.</p></LegalSection>
    <LegalSection title="How refunds are issued"><p>Approved refunds are returned through Stripe to the original payment method. Bank processing time is outside Treeschool’s control. This policy does not limit any mandatory rights under applicable consumer law.</p></LegalSection>
  </LegalLayout>;
}
