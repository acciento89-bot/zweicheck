(() => {
  'use strict';

  let busy = false;

  function isAccountView() {
    const logout = document.querySelector('[data-action="logout"]');
    const heading = document.querySelector('.page-heading .eyebrow');
    return Boolean(logout && heading?.textContent?.trim() === 'Konto');
  }

  function decorateAccountView() {
    if (!isAccountView()) {
      document.querySelector('[data-zc-account-privacy]')?.remove();
      return;
    }
    if (document.querySelector('[data-zc-account-privacy]')) return;

    const logout = document.querySelector('[data-action="logout"]');
    const panel = document.createElement('section');
    panel.className = 'panel zc-account-privacy';
    panel.dataset.zcAccountPrivacy = 'true';
    panel.innerHTML = `
      <span class="eyebrow">Deine Daten</span>
      <h2>Du bestimmst über dein Konto</h2>
      <p class="zc-account-intro">Du kannst eine Datei mit deinen gespeicherten ZweiCheck-Daten herunterladen.</p>
      <div class="zc-account-action">
        <div>
          <strong>Meine Daten herunterladen</strong>
          <small>Die Datei enthält deine Kontodaten, Prüfungen und Aktivitäten. Passwörter und Sicherheitsschlüssel sind nicht enthalten.</small>
        </div>
        <button type="button" class="button button-secondary" data-zc-account-export>Daten herunterladen</button>
      </div>`;
    logout.before(panel);
  }

  async function exportData(button) {
    if (busy) return;
    busy = true;
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Datei wird erstellt …';
    try {
      const response = await fetch('/api/account/export', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        let message = 'Die Datei konnte nicht erstellt werden.';
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zweicheck-meine-daten-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      button.textContent = 'Datei wurde erstellt';
      window.setTimeout(() => {
        if (document.body.contains(button)) button.textContent = previous;
      }, 2500);
    } catch (error) {
      window.alert(error.message);
      if (document.body.contains(button)) button.textContent = previous;
    } finally {
      if (document.body.contains(button)) button.disabled = false;
      busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-zc-account-export]');
    if (button) exportData(button).catch(() => {});
  });

  window.setInterval(decorateAccountView, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateAccountView, { once: true });
  else decorateAccountView();
})();
