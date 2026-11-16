// Scelta del lettore video: nativo (ExoPlayer / AVPlay) se disponibile e non disattivato nelle impostazioni.
import { settings } from '../../core/store.js';
import { exoAvailable, exoBackend } from './exo.js';
import { avplayAvailable, avplayBackend } from './avplay.js';
import { fakeAvailable, fakeBackend } from './fake.js';
import { tr } from '../../core/i18n.js';
let cached = null;
export function nativeBackend() {
  if (settings().videoEngine === 'web') return null;
  if (cached) return cached;
  if (fakeAvailable()) cached = fakeBackend();
  else if (exoAvailable()) cached = exoBackend();
  else if (avplayAvailable()) cached = avplayBackend();
  return cached;
}
export function nativeName() { return exoAvailable() ? 'ExoPlayer' : avplayAvailable() ? 'AVPlay' : fakeAvailable() ? tr('Prova') : ''; }
