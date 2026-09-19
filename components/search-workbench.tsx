'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search, Sparkles, Upload, X } from 'lucide-react';
import type { EmbeddingKind, StampView } from '@/lib/types';
import type { IndexProgress } from '@/lib/models';
import StampCard from './stamp-card';
import CameraCapture from './camera';
class SearchError extends Error {}
export default function SearchWorkbench() {
  const [text, setText] = useState(''), [photo, setPhoto] = useState(''), [busy, setBusy] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [items, setItems] = useState<StampView[] | null>(null);
  const [progress, setProgress] = useState<IndexProgress | null>(null), [counts, setCounts] = useState({ visual: 0, semantic: 0, total: 0, visualTotal: 0, unavailable: 0 });
  const [countsReady, setCountsReady] = useState(false);
  const controller = useRef<AbortController>(), photoUrl = useRef('');
  async function refreshCounts() {
    try {
      const [visual, semantic] = await Promise.all(['visual','semantic'].map(async kind => {
        const response = await fetch(`/api/embeddings?kind=${kind}`); if (!response.ok) throw new Error(); return response.json();
      }));
      // Stamps without an illustration are not part of the visual total: counting them
      // would advertise a target that can never be reached.
      setCounts({ visual: visual.ready.length, semantic: semantic.ready.length,
        total: semantic.ready.length + semantic.pending.length,
        visualTotal: visual.ready.length + visual.pending.length,
        unavailable: (visual.unavailable ?? []).length });
      setCountsReady(true);
    } catch { setError('L’état de préparation du catalogue est indisponible. Réessayez.'); }
  }
  useEffect(() => { void refreshCounts(); return () => { controller.current?.abort(); URL.revokeObjectURL(photoUrl.current); }; }, []);
  function selectPhoto(blob: Blob) {
    setError('');
    if (!['image/jpeg','image/png','image/webp'].includes(blob.type) || blob.size > 10_000_000) { setError('Choisissez une image JPEG, PNG ou WebP de moins de 10 Mo.'); return; }
    URL.revokeObjectURL(photoUrl.current); photoUrl.current = URL.createObjectURL(blob); setPhoto(photoUrl.current); setItems(null);
  }
  async function prepare(kind: EmbeddingKind) {
    setBusy(kind); setError(''); setMessage('Chargement du modèle. Le premier téléchargement peut prendre quelques minutes…');
    controller.current = new AbortController();
    try {
      const { prepareCatalog } = await import('@/lib/models');
      await prepareCatalog(kind, value => { setProgress(value); setMessage(`Préparation : ${value.done} / ${value.total}. ${value.failed ? `${value.failed} illustration(s) ou notice(s) non traitée(s). ` : ''}${value.unavailable ? `${value.unavailable} notice(s) sans illustration, hors décompte.` : ''}`); }, controller.current.signal);
      if (!controller.current.signal.aborted) setMessage('Préparation terminée. Les notices non traitées peuvent être relancées.');
    } catch (error) { setError(error instanceof DOMException && error.name === 'AbortError' ? 'Préparation arrêtée. Les vecteurs déjà calculés sont conservés.' : 'Le modèle n’a pas pu être préparé. Vérifiez la connexion ; le catalogue et la recherche par mots restent disponibles.'); }
    finally { setBusy(''); await refreshCounts(); }
  }
  async function search(kind?: EmbeddingKind) {
    setBusy('search'); setError(''); setMessage('Recherche en cours…'); setItems(null);
    try {
      let vector: number[] | undefined;
      if (kind) {
        if (counts[kind] === 0) throw new SearchError('Préparez d’abord le catalogue avec le bouton correspondant ci-dessous.');
        try {
          const { embedImage, embedText, loadImage } = await import('@/lib/models');
          vector = kind === 'visual' ? await embedImage(await loadImage(photo)) : await embedText(text);
        } catch {
          if (kind === 'visual') throw new SearchError('Le modèle visuel est indisponible. Réessayez ou parcourez le catalogue manuellement.');
          setError('Le modèle sémantique est indisponible. Voici les résultats par mots-clés.'); kind = undefined;
        }
      }
      const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: kind === 'visual' ? '' : text, kind, vector }) });
      const data = await response.json(); if (!response.ok) throw new SearchError(data.error || 'Recherche impossible.');
      setItems(data.items); setMessage(kind === 'visual' ? 'Candidats classés par ressemblance visuelle, sans garantie d’identification.' : kind === 'semantic' ? 'Résultats combinant les mots-clés et le sens de votre recherche.' : 'Résultats par mots-clés.');
    } catch (error) { setError(error instanceof SearchError ? error.message : 'Recherche impossible. Vérifiez votre connexion et réessayez.'); setMessage(''); }
    finally { setBusy(''); }
  }
  return <><div className="search-layout"><section className="panel"><h2>Les mots pour le trouver</h2><p className="prose">Un nom, une couleur ou une idée : « paysages de montagne », « symboles de la République »…</p><form onSubmit={event => { event.preventDefault(); void search(); }}><label className="sr-only" htmlFor="meaning">Votre recherche</label><div className="search-form"><input id="meaning" value={text} maxLength={500} onChange={event => setText(event.target.value)} placeholder="Que recherchez-vous ?"/><button className="button" disabled={!!busy || !text.trim()}><Search size={15}/>Rechercher</button></div><div className="search-actions"><button type="button" className="button secondary small" disabled={!!busy || !countsReady || !text.trim()} onClick={() => search('semantic')}><Sparkles size={15}/>Rechercher par le sens</button></div></form><p className="prose">Les mots-clés fonctionnent immédiatement. La recherche par le sens utilise MiniLM, un modèle multilingue.</p></section>
    <section className="panel"><h2>Une image pour le reconnaître</h2><label className="dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) selectPhoto(file); }}><ImagePlus size={32}/><strong>Déposez votre photo ici</strong><span>Un timbre cadré de près, bien éclairé et vu de face.</span><span className="button secondary small">Choisir une image</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Importer une photo de timbre" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; if (file) selectPhoto(file); event.target.value = ''; }}/></label>{photo && <img className="preview" src={photo} alt="Photo du timbre à identifier"/>}<div className="search-actions"><CameraCapture onCapture={selectPhoto}/>{photo && <button className="button small" disabled={!!busy || !countsReady} onClick={() => search('visual')}><Search size={15}/>Trouver les ressemblances</button>}</div></section></div>
    <div className="notice">Votre photo reste dans le navigateur. Seul son vecteur numérique est envoyé au serveur. La ressemblance proposée est approximative : elle ne certifie ni l’authenticité, ni la variété, ni la valeur d’un timbre.</div>
    <section className="panel"><div className="index-status"><Sparkles size={21}/><p><strong>Préparer les outils de recherche</strong><br/>Images : {counts.visual} / {counts.visualTotal} · Textes : {counts.semantic} / {counts.total}.{counts.unavailable ? ` ${counts.unavailable} notice(s) sans illustration ne peuvent pas être indexées par l’image.` : ''} Les calculs sont conservés dans votre base Turso/libSQL.</p><button className="button secondary small" disabled={!!busy} onClick={() => prepare('visual')}><Upload size={14}/>Préparer les images</button><button className="button secondary small" disabled={!!busy} onClick={() => prepare('semantic')}><Sparkles size={14}/>Préparer les textes</button>{busy && busy !== 'search' && <button className="button secondary small" onClick={() => controller.current?.abort()}><X size={14}/>Arrêter</button>}</div>{progress && <progress max={progress.total || 1} value={progress.done} aria-label="Progression de la préparation"/>}<p className="prose">Au premier usage, les modèles sont téléchargés dans le navigateur. Gardez cette page ouverte pendant la préparation ; vous pourrez la reprendre plus tard.</p></section>
    <p role="status" className="prose">{message}</p>{error && <div role="alert" className="notice"><p className="error">{error}</p><Link href="/" style={{ textDecoration: 'underline' }}>Parcourir le catalogue</Link></div>}{items && <section className="search-results"><h2>{items.length} résultat{items.length !== 1 ? 's' : ''}</h2>{items.length ? <div className="stamp-grid">{items.map((stamp,index) => <StampCard key={stamp.id} stamp={stamp} score={index}/>)}</div> : <div className="empty"><Search size={35}/><h2>Aucun résultat pour le moment</h2><p>Essayez d’autres mots ou préparez les vecteurs du catalogue.</p><Link className="button secondary" href="/">Explorer le catalogue</Link></div>}</section>}</>;
}
