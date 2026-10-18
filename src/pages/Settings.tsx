import { useLeagueBundle } from '../app/hooks';
import { PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { AboutSection } from './settings/AboutSection';
import { AttributionSection } from './settings/AttributionSection';
import { CacheSection } from './settings/CacheSection';
import { HealthSection } from './settings/HealthSection';
import { LeagueSection } from './settings/LeagueSection';
import { LinkedAccountsSection } from './settings/LinkedAccountsSection';
import { LosersSection } from './settings/LosersSection';
import { ScheduleSection } from './settings/ScheduleSection';

export default function Settings() {
  const bundle = useLeagueBundle();
  usePageTitle(PAGES.settings.path);
  return (
    <div className="page page-fade">
      <PageHeader kicker={PAGES.settings.kicker} title={PAGES.settings.name} data={bundle} />
      <div className="accordion">
        <LinkedAccountsSection />
        <LeagueSection />
      <ScheduleSection />
      <LosersSection />
      <CacheSection />
      <HealthSection />
      <AttributionSection />
      <AboutSection />
      </div>
    </div>
  );
}
