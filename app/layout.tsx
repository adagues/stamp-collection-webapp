import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Coffre à Timbres', description: 'Votre collection, une histoire à chaque timbre.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
