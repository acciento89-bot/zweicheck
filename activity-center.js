(() => {
  'use strict';

  const state = {
    open: false,
    filter: 'all',
    activities: [],
    unreadCount: 0,
    nextBefore: null,
    loading: false,
    error: '',
    authenticated: false
  };

  let button;
  let overlay;
  let panel;
  let badge;
  let refreshTimer;
  let authTimer;

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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  async function api(url, options = {}) {
    const request = {
      method: 'GET',
      credentials: 'same-origin',
      ...options
    };

    if (request.body && typeof request.body !== 'string') {
      request.headers = {
        'Content-Type': 'application/json',
        ...(request.headers || {})
      };
      request.body = JSON.stringify(request.body);
    }

    const response = await fetch(url, request);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(body?.error || 'Aktivitäten konnten nicht geladen werden.');
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function isAuthenticatedShell() {
    return Boolean(document.querySelector('.app-shell'));
  }

  function badgeText() {
    return state.unreadCount > 99 ? '99+' : String(state.unreadCount);
  }

  function updateBadge() {
    if (!badge) return;
    badge.textContent = badgeText();
    badge.hidden = state.unreadCount < 1;
    button?.setAttribute(
      'aria-label',
      state.unreadCount > 0
        ? `Aktivitäten öffnen, ${state.unreadCount} ungelesen`
        : 'Aktivitäten öffnen'
    );
  }

  function mount() {
    if (document.getElementById('zc-activity-button')) return;

    button = document.createElement('button');
    button.id = 'zc-activity-button';
    button.type = 'button';
    button.className = 'zc-activity-button';
    button.hidden = true;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'zc-activity-overlay');
    button.setAttribute('aria-label', 'Aktivitäten öffnen');
    button.innerHTML = '<span aria-hidden="true">◉</span><b id="zc-activity-badge" hidden>0</b>';

    overlay = document.createElement('div');
    overlay.id = 'zc-activity-overlay';
    overlay.className = 'zc-activity-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="zc-activity-backdrop" data-activity-close></div>
      <section class="zc-activity-panel" role="dialog" aria-modal="true" aria-labelledby="zc-activity-title">
        <header class="zc-activity-header">
          <div>
            <span class="zc-activity-eyebrow">Alles an einem Ort</span>
            <h2 id="zc-activity-title">Aktivitäten</h2>
          </div>
          <button class="zc-activity-close" type="button" data-activity-close aria-label="Aktivitäten schließen">×</button>
        </header>
        <div class="zc-activity-content" data-activity-content></div>
      </section>`;

    document.body.append(button, overlay);
    badge = document.getElementById('zc-activity-badge');
    panel = overlay.querySelector('.zc-activity-panel');

    button.addEventListener('click', openCenter);
    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.open) closeCenter();
    });
  }

  function itemActionLabel(item) {
    if (item.checkId) return 'Prüfung öffnen';
    if (item.invitationId) return 'Vertrauenskreis öffnen';
    if (item.connectionId) return 'Vertrauenskreis öffnen';
    return 'Als gelesen markieren';
  }

  function itemHtml(item) {
    const unread = !item.readAt;
    return `
      <article class="zc-activity-card ${unread ? 'is-unread' : ''}" data-activity-id="${escapeHtml(item.id)}">
        <button class="zc-activity-main" type="button" data-activity-open="${escapeHtml(item.id)}">
          <span class="zc-activity-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
          <span class="zc-activity-copy">
            <span class="zc-activity-title-row">
              <strong>${escapeHtml(item.title)}</strong>
              ${unread ? '<i class="zc-activity-dot" aria-label="Ungelesen"></i>' : ''}
            </span>
            <span class="zc-activity-body">${escapeHtml(item.body)}</span>
            <small>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(itemActionLabel(item))}</small>
          </span>
        </button>
        <button class="zc-activity-archive" type="button" data-activity-archive="${escapeHtml(item.id)}" aria-label="Aktivität ausblenden" title="Ausblenden">×</button>
      </article>`;
  }

  function render() {
    if (!overlay) return;
    const content = overlay.querySelector('[data-activity-content]');
    if (!content) return;

    const filters = `
      <div class="zc-activity-filters">
        <button type="button" class="${state.filter === 'all' ? 'active' : ''}" data-activity-filter="all">Alle</button>
        <button type="button" class="${state.filter === 'unread' ? 'active' : ''}" data-activity-filter="unread">Ungelesen</button>
      </div>`;

    const summary = `
      <div class="zc-activity-summary">
        <span><strong>${state.unreadCount}</strong> ungelesen</span>
        ${state.unreadCount > 0 ? '<button type="button" data-activity-read-all>Alle gelesen</button>' : ''}
      </div>`;

    let body;
    if (state.error) {
      body = `
        <div class="zc-activity-notice">
          <strong>Aktivitäten nicht erreichbar</strong>
          <p>${escapeHtml(state.error)}</p>
          <button type="button" data-activity-retry>Erneut versuchen</button>
        </div>`;
    } else if (state.loading && state.activities.length === 0) {
      body = '<div class="zc-activity-loading"><span></span><p>Aktivitäten werden geladen …</p></div>';
    } else if (state.activities.length === 0) {
      body = `<div class="zc-activity-empty"><span>✓</span><p>${state.filter === 'unread' ? 'Keine ungelesenen Aktivitäten.' : 'Noch keine Aktivitäten vorhanden.'}</p></div>`;
    } else {
      body = `<div class="zc-activity-list">${state.activities.map(itemHtml).join('')}</div>`;
    }

    content.innerHTML = `
      <p class="zc-activity-intro">Prüfanfragen, Antworten und Änderungen in deinem Vertrauenskreis.</p>
      ${summary}
      ${filters}
      ${body}
      ${!state.error && state.nextBefore ? '<button class="zc-activity-more" type="button" data-activity-more>Weitere laden</button>' : ''}`;
  }

  async function loadActivities({ append = false, quiet = false } = {}) {
    if (!state.authenticated || state.loading) return;
    state.loading = true;
    state.error = '';
    if (!quiet) render();

    try {
      const query = new URLSearchParams({ filter: state.filter, limit: '25' });
      if (append && state.nextBefore) query.set('before', state.nextBefore);
      const result = await api(`/api/activities?${query.toString()}`);
      state.activities = append ? [...state.activities, ...result.activities] : result.activities;
      state.unreadCount = result.unreadCount;
      state.nextBefore = result.nextBefore;
    } catch (error) {
      if (error.status === 401) {
        state.authenticated = false;
        syncAuthState();
      } else if (!quiet) {
        state.error = error.message;
      }
    } finally {
      state.loading = false;
      updateBadge();
      if (state.open) render();
    }
  }

  async function refreshUnreadCount() {
    if (!state.authenticated) return;
    try {
      const result = await api('/api/activities/unread-count');
      state.unreadCount = result.unreadCount;
      updateBadge();
      if (state.open) await loadActivities({ quiet: true });
    } catch (error) {
      if (error.status === 401) {
        state.authenticated = false;
        syncAuthState();
      }
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
      // Navigation bleibt möglich, auch wenn der Lesestatus gerade nicht gespeichert werden konnte.
    }

    closeCenter();

    if (item.checkId) {
      window.location.hash = `check=${encodeURIComponent(item.checkId)}`;
      return;
    }

    if (item.invitationId || item.connectionId) {
      document.querySelector('[data-view="connections"]')?.click();
    }
  }

  async function archiveActivity(id, target) {
    target.disabled = true;
    try {
      await api(`/api/activities/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const item = state.activities.find((entry) => entry.id === id);
      if (item && !item.readAt) state.unreadCount = Math.max(0, state.unreadCount - 1);
      state.activities = state.activities.filter((entry) => entry.id !== id);
      updateBadge();
      render();
    } catch {
      target.disabled = false;
    }
  }

  async function markAllRead(target) {
    target.disabled = true;
    try {
      await api('/api/activities/read-all', { method: 'POST' });
      const timestamp = new Date().toISOString();
      state.activities.forEach((item) => { item.readAt = item.readAt || timestamp; });
      state.unreadCount = 0;
      updateBadge();
      render();
    } catch {
      target.disabled = false;
    }
  }

  function openCenter() {
    if (!state.authenticated || !overlay) return;
    state.open = true;
    overlay.hidden = false;
    document.body.classList.add('zc-activity-open');
    render();
    loadActivities();
    requestAnimationFrame(() => panel?.querySelector('button')?.focus());
  }

  function closeCenter() {
    if (!overlay) return;
    state.open = false;
    overlay.hidden = true;
    document.body.classList.remove('zc-activity-open');
    button?.focus({ preventScroll: true });
  }

  function handleOverlayClick(event) {
    const close = event.target.closest('[data-activity-close]');
    if (close) {
      closeCenter();
      return;
    }

    const filter = event.target.closest('[data-activity-filter]');
    if (filter) {
      state.filter = filter.dataset.activityFilter === 'unread' ? 'unread' : 'all';
      state.activities = [];
      state.nextBefore = null;
      state.error = '';
      render();
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
      archiveActivity(archive.dataset.activityArchive, archive).catch(() => {});
      return;
    }

    const readAll = event.target.closest('[data-activity-read-all]');
    if (readAll) {
      markAllRead(readAll).catch(() => {});
      return;
    }

    if (event.target.closest('[data-activity-more]')) {
      loadActivities({ append: true });
      return;
    }

    if (event.target.closest('[data-activity-retry]')) loadActivities();
  }

  function resetState() {
    state.open = false;
    state.filter = 'all';
    state.activities = [];
    state.unreadCount = 0;
    state.nextBefore = null;
    state.loading = false;
    state.error = '';
    updateBadge();
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('zc-activity-open');
  }

  function syncAuthState() {
    const authenticatedNow = isAuthenticatedShell();
    if (authenticatedNow === state.authenticated) return;

    state.authenticated = authenticatedNow;
    if (button) button.hidden = !authenticatedNow;

    if (authenticatedNow) {
      refreshUnreadCount();
    } else {
      resetState();
    }
  }

  function start() {
    mount();
    syncAuthState();

    authTimer = window.setInterval(syncAuthState, 1500);
    refreshTimer = window.setInterval(refreshUnreadCount, 15000);
    authTimer.unref?.();
    refreshTimer.unref?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
