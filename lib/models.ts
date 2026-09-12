'use client';
import { MODELS, type EmbeddingKind } from './types';
let visualModel: Promise<import('@tensorflow-models/mobilenet').MobileNet> | undefined;
let semanticModel: Promise<import('@xenova/transformers').FeatureExtractionPipeline> | undefined;
async function mobileNet() {
  if (!visualModel) visualModel = (async () => {
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const { load } = await import('@tensorflow-models/mobilenet');
    return load({ version: 2, alpha: 1 });
  })().catch(error => { visualModel = undefined; throw error; });
  return visualModel;
}
async function miniLM() {
  if (!semanticModel) semanticModel = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    return pipeline('feature-extraction', MODELS.semantic, { quantized: true });
  })().catch(error => { semanticModel = undefined; throw error; });
  return semanticModel;
}
export async function embedImage(image: HTMLImageElement | HTMLCanvasElement) {
  const model = await mobileNet(), tensor = model.infer(image, true);
  try { return Array.from(await tensor.data()); } finally { tensor.dispose(); }
}
export async function embedText(text: string) {
  const model = await miniLM();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => { image.src = ''; reject(new Error('Le chargement de l’image a expiré.')); }, 20000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Cette image ne peut pas être lue.')); };
    image.src = src;
  });
}
export type IndexProgress = { done: number; total: number; failed: number };
export async function prepareCatalog(kind: EmbeddingKind, report: (progress: IndexProgress) => void, signal: AbortSignal) {
  const response = await fetch(`/api/embeddings?kind=${kind}`, { signal });
  if (!response.ok) throw new Error('Impossible de lire la préparation du catalogue.');
  const { ready, pending } = await response.json() as { ready: string[]; pending: { id: string; title: string; description: string; series: string; year: number }[] };
  let done = ready.length, failed = 0; const total = done + pending.length;
  report({ done, total, failed });
  if (!pending.length) return;
  if (kind === 'visual') await mobileNet(); else await miniLM();
  for (const stamp of pending) {
    if (signal.aborted) throw new DOMException('Préparation arrêtée.', 'AbortError');
    let vector: number[];
    try { vector = kind === 'visual' ? await embedImage(await loadImage(`/api/image/${stamp.id}`)) : await embedText(`${stamp.title}. ${stamp.description}`); }
    catch { failed++; report({ done, total, failed }); continue; }
    const saved = await fetch('/api/embeddings', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, model: MODELS[kind], items: [{ id: stamp.id, vector }] }) });
    if (!saved.ok) throw new Error('Impossible d’enregistrer les vecteurs du catalogue.');
    done++; report({ done, total, failed });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
