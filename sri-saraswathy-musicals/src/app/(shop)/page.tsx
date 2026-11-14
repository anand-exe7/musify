import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { BestSellers } from "@/components/home/BestSellers";
import { Categories } from "@/components/home/Categories";
import { LazyPlayable } from "@/components/home/LazyPlayable";
import { Story } from "@/components/home/Story";
import { Gallery } from "@/components/home/Gallery";
import { Testimonials } from "@/components/home/Testimonials";
import { Inquiry } from "@/components/home/Inquiry";
import { Visit } from "@/components/home/Visit";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <BestSellers />
      <Categories />
      <LazyPlayable />
      <Story />
      <Gallery />
      <Testimonials />
      <Inquiry />
      <Visit />
    </>
  );
}
