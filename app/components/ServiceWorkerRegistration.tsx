'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;
    const versionKey = 'clawini:buildId';
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      registration?.update().catch(() => {});
      fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(payload => {
          if (!payload?.version) return;
          const previous = sessionStorage.getItem(versionKey);
          sessionStorage.setItem(versionKey, payload.version);
          if (previous && previous !== payload.version && !reloading) {
            reloading = true;
            window.location.reload();
          }
        })
        .catch(() => {});
    };
    const timer = window.setInterval(checkForUpdate, 15 * 60 * 1000);

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        checkForUpdate();
      })
      .catch((error) => console.error('Service worker registration failed:', error));
    document.addEventListener('visibilitychange', checkForUpdate);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  return null;
}
