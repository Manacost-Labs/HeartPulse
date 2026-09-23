import { notFound } from 'next/navigation';
import { CardCatalogPage, catalogMetadata, type CatalogSearch } from '../../../../ui/CardCatalogPage';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ format: string }>; searchParams: CatalogSearch };
async function catalogRoute(params: Props['params']) {
  const { format } = await params;
  if (format !== 'standard' && format !== 'wild') notFound();
  return { format, pathname: `/standard/cards/${format}/` } as const;
}
export async function generateMetadata({ params, searchParams }: Props) {
  const { format, pathname } = await catalogRoute(params);
  return catalogMetadata(format, pathname, searchParams);
}
export default async function Page({ params, searchParams }: Props) {
  return <CardCatalogPage {...await catalogRoute(params)} searchParams={searchParams} />;
}
