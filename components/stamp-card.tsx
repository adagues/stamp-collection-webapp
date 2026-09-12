import Link from 'next/link';
import { Check } from 'lucide-react';
import type { StampView } from '@/lib/types';
import CollectionEditor from './collection-editor';
import StampImage from './stamp-image';
export default function StampCard({ stamp, score }: { stamp: StampView; score?: number }) {
  return <article className="stamp-card"><Link href={`/stamps/${stamp.id}`} className="stamp-picture"><span className="stamp-year">{stamp.year}</span>{stamp.owned && <span className="owned-badge" aria-label="Possédé"><Check size={14}/></span>}<StampImage id={stamp.id} title={stamp.title}/></Link>
    <div className="stamp-info"><div className="stamp-series">{stamp.series}</div><Link href={`/stamps/${stamp.id}`}><h3>{stamp.title}</h3></Link><div className="stamp-meta"><span>{stamp.catalog_number ? `N° ${stamp.catalog_number}` : 'N° non renseigné'}</span><span>{stamp.denomination || stamp.country}</span></div></div>
    {score !== undefined && <p className="score">Rang de similarité : {score + 1}</p>}<CollectionEditor id={stamp.id} initial={{ owned: stamp.owned, quantity: stamp.quantity, personal_reference: stamp.personal_reference }}/>
  </article>;
}
