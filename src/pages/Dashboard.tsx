import { GrowthDashboard } from '../features/growth';
import type { UserProfile } from '../types';

export default function Dashboard({
  profile,
  percent,
}: {
  profile?: UserProfile;
  percent: number;
}) {
  return <GrowthDashboard profile={profile} percent={percent} />;
}
