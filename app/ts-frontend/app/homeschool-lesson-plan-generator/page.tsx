import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "K–4 Homeschool Lesson Plan Generator | Treeschool",
  description:
    "Build an elementary homeschool plan for grades K–4. Upload curriculum PDFs and turn them into organized, printable weekly lesson plans for every subject and teaching day.",
  alternates: {
    canonical: "/homeschool-lesson-plan-generator"
  }
};

export { default } from "../pack/generator-page";
