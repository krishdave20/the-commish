import { PlaceholderPage } from '../components/PlaceholderPage';

const ITEMS = [
  "Search across all players",
  "Game log and usage trends: snap %, target share, air yards, red zone",
  "FTN charting splits and 2025 coverage and route splits, labeled as last season",
  "Next 4 opponents with matchup grades, and the projection with floor and ceiling",
  "Redraft rest-of-season value, dynasty value and its 30-day trend",
  "An Add to watchlist button",
];

export default function Players() {
  return (
    <PlaceholderPage
      page="players"
      milestone={3}
      milestoneName="nflverse ingestion and ID joins"
      items={ITEMS}
    />
  );
}
