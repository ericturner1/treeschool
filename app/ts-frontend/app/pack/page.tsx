import { permanentRedirect } from "next/navigation";

export default function LegacyPackPage() {
  permanentRedirect("/homeschool-lesson-plan-generator");
}
