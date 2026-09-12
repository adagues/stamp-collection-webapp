import { NextResponse } from 'next/server';
import { InputError } from './collection';
export function apiError(error: unknown) {
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.message === 'Timbre introuvable.' ? 404 : 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Le contenu envoyé est invalide.' }, { status: 400 });
  return NextResponse.json({ error: 'Impossible de terminer cette opération. Réessayez.' }, { status: 500 });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expectedHost = request.headers.get('host') || new URL(request.url).host;
  const protocol = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.slice(0, -1);
  if (origin !== `${protocol}://${expectedHost}`) throw new InputError('Origine de la requête refusée.');
}
