'use client';
import { useState } from 'react';
import { Stamp } from 'lucide-react';
export default function StampImage({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="prose"><Stamp size={38}/><span>Illustration indisponible</span></span> : <img src={`/api/image/${id}`} alt={title} loading="lazy" onError={() => setFailed(true)}/>;
}
