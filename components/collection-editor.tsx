'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Save } from 'lucide-react';
import type { CollectionEntry } from '@/lib/types';
export default function CollectionEditor({ id, initial, onSaved }: { id: string; initial: CollectionEntry; onSaved?: (entry: CollectionEntry) => void }) {
  const [entry, setEntry] = useState(initial), [saving, setSaving] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const router = useRouter();
  useEffect(() => { setEntry(initial); }, [initial.owned, initial.quantity, initial.personal_reference]);
  async function save(next = entry) {
    setSaving(true); setError(''); setStatus('');
    try {
      const response = await fetch(`/api/collection/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Enregistrement impossible.'); return; }
      setEntry(data); onSaved?.(data); setStatus('Enregistré'); router.refresh();
    } catch { setError('Enregistrement impossible. Vérifiez votre connexion et réessayez.'); }
    finally { setSaving(false); }
  }
  return <form className="collection-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="owned-line"><label><input type="checkbox" checked={entry.owned} disabled={saving} onChange={event => {
      const next = { ...entry, owned: event.target.checked, quantity: event.target.checked ? Math.max(1, entry.quantity) : 0 }; setEntry(next); void save(next);
    }}/>{entry.owned ? 'Dans ma collection' : 'Ajouter à ma collection'}</label>
    <input className="quantity-input" type="number" aria-label="Quantité possédée" min="0" max="9999" step="1" value={entry.quantity} disabled={saving} onChange={event => { const quantity = Number(event.target.value); setEntry({ ...entry, quantity, owned: quantity > 0 }); setStatus(''); }}/></div>
    <div className="editor-extra"><input aria-label="Référence personnelle" placeholder="Ma référence personnelle…" maxLength={500} value={entry.personal_reference} disabled={saving} onChange={event => { setEntry({ ...entry, personal_reference: event.target.value }); setStatus(''); }}/><button type="submit" aria-label="Enregistrer la collection" title="Enregistrer" disabled={saving}>{status ? <Check size={13}/> : <Save size={13}/>}</button></div>
    <p role="status" className="save-status">{saving ? 'Enregistrement…' : status}</p>{error && <p role="alert" className="error">{error}</p>}
  </form>;
}
