import type { Medal } from './api';

/** Fila global de medalhas recém-conquistadas, exibidas pelo <MedalCelebration/> */
let queue: Medal[] = [];
const listeners = new Set<() => void>();

export function celebrate(medals: Medal[] | undefined | null) {
  if (!medals?.length) return;
  const known = new Set(queue.map((m) => m.id));
  queue = [...queue, ...medals.filter((m) => !known.has(m.id))];
  listeners.forEach((l) => l());
}

export function nextMedal(): Medal | null {
  return queue[0] ?? null;
}

export function dismissMedal() {
  queue = queue.slice(1);
  listeners.forEach((l) => l());
}

export function onCelebrate(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
