import Link from 'next/link';
import { ArrowLeft, ArrowRight, Grid2X2, Search, SlidersHorizontal, Stamp } from 'lucide-react';
import { catalogFilters, listStamps } from '@/lib/catalog';
import StampCard from './stamp-card';
export default function CatalogView({ params, collection = false }: { params: URLSearchParams; collection?: boolean }) {
  if (collection) params.set('owned', '1');
  const result = listStamps(params), filters = catalogFilters();
  const base = collection ? '/collection' : '/';
  function pageLink(page: number) { const query = new URLSearchParams(params); query.set('page', String(page)); return `${base}?${query}`; }
  return <section aria-label="Liste des timbres"><div className="catalog-intro"><h2>{collection ? 'Mes timbres' : 'À la découverte du catalogue'}</h2><span>{collection ? 'Un patrimoine qui grandit' : 'De la première Cérès aux belles commémorations'}</span></div>
    <form className="filters" action={base}><label className="search-input"><Search size={16}/><input name="q" defaultValue={params.get('q') || ''} aria-label="Rechercher dans le catalogue" placeholder="Un timbre, une série, un mot-clé…"/></label>
      <select name="year" aria-label="Filtrer par année" defaultValue={params.get('year') || ''}><option value="">Toutes les années</option>{filters.years.map(year => <option key={year}>{year}</option>)}</select>
      <select name="series" aria-label="Filtrer par série" defaultValue={params.get('series') || ''}><option value="">Toutes les séries</option>{filters.series.map(series => <option key={series}>{series}</option>)}</select>
      <select name="sort" aria-label="Trier les timbres" defaultValue={params.get('sort') || ''}><option value="">Les plus anciens</option><option value="recent">Les plus récents</option><option value="title">Ordre alphabétique</option></select>
      <button className="button secondary" type="submit"><SlidersHorizontal size={14}/>Filtrer</button>
    </form>
    <div className="result-bar"><span><strong>{result.total} timbre{result.total !== 1 ? 's' : ''}</strong> {collection ? 'dans cette sélection' : 'à explorer'}{params.get('q') && <> · « {params.get('q')} »</>}</span><span className="view-icon">Vue en galerie <Grid2X2 size={17}/></span></div>
    {result.items.length ? <div className="stamp-grid">{result.items.map(stamp => <StampCard key={stamp.id} stamp={stamp}/>)}</div> : <div className="empty"><Stamp size={40}/><h2>{collection ? 'Votre album attend ses premiers timbres' : 'Aucun timbre trouvé'}</h2><p>{collection ? 'Cochez les timbres que vous possédez dans le catalogue pour les retrouver ici.' : 'Essayez un autre mot-clé ou élargissez vos filtres.'}</p><Link href="/" className="button secondary">Explorer le catalogue <ArrowRight size={15}/></Link></div>}
    {result.pages > 1 && <nav className="pagination" aria-label="Pagination">{result.page > 1 && <Link className="button secondary small" href={pageLink(result.page-1)}><ArrowLeft size={14}/>Précédent</Link>}<span>Page {result.page} sur {result.pages}</span>{result.page < result.pages && <Link className="button secondary small" href={pageLink(result.page+1)}>Suivant<ArrowRight size={14}/></Link>}</nav>}
  </section>;
}
