'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
export default function CameraCapture({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream>(), cancelled = useRef(false);
  const [active, setActive] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  function stop() { cancelled.current = true; stream.current?.getTracks().forEach(track => track.stop()); stream.current = undefined; setActive(false); setReady(false); }
  useEffect(() => () => { cancelled.current = true; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => { if (active && video.current && stream.current) video.current.srcObject = stream.current; }, [active]);
  async function start() {
    setError(''); cancelled.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (cancelled.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setActive(true);
    } catch { setError('Caméra inaccessible. Autorisez son accès sur HTTPS ou localhost, ou importez une photo.'); }
  }
  function capture() {
    if (!video.current?.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    canvas.getContext('2d')!.drawImage(video.current, 0, 0);
    canvas.toBlob(blob => { if (blob) onCapture(blob); stop(); }, 'image/jpeg', .9);
  }
  return <div>{!active ? <button type="button" className="button secondary small" onClick={start}><Camera size={15}/>Utiliser la caméra</button> : <><video ref={video} autoPlay playsInline muted className="preview" onLoadedData={() => setReady(true)} aria-label="Aperçu de la caméra"/><div className="search-actions"><button type="button" className="button small" disabled={!ready} onClick={capture}><Camera size={15}/>Prendre la photo</button><button type="button" className="button secondary small" onClick={stop}><X size={15}/>Fermer</button></div></>}{error && <p role="alert" className="error">{error}</p>}</div>;
}
