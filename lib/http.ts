import { NextResponse } from 'next/server';
import { InputError } from './collection';
export function apiError(error: unknown) {
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.message === 'Timbre introuvable.' ? 404 : 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Le contenu envoyé est invalide.' }, { status: 400 });
  return NextResponse.json({ error: 'Impossible de terminer cette opération. Réessayez.' }, { status: 500 });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new InputError('Origine de la requête refusée.');
}
