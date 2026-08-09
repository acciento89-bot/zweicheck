(() => {
  'use strict';

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let openedCheckId = '';

  function requestedCheckId() {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('check') || '';
    return UUID_PATTERN.test(value) ? value : '';
  }

  function openRequestedCheck() {
    const checkId = requestedCheckId();
    if (!checkId || checkId === openedCheckId) return;
    if (!document.querySelector('.app-shell')) return;

    openedCheckId = checkId;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.checkId = checkId;
    trigger.setAttribute('aria-hidden', 'true');
    document.body.append(trigger);
    trigger.click();
    trigger.remove();
    window.history.replaceState({}, '', '/');
  }

  const observer = new MutationObserver(openRequestedCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('hashchange', () => {
    openedCheckId = '';
    openRequestedCheck();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openRequestedCheck, { once: true });
  } else {
    openRequestedCheck();
  }
})();
