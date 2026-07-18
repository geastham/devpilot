import { MissionControl } from '@/components/layouts';

// Deep-link route for the Mission Control layout (DESIGN.md §12.1).
// The home page also renders this layout when layoutVariant is
// 'mission-control'; this route pins it regardless of the saved variant.
export default function MissionControlPage() {
  return <MissionControl />;
}
