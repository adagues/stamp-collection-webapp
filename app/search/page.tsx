import SearchWorkbench from '@/components/search-workbench';
export const metadata = { title: 'Identifier et rechercher — Coffre à Timbres' };
export default function SearchPage() {
  return <><div className="eyebrow">UN NOUVEAU REGARD SUR VOS TIMBRES</div><div className="page-heading"><div><h1>À chaque timbre, une piste.</h1><p className="subtitle">Retrouvez une émission par ses mots, son histoire ou son image.</p></div></div><SearchWorkbench/></>;
}
