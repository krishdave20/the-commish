import { PlaceholderPage } from '../components/PlaceholderPage';

const ITEMS = [
  "Cards with a headline of 12 words or fewer and one stat line with the numbers, the comparison and the sample size",
  "A \"why it matters for you\" line when the player is on your roster, on waivers or on a trade target",
  "Detectors: usage spike, target hog, buy low, sell high, red-zone role change, waiver riser, dynasty mover",
  "Ranked by relevance: your players first, then waiver and trade targets, then league-wide; at most 3 per player per week",
  "Actions on every card: open the profile, watchlist, try it in the what-if lab or trade analyzer",
];

export default function Takes() {
  return (
    <PlaceholderPage
      page="takes"
      milestone={4}
      milestoneName="Takes feed and phase-aware Home"
      items={ITEMS}
    />
  );
}
