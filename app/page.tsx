import Link from 'next/link';
import { Camera, FolderHeart, Library, MapPin } from 'lucide-react';
import { catalogFilters, collectionStats } from '@/lib/catalog';
import CatalogView from '@/components/catalog-view';
export const dynamic = 'force-dynamic';
export default function Home({ searchParams }: { searchParams: Record<string,string> }) {
  const filters = catalogFilters(), stats = collectionStats();
  return <><div className="eyebrow"><span className="flag"/> LE PATRIMOINE POSTAL FRANÇAIS</div><div className="page-heading"><div><h1>Une petite fenêtre sur l’histoire.</h1><p className="subtitle">Explorez les timbres de France, retrouvez vos trésors et faites grandir votre collection.</p></div><Link className="button" href="/search"><Camera size={16}/>Identifier un timbre</Link></div>
    <div className="stats"><div className="stat"><span className="stat-icon"><Library size={21}/></span><div><strong>{filters.total}</strong><span className="stat-label">Timbres au catalogue</span></div><span className="stat-note">À explorer</span></div><div className="stat"><span className="stat-icon"><FolderHeart size={21}/></span><div><strong>{stats.count}</strong><span className="stat-label">Dans ma collection</span></div><span className="stat-note">Votre histoire</span></div><div className="stat"><span className="stat-icon"><MapPin size={21}/></span><div><strong>{Math.min(...filters.years)} — {Math.max(...filters.years)}</strong><span className="stat-label">Années représentées</span></div></div></div>
    <CatalogView params={new URLSearchParams(searchParams)}/></>;
}
