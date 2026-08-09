(() => {
  'use strict';

  const VERSION = 'v2';
  const FORM_SELECTOR = '#app form[data-form]';
  const FIELD_SELECTOR = 'input, textarea, select';
  const originalSetInterval = window.setInterval;
  let formDirty = false;

  window.__ZWEICHECK_DRAFT_GUARD_VERSION__ = VERSION;

  function belongsToAppForm(target) {
    return target instanceof Element && Boolean(target.closest(FORM_SELECTOR));
  }

  function currentFormHasDraft() {
    const form = document.querySelector(FORM_SELECTOR);
    if (!form) return false;
    if (formDirty) return true;

    return Array.from(form.elements).some((field) => {
      if (!(field instanceof Element) || !field.matches(FIELD_SELECTOR)) return false;
      if (field instanceof HTMLInputElement && field.type === 'file') return field.files?.length > 0;
      if (field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type)) {
        return field.checked !== field.defaultChecked;
      }
      if (field instanceof HTMLSelectElement) {
        return Array.from(field.options).some((option) => option.selected !== option.defaultSelected);
      }
      return 'value' in field && field.value !== field.defaultValue;
    });
  }

  document.addEventListener('input', (event) => {
    if (belongsToAppForm(event.target)) formDirty = true;
  }, true);

  document.addEventListener('change', (event) => {
    if (belongsToAppForm(event.target)) formDirty = true;
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const leavesCurrentView = target?.closest(
      '[data-view], [data-auth], [data-check-id], [data-action="create-check"], [data-action="logout"]'
    );
    if (leavesCurrentView) formDirty = false;
  }, true);

  document.addEventListener('submit', (event) => {
    if (!belongsToAppForm(event.target)) return;
    formDirty = false;
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

      if (form && (currentFormHasDraft() || activeField)) return;

      formDirty = false;
      return handler(...args);
    }, timeout);
  };
})();
