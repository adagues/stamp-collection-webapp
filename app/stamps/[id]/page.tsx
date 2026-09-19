import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getStamp } from '@/lib/catalog';
import CollectionEditor from '@/components/collection-editor';
import StampImage from '@/components/stamp-image';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `${(await getStamp(params.id))?.title || 'Timbre introuvable'} — Coffre à Timbres` };
}
export default async function StampDetail({ params }: { params: { id: string } }) {
  const stamp = await getStamp(params.id); if (!stamp) notFound();
  return <><Link href="/" className="back-link"><ArrowLeft size={15}/>Retour au catalogue</Link><div className="detail-grid"><div><div className="detail-image"><StampImage id={stamp.id} title={stamp.title}/></div><p className="prose">{stamp.image_credit}</p></div><div><div className="eyebrow">{stamp.country} · {stamp.year}</div><h1>{stamp.title}</h1><p className="prose">{stamp.description}</p><dl className="detail-facts">{[
    ['Série', stamp.series], ['Année d’émission', stamp.year], ['Valeur faciale', stamp.denomination || 'Non renseignée'], ['Numéro Y&T · source externe', stamp.catalog_number || 'Non renseigné'], ['Pays', stamp.country], ['Valeur estimée', stamp.estimated_value === null ? 'Non renseignée' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: stamp.currency }).format(stamp.estimated_value)]
  ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><section className="panel"><h2>Dans mon album</h2><p className="prose">Conservez la quantité et votre propre référence de classement.</p><CollectionEditor id={stamp.id} initial={{ owned: stamp.owned, quantity: stamp.quantity, personal_reference: stamp.personal_reference }}/></section><p className="prose"><a href={stamp.source_url} target="_blank" rel="noreferrer">Consulter la notice source <ExternalLink size={12} style={{ display: 'inline' }}/></a></p></div></div><div className="notice">Les références et illustrations aident au classement. Elles ne constituent ni une expertise ni une estimation certifiée.</div></>;
}
