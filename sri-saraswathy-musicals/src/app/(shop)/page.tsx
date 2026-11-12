import { Hero } from "@/components/home/Hero";
import { BestSellers } from "@/components/home/BestSellers";
import { Categories } from "@/components/home/Categories";
import { LazyPlayable } from "@/components/home/LazyPlayable";
import { Story } from "@/components/home/Story";
import { Testimonials } from "@/components/home/Testimonials";
import { Inquiry } from "@/components/home/Inquiry";
import { Visit } from "@/components/home/Visit";

export default function HomePage() {
  return (
    <>
      <Hero />
      <BestSellers />
      <Categories />
      <LazyPlayable />
      <Story />
      <Testimonials />
      <Inquiry />
      <Visit />
    </>
  );
}
