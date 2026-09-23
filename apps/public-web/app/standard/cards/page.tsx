import { CardCatalogPage, catalogMetadata, type CatalogSearch } from '../../../ui/CardCatalogPage';
export const dynamic = 'force-dynamic';
export function generateMetadata({ searchParams }: { searchParams: CatalogSearch }) {
  return catalogMetadata('standard', '/standard/cards/', searchParams);
}
export default function Page({ searchParams }: { searchParams: CatalogSearch }) {
  return <CardCatalogPage format="standard" pathname="/standard/cards/" searchParams={searchParams} />;
}
