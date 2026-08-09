(() => {
  'use strict';

  const root = document.querySelector('#app');
  const toastRoot = document.querySelector('#toast-root');

  const labels = {
    category: {
      message: ['Nachricht oder Anruf', '💬'],
      payment: ['Zahlung oder Rechnung', '€'],
      link: ['Link, QR-Code oder App', '🔗'],
      data: ['Daten oder Dokumente', '🪪']
    },
    urgency: {
      none: 'Kein Zeitdruck',
      low: 'Etwas dringend',
      high: 'Dringend',
      very_high: 'Sehr dringend'
    },
    status: {
      open: 'Wartet auf Antwort',
      answered: 'Antwort erhalten',
      closed: 'Abgeschlossen'
    },
    recommendation: {
      do_not_act: ['Nicht handeln', 'danger'],
      verify_personally: ['Erst persönlich klären', 'warning'],
      plausible: ['Wirkt nachvollziehbar', 'positive'],
      call_me: ['Ruf mich jetzt an', 'navy']
    }
  };

  const state = {
    user: null,
    connections: [],
    checks: [],
    pendingInvitations: [],
    view: 'home',
    selectedCheck: null,
    authMode: 'login',
    resetToken: null,
    pendingInviteCode: '',
    debugUrl: '',
    loading: true,
    pollingTimer: null
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  }

  function formatMoney(cents) {
    if (cents === null || cents === undefined) return '';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  }

  function toast(message, kind = 'info') {
    const element = document.createElement('div');
    element.className = `toast toast-${kind}`;
    element.textContent = message;
    toastRoot.append(element);
    window.setTimeout(() => element.remove(), 4200);
  }

  async function api(url, options = {}) {
    const request = { method: 'GET', credentials: 'same-origin', ...options };
    if (request.body && !(request.body instanceof FormData) && typeof request.body !== 'string') {
      request.headers = { 'Content-Type': 'application/json', ...(request.headers || {}) };
      request.body = JSON.stringify(request.body);
    }
    const response = await fetch(url, request);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      if (response.status === 401) {
        state.user = null;
        stopPolling();
      }
      const error = new Error(payload?.error || 'Die Anfrage ist fehlgeschlagen.');
      error.code = payload?.code;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function loadData({ quiet = false } = {}) {
    if (!state.user) return;
    try {
      const [connections, checks, pending] = await Promise.all([
        api('/api/connections'),
        api('/api/checks'),
        api('/api/invitations/pending')
      ]);
      state.connections = connections.connections;
      state.checks = checks.checks;
      state.pendingInvitations = pending.invitations;
      if (state.selectedCheck) {
        const detail = await api(`/api/checks/${state.selectedCheck.id}`);
        state.selectedCheck = detail.check;
      }
      if (!quiet) render();
    } catch (error) {
      if (!quiet) toast(error.message, 'error');
      if (!state.user) render();
    }
  }

  function startPolling() {
    stopPolling();
    state.pollingTimer = window.setInterval(() => loadData({ quiet: true }).then(render), 15000);
  }

  function stopPolling() {
    if (state.pollingTimer) window.clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }

  function logo() {
    return `<img class="brand-logo" src="/assets/brand/zweicheck-logo-horizontal.svg" alt="ZweiCheck">`;
  }

  function authView() {
    const debug = state.debugUrl
      ? `<div class="debug-card"><strong>Testmodus:</strong> Die E-Mail wurde ins Server-Log geschrieben.<a class="button button-small button-secondary" href="${escapeHtml(state.debugUrl)}">Testlink jetzt öffnen</a></div>`
      : '';

    if (state.authMode === 'register') {
      return `
        <main class="auth-page">
          <section class="auth-brand">${logo()}<p>Gemeinsam prüfen. Sicher handeln.</p></section>
          <section class="auth-card">
            <span class="eyebrow">Konto erstellen</span>
            <h1>Dein Vertrauenskreis beginnt hier.</h1>
            <form data-form="register" class="form-stack">
              <label>Dein Name<input name="name" autocomplete="name" minlength="2" maxlength="80" required></label>
              <label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required></label>
              <label>Passwort<input name="password" type="password" autocomplete="new-password" minlength="10" required><small>Mindestens 10 Zeichen, Buchstaben und eine Zahl.</small></label>
              <button class="button button-primary" type="submit">Konto erstellen</button>
            </form>
            ${debug}
            <button class="text-button" data-auth="login">Schon registriert? Anmelden</button>
          </section>
        </main>`;
    }

    if (state.authMode === 'forgot') {
      return `
        <main class="auth-page">
          <section class="auth-brand">${logo()}<p>Gemeinsam prüfen. Sicher handeln.</p></section>
          <section class="auth-card">
            <span class="eyebrow">Passwort vergessen</span>
            <h1>Wir senden dir einen neuen Zugang.</h1>
            <form data-form="forgot" class="form-stack">
              <label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required></label>
              <button class="button button-primary" type="submit">Link anfordern</button>
            </form>
            ${debug}
            <button class="text-button" data-auth="login">Zurück zur Anmeldung</button>
          </section>
        </main>`;
    }

    if (state.authMode === 'reset') {
      return `
        <main class="auth-page">
          <section class="auth-brand">${logo()}<p>Gemeinsam prüfen. Sicher handeln.</p></section>
          <section class="auth-card">
            <span class="eyebrow">Neues Passwort</span>
            <h1>Lege jetzt dein neues Passwort fest.</h1>
            <form data-form="reset" class="form-stack">
              <label>Neues Passwort<input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
              <button class="button button-primary" type="submit">Passwort ändern</button>
            </form>
          </section>
        </main>`;
    }

    return `
      <main class="auth-page">
        <section class="auth-brand">${logo()}<p>Gemeinsam prüfen. Sicher handeln.</p></section>
        <section class="auth-card">
          <span class="eyebrow">Willkommen</span>
          <h1>Hol dir einen zweiten Blick.</h1>
          <p class="muted">Bevor du zahlst, klickst, etwas installierst oder persönliche Daten weitergibst.</p>
          <form data-form="login" class="form-stack">
            <label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required></label>
            <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
            <button class="button button-primary" type="submit">Anmelden</button>
          </form>
          ${debug}
          <button class="text-button" data-auth="forgot">Passwort vergessen?</button>
          <button class="button button-secondary" data-auth="register">Neues Konto erstellen</button>
        </section>
      </main>`;
  }

  function verificationBanner() {
    if (state.user.emailVerified) return '';
    return `
      <section class="notice notice-warning">
        <div><strong>E-Mail noch nicht bestätigt</strong><p>Einladungen und Prüfanfragen werden danach freigeschaltet.</p>${state.debugUrl ? `<a class="text-button" href="${escapeHtml(state.debugUrl)}">Testlink öffnen</a>` : ''}</div>
        <button class="button button-small button-warning" data-action="resend-verification">Link erneut senden</button>
      </section>`;
  }

  function homeView() {
    const openForMe = state.checks.filter((item) => item.reviewerId === state.user.id && item.status === 'open');
    const answered = state.checks.filter((item) => item.requesterId === state.user.id && item.status === 'answered');
    return `
      ${verificationBanner()}
      <section class="hero-card">
        <span class="eyebrow">Hallo ${escapeHtml(state.user.name)}</span>
        <h1>Unsicher?</h1>
        <p>Lass kurz jemanden mit draufschauen, bevor du handelst.</p>
        <button class="button button-primary button-hero" data-action="create-check" ${!state.user.emailVerified ? 'disabled' : ''}>Prüfung starten</button>
      </section>
      ${state.connections.length ? '' : `
        <section class="notice">
          <div><strong>Noch keine Vertrauensperson</strong><p>Verbinde zuerst eine Person, der du vertraust.</p></div>
          <button class="button button-small button-secondary" data-view="connections">Jetzt verbinden</button>
        </section>`}
      <section class="quick-grid">
        <button class="quick-card" data-filter="for-me"><span>${openForMe.length}</span><strong>Warten auf dich</strong><small>Prüfungen beantworten</small></button>
        <button class="quick-card" data-filter="answered"><span>${answered.length}</span><strong>Neue Antworten</strong><small>Rückmeldung ansehen</small></button>
      </section>
      <section class="section-block">
        <div class="section-heading"><div><span class="eyebrow">Aktuell</span><h2>Letzte Prüfungen</h2></div><button class="text-button" data-view="checks">Alle anzeigen</button></div>
        ${checkList(state.checks.slice(0, 4), 'Noch keine Prüfung vorhanden.')}
      </section>`;
  }

  function checkList(items, emptyText) {
    if (!items.length) return `<div class="empty-state"><span>✓</span><p>${escapeHtml(emptyText)}</p></div>`;
    return `<div class="card-list">${items.map((item) => {
      const category = labels.category[item.category] || ['Prüfung', '✓'];
      const isMine = item.requesterId === state.user.id;
      return `
        <button class="check-card" data-check-id="${item.id}">
          <span class="check-icon">${category[1]}</span>
          <span class="check-main"><strong>${escapeHtml(category[0])}</strong><small>${isMine ? `An ${escapeHtml(item.reviewerName)}` : `Von ${escapeHtml(item.requesterName)}`} · ${formatDate(item.createdAt)}</small></span>
          <span class="status status-${item.status}">${escapeHtml(labels.status[item.status])}</span>
        </button>`;
    }).join('')}</div>`;
  }

  function checksView() {
    return `
      <section class="page-heading"><span class="eyebrow">Verlauf</span><h1>Prüfungen</h1><p>Offene Vorgänge und abgeschlossene Rückmeldungen.</p></section>
      <div class="filter-row">
        <button class="chip active" data-check-filter="all">Alle</button>
        <button class="chip" data-check-filter="open">Offen</button>
        <button class="chip" data-check-filter="mine">Von mir</button>
        <button class="chip" data-check-filter="for-me">Für mich</button>
      </div>
      <div id="checks-list">${checkList(state.checks, 'Noch keine Prüfung vorhanden.')}</div>`;
  }

  function connectionsView() {
    return `
      <section class="page-heading"><span class="eyebrow">Privater Kreis</span><h1>Vertrauenspersonen</h1><p>Nur verbundene Personen können deine Prüfanfragen erhalten.</p></section>
      ${verificationBanner()}
      ${state.pendingInvitations.length ? `
        <section class="section-block"><h2>Einladungen für dich</h2><div class="card-list">${state.pendingInvitations.map((invite) => `
          <article class="person-card"><span class="avatar">${escapeHtml(invite.creatorName.charAt(0))}</span><div><strong>${escapeHtml(invite.creatorName)}</strong><small>${escapeHtml(invite.creatorEmail)}</small></div><button class="button button-small button-ghost" data-decline-invite="${invite.id}">Ablehnen</button></article>`).join('')}</div></section>` : ''}
      <section class="split-grid">
        <article class="panel">
          <span class="eyebrow">Person einladen</span><h2>Einladungscode erstellen</h2>
          <form class="form-stack" data-form="invite-create">
            <label>E-Mail optional<input name="email" type="email" placeholder="name@beispiel.de"><small>Ohne E-Mail kannst du den Code selbst teilen.</small></label>
            <button class="button button-primary" type="submit" ${!state.user.emailVerified ? 'disabled' : ''}>Code erstellen</button>
          </form>
          <div id="invite-result"></div>
        </article>
        <article class="panel">
          <span class="eyebrow">Einladung erhalten</span><h2>Code eingeben</h2>
          <form class="form-stack" data-form="invite-accept">
            <label>Einladungscode<input name="code" autocomplete="one-time-code" maxlength="12" value="${escapeHtml(state.pendingInviteCode)}" placeholder="ABCD2345" required></label>
            <button class="button button-secondary" type="submit" ${!state.user.emailVerified ? 'disabled' : ''}>Verbindung herstellen</button>
          </form>
        </article>
      </section>
      <section class="section-block"><div class="section-heading"><div><span class="eyebrow">Aktiv</span><h2>Dein Vertrauenskreis</h2></div><span class="count-badge">${state.connections.length}</span></div>
        ${state.connections.length ? `<div class="card-list">${state.connections.map((connection) => `
          <article class="person-card"><span class="avatar">${escapeHtml(connection.person.name.charAt(0))}</span><div><strong>${escapeHtml(connection.person.name)}</strong><small>${escapeHtml(connection.person.email)}</small></div><button class="icon-button" title="Verbindung entfernen" data-remove-connection="${connection.id}">×</button></article>`).join('')}</div>` : '<div class="empty-state"><span>＋</span><p>Dein Vertrauenskreis ist noch leer.</p></div>'}
      </section>`;
  }

  function accountView() {
    return `
      <section class="page-heading"><span class="eyebrow">Konto</span><h1>${escapeHtml(state.user.name)}</h1><p>${escapeHtml(state.user.email)}</p></section>
      <section class="panel account-panel">
        <div class="setting-row"><div><strong>E-Mail-Bestätigung</strong><small>Schützt Einladungen und Verbindungen.</small></div><span class="status ${state.user.emailVerified ? 'status-answered' : 'status-open'}">${state.user.emailVerified ? 'Bestätigt' : 'Offen'}</span></div>
        <div class="setting-row"><div><strong>Automatische Aktualisierung</strong><small>Neue Antworten werden alle 15 Sekunden geprüft.</small></div><span class="status status-answered">Aktiv</span></div>
      </section>
      <section class="notice notice-calm"><div><strong>Sensible Daten</strong><p>Teile niemals TANs, Passwörter oder vollständige Karteninformationen über ZweiCheck.</p></div></section>
      <button class="button button-secondary" data-action="logout">Abmelden</button>`;
  }

  function createCheckView() {
    if (!state.connections.length) {
      return `<section class="page-heading"><h1>Vertrauensperson fehlt</h1><p>Verbinde zuerst jemanden, bevor du eine Prüfung sendest.</p></section><button class="button button-primary" data-view="connections">Vertrauensperson verbinden</button>`;
    }
    return `
      <section class="page-heading"><button class="back-button" data-view="home">← Zurück</button><span class="eyebrow">Neue Prüfung</span><h1>Was möchtest du prüfen?</h1></section>
      <form class="form-stack create-form" data-form="create-check" enctype="multipart/form-data">
        <label>Vertrauensperson<select name="reviewerId" required>${state.connections.map((connection) => `<option value="${connection.person.id}">${escapeHtml(connection.person.name)}</option>`).join('')}</select></label>
        <fieldset><legend>Prüfungsart</legend><div class="option-grid">${Object.entries(labels.category).map(([value, entry]) => `<label class="option-card"><input type="radio" name="category" value="${value}" ${value === 'message' ? 'checked' : ''}><span>${entry[1]}</span><strong>${entry[0]}</strong></label>`).join('')}</div></fieldset>
        <label>Was ist passiert?<textarea name="description" rows="5" minlength="5" maxlength="1500" placeholder="Zum Beispiel: Ich soll heute noch auf ein neues Konto überweisen …" required></textarea></label>
        <div class="form-grid"><label>Betrag optional<input name="amount" inputmode="decimal" placeholder="0,00"></label><label>Zeitdruck<select name="urgency"><option value="none">Kein Zeitdruck</option><option value="low">Etwas dringend</option><option value="high">Dringend</option><option value="very_high">Sehr dringend</option></select></label></div>
        <label>Bilder oder Screenshots<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>Bis zu 3 Bilder, jeweils maximal 8 MB.</small></label>
        <div class="notice notice-warning"><div><strong>Bis zur Rückmeldung noch nichts tun.</strong><p>Nichts bezahlen, installieren oder weitergeben. Keine TANs oder Passwörter hochladen.</p></div></div>
        <button class="button button-primary button-hero" type="submit">An Vertrauensperson senden</button>
      </form>`;
  }

  function detailView() {
    const item = state.selectedCheck;
    if (!item) return '<div class="loading">Prüfung wird geladen …</div>';
    const category = labels.category[item.category] || ['Prüfung', '✓'];
    const isRequester = item.requesterId === state.user.id;
    const recommendation = item.recommendation ? labels.recommendation[item.recommendation] : null;
    return `
      <section class="page-heading"><button class="back-button" data-view="checks">← Zurück</button><span class="eyebrow">${isRequester ? `An ${escapeHtml(item.reviewerName)}` : `Von ${escapeHtml(item.requesterName)}`}</span><h1>${category[1]} ${escapeHtml(category[0])}</h1><p>${formatDate(item.createdAt)}</p></section>
      <section class="detail-card">
        <div class="detail-meta"><span class="status status-${item.status}">${labels.status[item.status]}</span><span class="urgency urgency-${item.urgency}">${labels.urgency[item.urgency]}</span>${item.amountCents !== null ? `<strong>${formatMoney(item.amountCents)}</strong>` : ''}</div>
        <h2>Beschreibung</h2><p class="detail-text">${escapeHtml(item.description)}</p>
        ${item.attachments?.length ? `<h2>Anhänge</h2><div class="attachment-grid">${item.attachments.map((attachment) => `<a href="${attachment.url}" target="_blank" rel="noopener"><img src="${attachment.url}" alt="${escapeHtml(attachment.originalName)}"><small>${escapeHtml(attachment.originalName)}</small></a>`).join('')}</div>` : ''}
      </section>
      ${recommendation ? `
        <section class="recommendation recommendation-${recommendation[1]}"><span class="eyebrow">Rückmeldung</span><h2>${recommendation[0]}</h2>${item.responseNote ? `<p>${escapeHtml(item.responseNote)}</p>` : '<p>Keine zusätzliche Begründung angegeben.</p>'}<small>${formatDate(item.respondedAt)}</small></section>` : ''}
      ${!isRequester && item.status === 'open' ? responseForm() : ''}
      ${isRequester && item.status !== 'closed' ? `<button class="button button-secondary" data-close-check="${item.id}">Vorgang abschließen</button>` : ''}
      <p class="legal-hint">Die Rückmeldung ist eine persönliche Einschätzung und keine Sicherheitsgarantie.</p>`;
  }

  function responseForm() {
    return `
      <section class="panel"><span class="eyebrow">Deine Einschätzung</span><h2>Was empfiehlst du?</h2>
        <form class="form-stack" data-form="respond">
          <div class="recommendation-options">${Object.entries(labels.recommendation).map(([value, entry]) => `<label class="recommendation-choice recommendation-${entry[1]}"><input type="radio" name="recommendation" value="${value}" ${value === 'verify_personally' ? 'checked' : ''}><strong>${entry[0]}</strong></label>`).join('')}</div>
          <label>Kurze Begründung optional<textarea name="note" rows="4" maxlength="1200" placeholder="Was ist dir aufgefallen?"></textarea></label>
          <button class="button button-primary" type="submit">Rückmeldung senden</button>
        </form>
      </section>`;
  }

  function shellView() {
    let content;
    if (state.view === 'checks') content = checksView();
    else if (state.view === 'connections') content = connectionsView();
    else if (state.view === 'account') content = accountView();
    else if (state.view === 'create') content = createCheckView();
    else if (state.view === 'detail') content = detailView();
    else content = homeView();

    const showNav = !['create', 'detail'].includes(state.view);
    return `
      <div class="app-shell">
        <header class="topbar">${logo()}<span class="secure-pill">Privat verbunden</span></header>
        <main class="app-main">${content}</main>
        ${showNav ? `<nav class="bottom-nav" aria-label="Hauptnavigation">
          <button class="${state.view === 'home' ? 'active' : ''}" data-view="home"><span>⌂</span>Start</button>
          <button class="${state.view === 'checks' ? 'active' : ''}" data-view="checks"><span>✓</span>Prüfungen</button>
          <button class="${state.view === 'connections' ? 'active' : ''}" data-view="connections"><span>◎</span>Vertrauen</button>
          <button class="${state.view === 'account' ? 'active' : ''}" data-view="account"><span>○</span>Konto</button>
        </nav>` : ''}
      </div>`;
  }

  function render() {
    if (state.loading) {
      root.innerHTML = `<main class="splash">${logo()}<div class="spinner"></div><p>Wird geladen …</p></main>`;
      return;
    }
    root.innerHTML = state.user ? shellView() : authView();
  }

  async function openCheck(id) {
    state.view = 'detail';
    state.selectedCheck = state.checks.find((item) => item.id === id) || { id };
    render();
    try {
      const result = await api(`/api/checks/${id}`);
      state.selectedCheck = result.check;
      render();
    } catch (error) {
      toast(error.message, 'error');
      state.view = 'checks';
      state.selectedCheck = null;
      render();
    }
  }

  document.addEventListener('click', async (event) => {
    const target = event.target.closest('button, [data-check-id]');
    if (!target) return;

    if (target.dataset.auth) {
      state.authMode = target.dataset.auth;
      state.debugUrl = '';
      render();
      return;
    }
    if (target.dataset.view) {
      state.view = target.dataset.view;
      if (state.view !== 'detail') state.selectedCheck = null;
      render();
      return;
    }
    if (target.dataset.checkId) return openCheck(target.dataset.checkId);
    if (target.dataset.action === 'create-check') {
      state.view = state.connections.length ? 'create' : 'connections';
      render();
      return;
    }
    if (target.dataset.action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.connections = [];
      state.checks = [];
      stopPolling();
      render();
      return;
    }
    if (target.dataset.action === 'resend-verification') {
      try {
        const result = await api('/api/auth/resend-verification', { method: 'POST' });
        state.debugUrl = result.debugUrl || '';
        toast('Bestätigungslink wurde erstellt.', 'success');
        render();
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (target.dataset.removeConnection) {
      if (!window.confirm('Diese Verbindung wirklich entfernen? Die andere Person verliert sofort den Zugriff auf eure Prüfungen.')) return;
      try {
        await api(`/api/connections/${target.dataset.removeConnection}`, { method: 'DELETE' });
        await loadData();
        toast('Verbindung wurde entfernt.', 'success');
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (target.dataset.declineInvite) {
      try {
        await api(`/api/invitations/${target.dataset.declineInvite}/decline`, { method: 'POST' });
        await loadData();
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (target.dataset.closeCheck) {
      try {
        await api(`/api/checks/${target.dataset.closeCheck}/close`, { method: 'POST' });
        await loadData();
        toast('Vorgang abgeschlossen.', 'success');
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (target.dataset.filter) {
      state.view = 'checks';
      render();
      const mode = target.dataset.filter;
      applyCheckFilter(mode === 'answered' ? 'mine' : mode);
      return;
    }
    if (target.dataset.checkFilter) applyCheckFilter(target.dataset.checkFilter);
  });

  function applyCheckFilter(filter) {
    document.querySelectorAll('[data-check-filter]').forEach((button) => button.classList.toggle('active', button.dataset.checkFilter === filter));
    let items = state.checks;
    if (filter === 'open') items = items.filter((item) => item.status === 'open');
    if (filter === 'mine') items = items.filter((item) => item.requesterId === state.user.id);
    if (filter === 'for-me') items = items.filter((item) => item.reviewerId === state.user.id);
    const list = document.querySelector('#checks-list');
    if (list) list.innerHTML = checkList(items, 'Keine passenden Prüfungen gefunden.');
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      const data = new FormData(form);
      if (form.dataset.form === 'login') {
        const result = await api('/api/auth/login', { method: 'POST', body: { email: data.get('email'), password: data.get('password') } });
        state.user = result.user;
        state.view = state.pendingInviteCode ? 'connections' : 'home';
        await loadData();
        startPolling();
      }
      if (form.dataset.form === 'register') {
        const result = await api('/api/auth/register', { method: 'POST', body: { name: data.get('name'), email: data.get('email'), password: data.get('password') } });
        state.user = result.user;
        state.debugUrl = result.debugUrl || '';
        state.view = 'home';
        await loadData();
        startPolling();
        toast('Konto wurde erstellt.', 'success');
      }
      if (form.dataset.form === 'forgot') {
        const result = await api('/api/auth/request-password-reset', { method: 'POST', body: { email: data.get('email') } });
        state.debugUrl = result.debugUrl || '';
        toast('Falls das Konto existiert, wurde ein Link erstellt.', 'success');
        render();
      }
      if (form.dataset.form === 'reset') {
        await api('/api/auth/reset-password', { method: 'POST', body: { token: state.resetToken, password: data.get('password') } });
        state.authMode = 'login';
        state.resetToken = null;
        window.history.replaceState({}, '', '/');
        toast('Passwort wurde geändert. Bitte melde dich an.', 'success');
        render();
      }
      if (form.dataset.form === 'invite-create') {
        const result = await api('/api/invitations', { method: 'POST', body: { email: data.get('email') || undefined } });
        const container = document.querySelector('#invite-result');
        if (container) container.innerHTML = `<div class="code-card"><small>48 Stunden gültig</small><strong>${escapeHtml(result.code)}</strong><button class="text-button" type="button" data-copy-code="${escapeHtml(result.code)}">Code kopieren</button></div>`;
        toast(result.emailDelivery === 'smtp' ? 'Einladung wurde versendet.' : 'Einladungscode wurde erstellt.', 'success');
      }
      if (form.dataset.form === 'invite-accept') {
        await api('/api/invitations/accept', { method: 'POST', body: { code: data.get('code') } });
        state.pendingInviteCode = '';
        window.history.replaceState({}, '', '/');
        await loadData();
        toast('Vertrauensverbindung hergestellt.', 'success');
      }
      if (form.dataset.form === 'create-check') {
        const result = await api('/api/checks', { method: 'POST', body: data });
        state.selectedCheck = result.check;
        state.view = 'detail';
        await loadData();
        toast('Prüfung wurde gesendet.', 'success');
      }
      if (form.dataset.form === 'respond') {
        const result = await api(`/api/checks/${state.selectedCheck.id}/respond`, {
          method: 'POST', body: { recommendation: data.get('recommendation'), note: data.get('note') }
        });
        state.selectedCheck = result.check;
        await loadData();
        toast('Rückmeldung wurde gesendet.', 'success');
      }
    } catch (error) {
      toast(error.message, 'error');
      render();
    } finally {
      if (submit && document.body.contains(submit)) submit.disabled = false;
    }
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-code]');
    if (!button) return;
    await navigator.clipboard.writeText(button.dataset.copyCode);
    toast('Code kopiert.', 'success');
  });

  async function processHash() {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const verifyToken = hash.get('verify');
    const resetToken = hash.get('reset');
    const inviteCode = hash.get('invite');

    if (resetToken) {
      state.resetToken = resetToken;
      state.authMode = 'reset';
      return;
    }
    if (inviteCode) state.pendingInviteCode = inviteCode;
    if (verifyToken) {
      try {
        const result = await api('/api/auth/verify-email', { method: 'POST', body: { token: verifyToken } });
        if (state.user?.id === result.user.id) state.user = result.user;
        toast('E-Mail-Adresse wurde bestätigt.', 'success');
        window.history.replaceState({}, '', '/');
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  }

  async function init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    try {
      const me = await api('/api/auth/me');
      state.user = me.user;
    } catch (error) {
      if (error.status !== 401) toast(error.message, 'error');
    }
    await processHash();
    if (state.user) {
      if (state.pendingInviteCode) state.view = 'connections';
      await loadData({ quiet: true });
      startPolling();
    }
    state.loading = false;
    render();
  }

  init();
})();
