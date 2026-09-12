'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, BookOpen, Camera, ChevronRight, FolderHeart, Library, LockKeyhole, ScanLine, Sparkles, Stamp } from 'lucide-react';
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname === '/collection' ? 'Ma collection' : pathname === '/search' ? 'Identifier & rechercher' : 'Catalogue de France';
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Stamp size={26}/></span><span>Coffre à Timbres<small>LE PLAISIR DE COLLECTIONNER</small></span></Link>
      <div className="workspace"><span className="workspace-icon"><BookOpen size={19}/></span><div>Mon espace personnel<small>Chaque timbre a son histoire</small></div></div>
      <span className="nav-label">EXPLORER</span>
      <nav aria-label="Navigation principale">{[
        { href: '/', label: 'Le catalogue', icon: Library }, { href: '/collection', label: 'Ma collection', icon: FolderHeart },
        { href: '/search', label: 'Identifier un timbre', icon: ScanLine }
      ].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={(href === '/' ? pathname === '/' || pathname.startsWith('/stamps/') : pathname === href) ? 'nav-link active' : 'nav-link'}><Icon size={19}/>{label}<ChevronRight size={15}/></Link>)}</nav>
      <div className="sidebar-tip"><span className="tip-icon"><Sparkles size={20}/></span><h3>Une photo, une piste.</h3><p>Retrouvez les timbres qui ressemblent au vôtre.</p><Link href="/search">Essayer l’identification <ArrowUpRight size={16}/></Link></div>
      <div className="sidebar-bottom"><LockKeyhole size={17}/><span>Votre collection, chez vous.<small>Enregistrée sur votre serveur</small></span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div>Mon espace <ChevronRight size={13}/> <strong>{section}</strong></div><span className="private-label"><span/> Collection personnelle</span></header><main>{children}</main><footer><Stamp size={15}/> Coffre à Timbres <span>Les petites pièces d’une grande histoire.</span></footer></div>
  </div>;
}
