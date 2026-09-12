import type { Metadata } from 'next';
import './globals.css';
import Shell from '@/components/shell';
export const metadata: Metadata = { title: 'Coffre à Timbres', description: 'Votre collection, une histoire à chaque timbre.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body><Shell>{children}</Shell></body></html>;
}
