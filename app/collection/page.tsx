import Link from 'next/link';
import { ArrowRight, Coins, FolderHeart, Layers } from 'lucide-react';
import { collectionStats } from '@/lib/catalog';
import CatalogView from '@/components/catalog-view';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma collection — Coffre à Timbres' };
export default async function CollectionPage({ searchParams }: { searchParams: Record<string,string> }) {
  const stats = await collectionStats();
  return <><div className="eyebrow">VOTRE ALBUM PERSONNEL</div><div className="page-heading"><div><h1>Ma collection</h1><p className="subtitle">Des découvertes, des souvenirs, et des trésors à conserver.</p></div><Link href="/" className="button">Enrichir ma collection <ArrowRight size={15}/></Link></div><div className="stats"><div className="stat"><span className="stat-icon"><FolderHeart size={22}/></span><div><strong>{stats.count}</strong><span className="stat-label">Timbres différents</span></div></div><div className="stat"><span className="stat-icon"><Layers size={22}/></span><div><strong>{stats.quantity}</strong><span className="stat-label">Exemplaires possédés</span></div></div><div className="stat"><span className="stat-icon"><Coins size={22}/></span><div><strong>{stats.total_value === null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(stats.total_value)}</strong><span className="stat-label">{stats.total_value === null ? 'Valeur non renseignée' : 'Valeur connue en euros'}</span></div></div></div>{stats.valued_count < stats.count && <p className="notice">{stats.count - stats.valued_count} notice(s) sans estimation. Le total ne couvre que les valeurs connues en euros ; la valeur faciale n’est pas une cote.</p>}<CatalogView collection params={new URLSearchParams(searchParams)}/></>;
}
