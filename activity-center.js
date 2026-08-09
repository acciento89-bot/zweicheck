(() => {
  'use strict';

  const state = {
    active: false,
    filter: 'all',
    activities: [],
    unreadCount: 0,
    nextBefore: null,
    loading: false,
    initialized: false,
    refreshTimer: null
  };

  let observerQueued = false;
  let rendering = false;

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
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  async function api(url, options = {}) {
    const request = { method: 'GET', credentials: 'same-origin', ...options };
    if (request.body && typeof request.body !== 'string') {
      request.headers = { 'Content-Type': 'application/json', ...(request.headers || {}) };
      request.body = JSON.stringify(request.body);
    }

    const response = await fetch(url, request);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(body?.error || 'Aktivitäten konnten nicht geladen werden.');
    return body;
  }

  function isAuthenticatedShell() {
    return Boolean(document.querySelector('.app-shell'));
  }

  function badgeText() {
    return state.unreadCount > 99 ? '99+' : String(state.unreadCount);
  }

  function updateBadge() {
    const badge = document.querySelector('[data-activity-badge]');
    if (!badge) return;
    badge.textContent = badgeText();
    badge.hidden = state.unreadCount < 1;
  }

  function mountNavigation() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    nav.classList.add('activity-nav-ready');
    let button = nav.querySelector('[data-activity-nav]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.activityNav = 'true';
      button.innerHTML = '<span class="activity-nav-icon">◉<b data-activity-badge hidden>0</b></span>Aktivitäten';
      button.setAttribute('aria-label', 'Aktivitäten öffnen');
      const accountButton = nav.querySelector('[data-view="account"]');
      nav.insertBefore(button, accountButton || null);
    }

    button.classList.toggle('active', state.active);
    if (state.active) {
      nav.querySelectorAll('button[data-view]').forEach((item) => item.classList.remove('active'));
    }
    updateBadge();
  }

  function activityActionLabel(item) {
    if (item.checkId) return 'Prüfung öffnen';
    if (item.invitationId) return 'Einladungen öffnen';
    if (item.connectionId) return 'Vertrauenskreis öffnen';
    return 'Als gelesen markieren';
  }

  function itemHtml(item) {
    const unread = !item.readAt;
    return `
      <article class="activity-card ${unread ? 'activity-unread' : ''}" data-activity-id="${escapeHtml(item.id)}">
        <button class="activity-card-main" type="button" data-activity-open="${escapeHtml(item.id)}">
          <span class="activity-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
          <span class="activity-copy">
            <span class="activity-title-row"><strong>${escapeHtml(item.title)}</strong>${unread ? '<i class="activity-dot" aria-label="Ungelesen"></i>' : ''}</span>
            <span class="activity-body">${escapeHtml(item.body)}</span>
            <small>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(activityActionLabel(item))}</small>
          </span>
        </button>
        <button class="activity-archive" type="button" data-activity-archive="${escapeHtml(item.id)}" title="Ausblenden" aria-label="Aktivität ausblenden">×</button>
      </article>`;
  }

  function centerHtml() {
    const list = state.activities.length
      ? `<div class="activity-list">${state.activities.map(itemHtml).join('')}</div>`
      : `<div class="empty-state activity-empty"><span>✓</span><p>${state.filter === 'unread' ? 'Keine ungelesenen Aktivitäten.' : 'Noch keine Aktivitäten vorhanden.'}</p></div>`;

    return `
      <section class="activity-center" data-activity-center>
        <div class="activity-heading">
          <div><span class="eyebrow">Alles an einem Ort</span><h1>Aktivitäten</h1><p>Prüfanfragen, Antworten und Änderungen in deinem Vertrauenskreis.</p></div>
          ${state.unreadCount ? `<button class="button button-small button-secondary" type="button" data-activity-read-all>Alle gelesen</button>` : ''}
        </div>
        <div class="activity-summary">
          <span><strong>${state.unreadCount}</strong> ungelesen</span>
          <span><strong>${state.activities.length}</strong> angezeigt</span>
        </div>
        <div class="filter-row activity-filters">
          <button class="chip ${state.filter === 'all' ? 'active' : ''}" type="button" data-activity-filter="all">Alle</button>
          <button class="chip ${state.filter === 'unread' ? 'active' : ''}" type="button" data-activity-filter="unread">Ungelesen</button>
        </div>
        ${state.loading && !state.activities.length ? '<div class="activity-loading"><div class="spinner"></div><p>Aktivitäten werden geladen …</p></div>' : list}
        ${state.nextBefore ? '<button class="button button-secondary activity-more" type="button" data-activity-more>Weitere laden</button>' : ''}
      </section>`;
  }

  function renderCenter() {
    if (!state.active || rendering) return;
    const main = document.querySelector('.app-main');
    if (!main) return;
    rendering = true;
    main.innerHTML = centerHtml();
    mountNavigation();
    rendering = false;
  }

  async function loadActivities({ append = false, quiet = false } = {}) {
    if (!isAuthenticatedShell() || state.loading) return;
    state.loading = true;
    if (!quiet) renderCenter();

    try {
      const query = new URLSearchParams({ filter: state.filter, limit: '25' });
      if (append && state.nextBefore) query.set('before', state.nextBefore);
      const result = await api(`/api/activities?${query}`);
      state.activities = append ? [...state.activities, ...result.activities] : result.activities;
      state.unreadCount = result.unreadCount;
      state.nextBefore = result.nextBefore;
      state.initialized = true;
    } catch (error) {
      if (!quiet) {
        const main = document.querySelector('.app-main');
        if (main && state.active) {
          main.innerHTML = `<section class="notice notice-warning"><div><strong>Aktivitäten nicht erreichbar</strong><p>${escapeHtml(error.message)}</p></div><button class="button button-small button-secondary" data-activity-retry>Erneut versuchen</button></section>`;
        }
      }
    } finally {
      state.loading = false;
      updateBadge();
      if (state.active && document.querySelector('[data-activity-center]')) renderCenter();
    }
  }

  async function refreshUnreadCount() {
    if (!isAuthenticatedShell()) return;
    try {
      const result = await api('/api/activities/unread-count');
      state.unreadCount = result.unreadCount;
      updateBadge();
      if (state.active) await loadActivities({ quiet: true });
    } catch {
      // Eine abgelaufene Sitzung wird von der Hauptanwendung behandelt.
    }
  }

  async function markRead(id) {
    const item = state.activities.find((entry) => entry.id === id);
    if (!item || item.readAt) return item;
    await api(`/api/activities/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
    item.readAt = new Date().toISOString();
    state.unreadCount = Math.max(0, state.unreadCount - 1);
    updateBadge();
    return item;
  }

  async function openActivity(id) {
    const item = state.activities.find((entry) => entry.id === id);
    if (!item) return;

    try {
      await markRead(id);
    } catch {
      // Die Navigation bleibt möglich, auch wenn der Lesestatus kurz nicht gespeichert werden konnte.
    }

    if (item.checkId) {
      state.active = false;
      window.location.hash = `check=${encodeURIComponent(item.checkId)}`;
      return;
    }

    if (item.invitationId || item.connectionId) {
      state.active = false;
      const target = document.querySelector('[data-view="connections"]');
      target?.click();
      return;
    }

    renderCenter();
  }

  async function archiveActivity(id) {
    await api(`/api/activities/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const item = state.activities.find((entry) => entry.id === id);
    if (item && !item.readAt) state.unreadCount = Math.max(0, state.unreadCount - 1);
    state.activities = state.activities.filter((entry) => entry.id !== id);
    updateBadge();
    renderCenter();
  }

  async function markAllRead() {
    await api('/api/activities/read-all', { method: 'POST' });
    const timestamp = new Date().toISOString();
    state.activities.forEach((item) => { item.readAt = item.readAt || timestamp; });
    state.unreadCount = 0;
    updateBadge();
    renderCenter();
  }

  function activate() {
    state.active = true;
    mountNavigation();
    renderCenter();
    loadActivities();
  }

  document.addEventListener('click', (event) => {
    const navButton = event.target.closest('[data-activity-nav]');
    if (navButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activate();
      return;
    }

    const regularView = event.target.closest('[data-view]');
    if (regularView && state.active) state.active = false;

    const filter = event.target.closest('[data-activity-filter]');
    if (filter) {
      state.filter = filter.dataset.activityFilter === 'unread' ? 'unread' : 'all';
      state.activities = [];
      state.nextBefore = null;
      renderCenter();
      loadActivities();
      return;
    }

    const open = event.target.closest('[data-activity-open]');
    if (open) {
      openActivity(open.dataset.activityOpen).catch(() => {});
      return;
    }

    const archive = event.target.closest('[data-activity-archive]');
    if (archive) {
      archive.disabled = true;
      archiveActivity(archive.dataset.activityArchive).catch(() => { archive.disabled = false; });
      return;
    }

    if (event.target.closest('[data-activity-read-all]')) {
      markAllRead().catch(() => {});
      return;
    }

    if (event.target.closest('[data-activity-more]')) {
      loadActivities({ append: true });
      return;
    }

    if (event.target.closest('[data-activity-retry]')) loadActivities();
  }, true);

  function reconcile() {
    observerQueued = false;
    if (!isAuthenticatedShell()) {
      state.active = false;
      state.initialized = false;
      state.activities = [];
      state.nextBefore = null;
      return;
    }

    mountNavigation();
    if (state.active && !document.querySelector('[data-activity-center]')) renderCenter();
    if (!state.initialized) refreshUnreadCount();
  }

  const observer = new MutationObserver(() => {
    if (observerQueued || rendering) return;
    observerQueued = true;
    queueMicrotask(reconcile);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  state.refreshTimer = window.setInterval(refreshUnreadCount, 15_000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reconcile, { once: true });
  } else {
    reconcile();
  }
})();
