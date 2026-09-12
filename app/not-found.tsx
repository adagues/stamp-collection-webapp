import Link from 'next/link';
export default function NotFound() { return <div className="empty"><h1>Cette page reste à collectionner.</h1><p>Le timbre ou la page demandé est introuvable.</p><Link href="/" className="button">Retour au catalogue</Link></div>; }
