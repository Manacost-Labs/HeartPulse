import '../../../../../../src/route-parchment.css';
import '../../../../../../src/features/TraditionalModeBanner.css';
import { battlegroundDetailMetadata, battlegroundDetailPage,
  type BattlegroundDetailProps } from '../../../../lib/battlegroundLibraryDetailRoute';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: BattlegroundDetailProps) {
  return battlegroundDetailMetadata(props, 'current');
}

export default async function Page(props: BattlegroundDetailProps) {
  return battlegroundDetailPage(props, 'current');
}
