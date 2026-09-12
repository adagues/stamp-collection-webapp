export type Stamp = {
  id: string; title: string; country: string; year: number; series: string;
  denomination: string; description: string; image_url: string; image_credit: string;
  source_url: string; catalog_number: string | null; estimated_value: number | null; currency: string;
};
export type CollectionEntry = { owned: boolean; quantity: number; personal_reference: string };
export type StampView = Stamp & CollectionEntry;
export type EmbeddingKind = 'visual' | 'semantic';
export const MODELS = { visual: 'mobilenet-v2-1.0', semantic: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' } as const;
export const DIMENSIONS = { visual: 1280, semantic: 384 };
