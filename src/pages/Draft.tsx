import { PlaceholderPage } from '../components/PlaceholderPage';

const ITEMS = [
  "Rankings: season projections scored with your league settings, value over replacement and tiers, with ADP",
  "Mock draft: pick at your real slot against bots that draft by ADP plus noise and roster need",
  "Live assistant: best available by value and tier, positional runs, your needs and value versus ADP on every pick",
  "Dynasty: startup drafts and rookie drafts with FantasyCalc values",
];

export default function Draft() {
  return (
    <PlaceholderPage
      page="draft"
      milestone={5}
      milestoneName="Draft: rankings, mock draft, live assistant"
      items={ITEMS}
    />
  );
}
