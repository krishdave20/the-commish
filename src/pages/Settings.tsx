import { useLeagueBundle } from '../app/hooks';
import { PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { CommissionersOffice } from '../components/art/CommissionersOffice';
import { PageHeader } from '../components/PageHeader';
import { AppearanceSection } from './settings/AppearanceSection';
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
      <div className="art-head">
        <PageHeader kicker={PAGES.settings.kicker} title={PAGES.settings.name} data={bundle} />
        <CommissionersOffice className="art-head-office" size={136} />
      </div>
      <div className="accordion">
        <LinkedAccountsSection />
        <AppearanceSection />
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
