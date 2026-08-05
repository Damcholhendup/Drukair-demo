import BoardingSection from "@/components/BoardingSection";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import OnboardingJourney from "@/components/OnboardingJourney";
import ScrollProgress from "@/components/ScrollProgress";
import SeedRecords from "@/components/SeedRecords";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <OnboardingJourney />
        <BoardingSection />
        {/* Demo-only: seeds which ID Numbers can be issued a credential. */}
        <SeedRecords />
      </main>
      <SiteFooter />
    </>
  );
}
