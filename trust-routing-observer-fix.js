(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__ZWEICHECK_TRUST_OBSERVER_FIX__) return;

  window.__ZWEICHECK_TRUST_OBSERVER_FIX__ = 'v1';

  class TrustRoutingScopedObserver extends NativeMutationObserver {
    observe(target, options = {}) {
      const isLegacyTrustObserver = target === document.documentElement
        && options.childList === true
        && options.subtree === true;

      if (isLegacyTrustObserver) {
        const appRoot = document.getElementById('app');
        window.MutationObserver = NativeMutationObserver;

        if (appRoot) {
          return super.observe(appRoot, { childList: true });
        }
      }

      window.MutationObserver = NativeMutationObserver;
      return super.observe(target, options);
    }
  }

  window.MutationObserver = TrustRoutingScopedObserver;
})();
