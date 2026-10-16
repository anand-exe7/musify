import { Hero } from "@/components/home/Hero";
import { Categories } from "@/components/home/Categories";
import { Featured } from "@/components/home/Featured";
import { LazyPlayable } from "@/components/home/LazyPlayable";
import { Story } from "@/components/home/Story";
import { Testimonials } from "@/components/home/Testimonials";
import { Visit } from "@/components/home/Visit";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Categories />
      <Featured />
      <LazyPlayable />
      <Story />
      <Testimonials />
      <Visit />
    </>
  );
}
