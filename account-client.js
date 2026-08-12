(() => {
  'use strict';

  function decorateAccountView() {
    const logout = document.querySelector('[data-action="logout"]');
    const heading = document.querySelector('.page-heading .eyebrow');
    if (!logout || heading?.textContent?.trim() !== 'Konto') return;
    if (document.querySelector('[data-zc-account-privacy]')) return;

    const panel = document.createElement('section');
    panel.className = 'panel zc-account-privacy';
    panel.dataset.zcAccountPrivacy = 'true';
    panel.innerHTML = '<span class="eyebrow">Deine Daten</span><h2>Du bestimmst über dein Konto</h2><p>Hier kannst du deine gespeicherten Daten herunterladen und dein Konto verwalten.</p>';
    logout.before(panel);
  }

  window.setInterval(decorateAccountView, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateAccountView, { once: true });
  else decorateAccountView();
})();
