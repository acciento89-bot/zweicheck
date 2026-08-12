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
      <p class="zc-account-intro">Du kannst eine Datei mit deinen gespeicherten ZweiCheck-Daten herunterladen oder dein Konto dauerhaft löschen.</p>
      <div class="zc-account-action">
        <div>
          <strong>Meine Daten herunterladen</strong>
          <small>Die Datei enthält deine Kontodaten, Prüfungen und Aktivitäten. Passwörter und Sicherheitsschlüssel sind nicht enthalten.</small>
        </div>
        <button type="button" class="button button-secondary" data-zc-account-export>Daten herunterladen</button>
      </div>
      <details class="zc-delete-box">
        <summary>Konto löschen</summary>
        <div class="zc-delete-content">
          <div class="notice notice-warning"><div><strong>Das kann nicht rückgängig gemacht werden.</strong><p>Dein Konto, deine Verbindungen und gemeinsame Prüfungen, an denen du beteiligt bist, werden gelöscht. Hochgeladene Bilder dieser Prüfungen werden ebenfalls entfernt.</p></div></div>
          <form class="form-stack" data-zc-delete-form>
            <label>Dein Passwort<input name="password" type="password" autocomplete="current-password" required><small>Damit niemand dein Konto versehentlich löschen kann.</small></label>
            <label class="zc-delete-confirm"><input name="confirmDelete" type="checkbox" required><span>Ich habe verstanden, dass mein Konto dauerhaft gelöscht wird.</span></label>
            <button type="submit" class="button button-warning">Konto dauerhaft löschen</button>
          </form>
        </div>
      </details>
      <nav class="zc-account-links" aria-label="Datenschutz und Hilfe">
        <a href="/privacy" target="_blank" rel="noopener">Datenschutz</a>
        <a href="/privacy-choices" target="_blank" rel="noopener">Datenschutz-Einstellungen</a>
        <a href="/support" target="_blank" rel="noopener">Hilfe & Support</a>
      </nav>
      <p class="zc-account-version">ZweiCheck 1.0.0</p>`;
    logout.before(panel);
  }

  async function exportData(button) {
    if (busy) return;
    busy = true;
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Datei wird erstellt …';
    try {
      const response = await fetch('/api/account/export', { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        let message = 'Die Datei konnte nicht erstellt werden.';
        try { const body = await response.json(); if (body?.error) message = body.error; } catch {}
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
      window.setTimeout(() => { if (document.body.contains(button)) button.textContent = previous; }, 2500);
    } catch (error) {
      window.alert(error.message);
      if (document.body.contains(button)) button.textContent = previous;
    } finally {
      if (document.body.contains(button)) button.disabled = false;
      busy = false;
    }
  }

  async function unsubscribePush() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager?.getSubscription?.();
      if (subscription) await subscription.unsubscribe();
    } catch {}
  }

  async function removeAccount(form) {
    if (busy) return;
    if (!form.reportValidity()) return;
    if (!window.confirm('Konto wirklich dauerhaft löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.')) return;

    busy = true;
    const button = form.querySelector('[type="submit"]');
    const previous = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = 'Konto wird gelöscht …'; }
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password: form.elements.password.value })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Das Konto konnte nicht gelöscht werden.');
      await unsubscribePush();
      window.alert('Dein ZweiCheck-Konto wurde gelöscht.');
      window.location.replace('/');
    } catch (error) {
      window.alert(error.message);
      if (button && document.body.contains(button)) { button.disabled = false; button.textContent = previous; }
      busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-zc-account-export]');
    if (button) exportData(button).catch(() => {});
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-zc-delete-form]');
    if (!form) return;
    event.preventDefault();
    removeAccount(form).catch(() => {});
  });

  window.setInterval(decorateAccountView, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateAccountView, { once: true });
  else decorateAccountView();
})();
