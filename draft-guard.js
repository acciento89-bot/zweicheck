(() => {
  'use strict';

  const FORM_SELECTOR = '#app form[data-form]';
  const FIELD_SELECTOR = 'input, textarea, select';
  const originalSetInterval = window.setInterval;
  let formDirty = false;

  function belongsToAppForm(target) {
    return target instanceof Element && Boolean(target.closest(FORM_SELECTOR));
  }

  document.addEventListener('input', (event) => {
    if (belongsToAppForm(event.target)) formDirty = true;
  }, true);

  document.addEventListener('change', (event) => {
    if (belongsToAppForm(event.target)) formDirty = true;
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target instanceof Element && event.target.matches(FORM_SELECTOR)) {
      formDirty = false;
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const leavesCurrentView = target?.closest(
      '[data-view], [data-auth], [data-check-id], [data-action="create-check"], [data-action="logout"]'
    );
    if (leavesCurrentView) formDirty = false;
  }, true);

  window.setInterval = function guardedSetInterval(handler, timeout, ...args) {
    if (timeout !== 15000 || typeof handler !== 'function') {
      return originalSetInterval.call(window, handler, timeout, ...args);
    }

    return originalSetInterval.call(window, () => {
      const form = document.querySelector(FORM_SELECTOR);
      const active = document.activeElement;
      const activeField = form
        && active instanceof Element
        && form.contains(active)
        && active.matches(FIELD_SELECTOR);

      if (!form || (!formDirty && !activeField)) {
        formDirty = false;
        handler(...args);
      }
    }, timeout);
  };
})();
