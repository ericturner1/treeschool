import Link from "next/link";
import { LegalLayout, LegalSection } from "../legal-layout";

export default function TermsPage() {
  return <LegalLayout title="Terms of Service" intro="These terms govern a parent or guardian’s use of Treeschool and its printable planning services.">
    <LegalSection title="Parent-controlled service"><p>You must be legally able to enter this agreement and have authority to provide any student information and curriculum materials submitted through your account. Parent accounts are not intended to be created by children.</p></LegalSection>
    <LegalSection title="Your materials"><p>You retain your rights in uploaded materials. You grant Treeschool a limited permission to store, process, reproduce, and transform those materials only as needed to provide, secure, and support the service. You must have the right to upload and use them.</p></LegalSection>
    <LegalSection title="Generated plans require review"><p>Treeschool uses automated and AI-assisted processing. Generated sequencing, page ranges, summaries, and PDFs may contain mistakes or omissions. They are planning aids—not educational, legal, medical, or professional advice. A parent remains responsible for reviewing plans and deciding what is appropriate for the student.</p></LegalSection>
    <LegalSection title="Acceptable use"><p>Do not upload unlawful or harmful material, malware, material that infringes another person’s rights, or instructions intended to bypass or attack the service. Do not probe, overload, resell, or interfere with Treeschool.</p></LegalSection>
    <LegalSection title="Payments"><p>Prices and purchase terms are shown before checkout. Payments are processed by Stripe. Subscriptions continue until canceled according to the checkout terms. Our <Link href="/refunds" className="font-semibold text-earth underline">Refund Policy</Link> applies to purchase disputes and processing failures.</p></LegalSection>
    <LegalSection title="Availability and liability"><p>We work to keep Treeschool available but do not guarantee uninterrupted or error-free operation. To the extent permitted by law, Treeschool is provided “as is,” and liability is limited to the amount paid for the affected service. Rights that cannot legally be excluded remain unaffected.</p></LegalSection>
    <LegalSection title="Suspension and termination"><p>We may restrict accounts that threaten the service, violate these terms, or fail payment. You may stop using Treeschool and request account deletion. Provisions that reasonably need to survive termination will remain in effect.</p></LegalSection>
  </LegalLayout>;
}
