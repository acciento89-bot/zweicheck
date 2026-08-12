(() => {
  'use strict';

  const state = {
    authenticated: false,
    self: { status: 'neutral', expiresAt: null, updatedAt: null },
    connections: [],
    loading: false,
    lastLoadedAt: 0,
    currentDetailId: null,
    routing: null,
    routingLoading: false
  };

  const STATUS = {
    neutral: { label: 'Status nicht gesetzt', icon: '○', className: 'neutral' },
    available: { label: 'Verfügbar', icon: '●', className: 'available' },
    urgent_only: { label: 'Nur dringend', icon: '!', className: 'urgent' },
    unavailable: { label: 'Nicht verfügbar', icon: '–', className: 'unavailable' }
  };

  let observerQueued = false;
  let refreshTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
    if (!response.ok) {
      const error = new Error(body?.error || 'Die Anfrage ist fehlgeschlagen.');
      error.status = response.status;
      error.code = body?.code;
      throw error;
    }
    return body;
  }

  function isAuthenticatedShell() {
    return Boolean(document.querySelector('.app-shell'));
  }

  function statusMeta(status) {
    return STATUS[status] || STATUS.neutral;
  }

  function statusBadge(presence, compact = false) {
    const meta = statusMeta(presence?.status);
    return `<span class="zc-presence-badge is-${meta.className}${compact ? ' is-compact' : ''}"><i>${meta.icon}</i>${escapeHtml(meta.label)}</span>`;
  }

  function expiryText(presence) {
    if (!presence?.expiresAt) return 'bis du ihn änderst';
    const date = new Date(presence.expiresAt);
    if (Number.isNaN(date.getTime())) return 'zeitlich begrenzt';
    return `bis ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date)} Uhr`;
  }

  async function refreshTrustData({ force = false } = {}) {
    if (!state.authenticated || state.loading) return;
    if (!force && Date.now() - state.lastLoadedAt < 10_000) return;
    state.loading = true;
    try {
      const result = await api('/api/trust-routing');
      state.self = result.self;
      state.connections = result.connections || [];
      state.lastLoadedAt = Date.now();
      decorateAll();
    } catch (error) {
      if (error.status === 401) state.authenticated = false;
    } finally {
      state.loading = false;
    }
  }

  function presencePanelHtml() {
    const meta = statusMeta(state.self.status);
    return `
      <section class="panel zc-presence-panel" data-zc-presence-panel>
        <div class="zc-presence-heading">
          <div><span class="eyebrow">Bereitschaft</span><h2>Wann bist du erreichbar?</h2><p>Deine Vertrauenspersonen sehen nur diesen Status – keine Standort- oder Aktivitätsdaten.</p></div>
          ${statusBadge(state.self)}
        </div>
        <div class="zc-presence-controls">
          <label>Gültigkeit
            <select data-presence-duration>
              <option value="60">1 Stunde</option>
              <option value="240">4 Stunden</option>
              <option value="480">8 Stunden</option>
              <option value="0" selected>Bis ich ihn ändere</option>
            </select>
          </label>
          <div class="zc-presence-actions">
            <button type="button" class="zc-status-button is-available ${state.self.status === 'available' ? 'active' : ''}" data-presence-status="available">● Verfügbar</button>
            <button type="button" class="zc-status-button is-urgent ${state.self.status === 'urgent_only' ? 'active' : ''}" data-presence-status="urgent_only">! Nur dringend</button>
            <button type="button" class="zc-status-button is-unavailable ${state.self.status === 'unavailable' ? 'active' : ''}" data-presence-status="unavailable">– Nicht verfügbar</button>
            <button type="button" class="zc-status-button is-neutral ${state.self.status === 'neutral' ? 'active' : ''}" data-presence-status="neutral">○ Zurücksetzen</button>
          </div>
        </div>
        <small class="zc-presence-hint">Aktuell: ${escapeHtml(meta.label)} · ${escapeHtml(expiryText(state.self))}</small>
      </section>`;
  }

  function decorateConnectionsView() {
    const inviteForm = document.querySelector('form[data-form="invite-create"]');
    if (!inviteForm) return;
    const heading = inviteForm.closest('.split-grid')?.previousElementSibling || document.querySelector('.page-heading');
    if (!document.querySelector('[data-zc-presence-panel]')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = presencePanelHtml();
      const panel = wrapper.firstElementChild;
      const pageHeading = document.querySelector('.page-heading');
      if (pageHeading) pageHeading.after(panel);
      else heading?.before(panel);
    } else {
      const existing = document.querySelector('[data-zc-presence-panel]');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = presencePanelHtml();
      existing.replaceWith(wrapper.firstElementChild);
    }

    const byEmail = new Map(state.connections.map((entry) => [String(entry.person.email).toLowerCase(), entry]));
    document.querySelectorAll('.person-card').forEach((card) => {
      const small = card.querySelector('small');
      const email = small?.textContent?.trim().toLowerCase();
      const match = email ? byEmail.get(email) : null;
      const old = card.querySelector('[data-zc-person-presence]');
      if (!match) {
        old?.remove();
        return;
      }
      const holder = document.createElement('span');
      holder.dataset.zcPersonPresence = 'true';
      holder.innerHTML = statusBadge(match.presence, true);
      if (old) old.replaceWith(holder);
      else card.querySelector('div')?.append(holder);
    });
  }

  function sortedConnections(excludeId = null) {
    const rank = { available: 0, urgent_only: 1, neutral: 2, unavailable: 3 };
    return [...state.connections]
      .filter((entry) => entry.person.id !== excludeId)
      .sort((a, b) => {
        const byStatus = (rank[a.presence?.status] ?? 2) - (rank[b.presence?.status] ?? 2);
        return byStatus || a.person.name.localeCompare(b.person.name, 'de');
      });
  }

  function decorateCreateForm() {
    const form = document.querySelector('form[data-form="create-check"]');
    const reviewer = form?.querySelector('select[name="reviewerId"]');
    if (!form || !reviewer || !state.connections.length) return;

    const map = new Map(state.connections.map((entry) => [entry.person.id, entry]));
    [...reviewer.options].forEach((option) => {
      const entry = map.get(option.value);
      if (!entry) return;
      const meta = statusMeta(entry.presence?.status);
      option.textContent = `${entry.person.name} · ${meta.label}`;
    });

    let fallbackLabel = form.querySelector('[data-zc-fallback-field]');
    if (!fallbackLabel) {
      fallbackLabel = document.createElement('label');
      fallbackLabel.dataset.zcFallbackField = 'true';
      reviewer.closest('label')?.after(fallbackLabel);
    }

    const currentFallback = fallbackLabel.querySelector('select')?.value || '';
    const candidates = sortedConnections(reviewer.value);
    fallbackLabel.innerHTML = `Ausweichperson optional
      <select name="fallbackReviewerId">
        <option value="">Keine Ausweichperson</option>
        ${candidates.map((entry) => {
          const meta = statusMeta(entry.presence?.status);
          return `<option value="${escapeHtml(entry.person.id)}" ${entry.person.id === currentFallback ? 'selected' : ''}>${escapeHtml(entry.person.name)} · ${escapeHtml(meta.label)}</option>`;
        }).join('')}
      </select>
      <small>Falls die erste Person nicht reagieren kann, kannst du die offene Anfrage einmalig weitergeben.</small>`;

    if (!reviewer.dataset.zcRoutingBound) {
      reviewer.dataset.zcRoutingBound = 'true';
      reviewer.addEventListener('change', () => decorateCreateForm());
    }
  }

  function routingCardHtml(routing) {
    const currentPresence = routing.currentReviewer?.presence || { status: 'neutral' };
    const fallback = routing.fallbackReviewer;
    const targets = routing.targets || [];
    const defaultTarget = fallback && targets.some((entry) => entry.person.id === fallback.id)
      ? fallback.id
      : (targets[0]?.person.id || '');

    const history = routing.history?.length
      ? `<div class="zc-routing-history"><strong>Weiterleitungsverlauf</strong>${routing.history.map((entry) => `<span>${escapeHtml(entry.from.name)} → ${escapeHtml(entry.to.name)}</span>`).join('')}</div>`
      : '';

    if (routing.role !== 'requester') {
      return `
        <section class="panel zc-routing-card" data-zc-routing-card data-check-id="${escapeHtml(routing.checkId)}">
          <span class="eyebrow">Zuständigkeit</span><h2>Du bist aktuell dran</h2>
          <p>Die anfragende Person hat diese Prüfung dir zugeordnet.</p>
          ${statusBadge(currentPresence)}
        </section>`;
    }

    const fallbackBlock = fallback
      ? `<div class="zc-routing-person"><span><small>Vorgesehene Ausweichperson</small><strong>${escapeHtml(fallback.name)}</strong></span>${statusBadge(fallback.presence, true)}</div>`
      : '<p class="muted">Für diese Anfrage wurde keine feste Ausweichperson hinterlegt.</p>';

    const action = routing.canReroute
      ? `<div class="zc-routing-action">
          <label>Weitergeben an
            <select data-zc-reroute-target>
              ${targets.map((entry) => {
                const meta = statusMeta(entry.presence?.status);
                return `<option value="${escapeHtml(entry.person.id)}" ${entry.person.id === defaultTarget ? 'selected' : ''}>${escapeHtml(entry.person.name)} · ${escapeHtml(meta.label)}</option>`;
              }).join('')}
            </select>
          </label>
          <button class="button button-warning" type="button" data-zc-reroute>Offene Anfrage weitergeben</button>
          <small>Die bisherige Vertrauensperson verliert den Zugriff auf diese offene Anfrage. Weitergeben ist pro Anfrage einmal möglich.</small>
        </div>`
      : routing.reassignedAt
        ? '<div class="notice notice-calm"><div><strong>Bereits weitergegeben</strong><p>Die Zuständigkeit wurde für diese Anfrage schon einmal geändert.</p></div></div>'
        : routing.status !== 'open'
          ? '<p class="muted">Abgeschlossene oder beantwortete Prüfungen können nicht weitergegeben werden.</p>'
          : '<p class="muted">Keine weitere aktive Vertrauensperson verfügbar.</p>';

    return `
      <section class="panel zc-routing-card" data-zc-routing-card data-check-id="${escapeHtml(routing.checkId)}">
        <div class="zc-routing-heading"><div><span class="eyebrow">Vertrauenskreis 2.0</span><h2>Zuständigkeit</h2></div>${statusBadge(currentPresence)}</div>
        <div class="zc-routing-person"><span><small>Aktuell zuständig</small><strong>${escapeHtml(routing.currentReviewer.name)}</strong></span>${statusBadge(currentPresence, true)}</div>
        ${fallbackBlock}
        ${action}
        ${history}
      </section>`;
  }

  async function loadRouting(detailId, { force = false } = {}) {
    if (!detailId || state.routingLoading) return;
    if (!force && state.routing?.checkId === detailId) {
      renderRoutingCard();
      return;
    }
    state.routingLoading = true;
    try {
      const result = await api(`/api/checks/${encodeURIComponent(detailId)}/routing`);
      state.routing = result.routing;
      state.currentDetailId = detailId;
      renderRoutingCard();
    } catch (error) {
      if (error.status !== 404 && error.status !== 401) console.warn('[trust-routing] Routing konnte nicht geladen werden:', error.message);
    } finally {
      state.routingLoading = false;
    }
  }

  function renderRoutingCard() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    if (!detail || !state.routing || detail.dataset.checkId !== state.routing.checkId) return;
    const old = document.querySelector('[data-zc-routing-card]');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = routingCardHtml(state.routing);
    const card = wrapper.firstElementChild;
    if (old) old.replaceWith(card);
    else detail.after(card);
  }

  function decorateDetail() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    if (!detail) {
      state.currentDetailId = null;
      state.routing = null;
      document.querySelector('[data-zc-routing-card]')?.remove();
      return;
    }
    const id = detail.dataset.checkId;
    if (id !== state.currentDetailId || !state.routing) loadRouting(id);
    else renderRoutingCard();
  }

  function decorateAll() {
    if (!state.authenticated) return;
    decorateConnectionsView();
    decorateCreateForm();
    decorateDetail();
  }

  async function setPresence(status, button) {
    const duration = document.querySelector('[data-presence-duration]')?.value || '0';
    button.disabled = true;
    try {
      const result = await api('/api/trust-routing/presence', {
        method: 'PUT',
        body: { status, durationMinutes: Number(duration) }
      });
      state.self = result.presence;
      state.lastLoadedAt = 0;
      await refreshTrustData({ force: true });
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function reroute(button) {
    const card = button.closest('[data-zc-routing-card]');
    const reviewerId = card?.querySelector('[data-zc-reroute-target]')?.value;
    const option = card?.querySelector(`[data-zc-reroute-target] option[value="${CSS.escape(reviewerId || '')}"]`);
    if (!reviewerId) return;
    const name = option?.textContent?.split(' · ')[0] || 'diese Person';
    if (!window.confirm(`Prüfanfrage wirklich an ${name} weitergeben? Die bisherige Vertrauensperson verliert den Zugriff auf diese offene Anfrage.`)) return;

    button.disabled = true;
    button.textContent = 'Wird weitergegeben …';
    try {
      await api(`/api/checks/${encodeURIComponent(state.currentDetailId)}/reroute`, {
        method: 'POST',
        body: { reviewerId }
      });
      state.routing = null;
      await Promise.all([
        refreshTrustData({ force: true }),
        loadRouting(state.currentDetailId, { force: true })
      ]);
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
      button.textContent = 'Offene Anfrage weitergeben';
    }
  }

  function syncAuth() {
    const authenticated = isAuthenticatedShell();
    if (authenticated !== state.authenticated) {
      state.authenticated = authenticated;
      state.lastLoadedAt = 0;
      state.routing = null;
      state.currentDetailId = null;
      if (authenticated) refreshTrustData({ force: true });
      else {
        document.querySelector('[data-zc-presence-panel]')?.remove();
        document.querySelector('[data-zc-routing-card]')?.remove();
      }
    } else if (authenticated) {
      decorateAll();
    }
  }

  document.addEventListener('click', (event) => {
    const statusButton = event.target.closest('[data-presence-status]');
    if (statusButton) {
      setPresence(statusButton.dataset.presenceStatus, statusButton);
      return;
    }
    const rerouteButton = event.target.closest('[data-zc-reroute]');
    if (rerouteButton) reroute(rerouteButton);
  });

  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    queueMicrotask(() => {
      observerQueued = false;
      syncAuth();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  refreshTimer = window.setInterval(() => {
    syncAuth();
    if (state.authenticated) refreshTrustData({ force: true });
  }, 20_000);
  refreshTimer.unref?.();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncAuth, { once: true });
  else syncAuth();
})();
