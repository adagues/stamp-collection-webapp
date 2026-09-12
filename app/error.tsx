'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h1>Une petite interruption.</h1><p>Impossible de charger cette page. Réessayez dans un instant.</p><button className="button" onClick={reset}>Réessayer</button></div>; }
