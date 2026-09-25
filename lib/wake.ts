// Keeps a device's screen from going to sleep (browser only): the big-screen
// laptop, and the phone filming the live camera. Phones and browsers can drop
// the request at any time (a notification, battery saver, a quick switch to
// another app), so we keep asking again for as long as it's needed.

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void };
type WakeNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };

export function canKeepAwake(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as WakeNav).wakeLock;
}

/** Keep the screen awake until the returned function is called. */
export function keepAwake(): () => void {
  const nav = navigator as WakeNav;
  if (!nav.wakeLock) return () => {};
  let lock: Sentinel | null = null;
  let stopped = false;
  let asking = false;
  const ask = async () => {
    if (stopped || asking || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    asking = true;
    try {
      lock = await nav.wakeLock!.request('screen');
      lock.addEventListener('release', () => {
        // Dropped by the phone: ask again straight away (or as soon as the page is back in view).
        if (!stopped) setTimeout(ask, 1000);
      });
      if (stopped) lock.release().catch(() => {});
    } catch {
      // Not allowed right now (e.g. battery saver): try again shortly.
    } finally {
      asking = false;
    }
  };
  ask();
  document.addEventListener('visibilitychange', ask);
  const timer = setInterval(ask, 20_000); // belt and braces
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', ask);
    lock?.release().catch(() => {});
  };
}
