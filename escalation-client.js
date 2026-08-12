(() => {
  'use strict';

  const state = {
    detailId: null,
    escalation: null,
    loading: false,
    lastLoadedAt: 0
  };

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

  function reminderOptions(selected = '') {
    const values = [5, 15, 30, 60, 120];
    return values.map((minutes) => {
      const label = minutes < 60 ? `${minutes} Minuten` : minutes === 60 ? '1 Stunde' : '2 Stunden';
      return `<option value="${minutes}" ${String(selected) === String(minutes) ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  function decorateCreateForm() {
    const form = document.querySelector('form[data-form="create-check"]');
    if (!form) return;

    let block = form.querySelector('[data-zc-escalation-create]');
    if (!block) {
      block = document.createElement('section');
      block.className = 'zc-escalation-create';
      block.dataset.zcEscalationCreate = 'true';
      block.innerHTML = `
        <div class="zc-escalation-create-heading">
          <span class="eyebrow">Eskalation optional</span>
          <strong>Nicht auf eine Antwort warten müssen</strong>
        </div>
        <label>Erinnern, falls keine Antwort kommt
          <select name="escalationReminderMinutes" data-zc-escalation-create-minutes>
            <option value="0">Keine Automatik</option>
            ${reminderOptions()}
          </select>
        </label>
        <label class="zc-escalation-toggle">
          <input type="checkbox" name="escalationAutoReroute" value="true" data-zc-escalation-create-auto>
          <span><strong>15 Minuten später automatisch weitergeben</strong><small>Nur möglich, wenn oben eine Ausweichperson gewählt wurde.</small></span>
        </label>
        <small class="zc-escalation-safe">Eine Antwort oder das Abschließen der Prüfung beendet die Automatik sofort.</small>`;

      const fallback = form.querySelector('[data-zc-fallback-field]');
      const reviewer = form.querySelector('select[name="reviewerId"]')?.closest('label');
      if (fallback) fallback.after(block);
      else reviewer?.after(block);
    }

    syncCreateControls(form);
  }

  function syncCreateControls(form) {
    const minutes = form.querySelector('[data-zc-escalation-create-minutes]');
    const auto = form.querySelector('[data-zc-escalation-create-auto]');
    const fallback = form.querySelector('select[name="fallbackReviewerId"]');
    if (!minutes || !auto) return;

    const enabled = Number(minutes.value) > 0;
    const hasFallback = Boolean(fallback?.value);
    auto.disabled = !enabled || !hasFallback;
    if (auto.disabled) auto.checked = false;
    auto.closest('.zc-escalation-toggle')?.classList.toggle('is-disabled', auto.disabled);
  }

  function remainingText(dateValue) {
    if (!dateValue) return '';
    const remaining = new Date(dateValue).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return '';
    if (remaining <= 0) return 'jeden Moment';
    const totalSeconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function stateMeta(escalation) {
    switch (escalation?.state) {
      case 'waiting_reminder': return { label: 'Wartet', className: 'waiting' };
      case 'waiting_reroute': return { label: 'Erinnert', className: 'warning' };
      case 'reminded': return { label: 'Erinnert', className: 'warning' };
      case 'rerouted': return { label: 'Weitergegeben', className: 'done' };
      case 'cancelled': return { label: 'Beendet', className: 'muted' };
      default: return { label: 'Nicht aktiv', className: 'muted' };
    }
  }

  function statusBody(escalation) {
    if (!escalation?.exists || escalation.state === 'disabled') {
      return '<p>Für diese Prüfanfrage ist keine Eskalationsautomatik eingerichtet.</p>';
    }
    if (escalation.state === 'waiting_reminder') {
      return `<p>Die Vertrauensperson wird in <strong data-zc-escalation-countdown="reminder">${escapeHtml(remainingText(escalation.reminderAt))}</strong> erinnert.</p>`;
    }
    if (escalation.state === 'waiting_reroute') {
      return `<p>Die Erinnerung wurde gesendet. Ohne Antwort wird die Anfrage in <strong data-zc-escalation-countdown="reroute">${escapeHtml(remainingText(escalation.rerouteAt))}</strong> automatisch an ${escapeHtml(escalation.fallbackReviewer?.name || 'die Ausweichperson')} weitergegeben.</p>`;
    }
    if (escalation.state === 'reminded') {
      return '<p>Die Vertrauensperson wurde erinnert. Eine automatische Weitergabe ist für diese Anfrage nicht aktiviert.</p>';
    }
    if (escalation.state === 'rerouted') {
      return '<p>Die Anfrage wurde durch den zuvor eingerichteten Eskalationsplan automatisch weitergegeben.</p>';
    }
    if (escalation.state === 'cancelled') {
      const reason = escalation.lastError ? `<small>${escapeHtml(escalation.lastError)}</small>` : '';
      return `<p>Der Eskalationsplan ist nicht mehr aktiv.</p>${reason}`;
    }
    return '';
  }

  function manageHtml(escalation) {
    if (escalation.role !== 'requester' || !escalation.canManage) return '';

    if (escalation.enabled) {
      const label = escalation.state === 'waiting_reroute'
        ? 'Automatische Weitergabe stoppen'
        : 'Eskalationsplan stoppen';
      return `<div class="zc-escalation-actions"><button type="button" class="button button-secondary" data-zc-escalation-cancel>${escapeHtml(label)}</button></div>`;
    }

    if (!escalation.canConfigure) return '';
    const hasFallback = Boolean(escalation.fallbackReviewer);
    return `
      <div class="zc-escalation-config">
        <label>Erinnerung nach
          <select data-zc-escalation-detail-minutes>${reminderOptions(15)}</select>
        </label>
        <label class="zc-escalation-toggle ${hasFallback ? '' : 'is-disabled'}">
          <input type="checkbox" data-zc-escalation-detail-auto ${hasFallback ? '' : 'disabled'}>
          <span><strong>15 Minuten später automatisch weitergeben</strong><small>${hasFallback ? `Ausweichperson: ${escapeHtml(escalation.fallbackReviewer.name)}` : 'Für diese Anfrage ist keine Ausweichperson hinterlegt.'}</small></span>
        </label>
        <button type="button" class="button button-primary" data-zc-escalation-enable>Eskalation aktivieren</button>
      </div>`;
  }

  function cardHtml(escalation) {
    const meta = stateMeta(escalation);
    const autoText = escalation?.exists && escalation.autoReroute
      ? `<span>Ausweichautomatik: <strong>an</strong></span>`
      : escalation?.exists
        ? '<span>Ausweichautomatik: aus</span>'
        : '';
    return `
      <div class="zc-escalation-heading">
        <div><span class="eyebrow">Phase 3.5</span><h2>Eskalationsplan</h2></div>
        <span class="zc-escalation-state is-${meta.className}">${escapeHtml(meta.label)}</span>
      </div>
      <div class="zc-escalation-body">${statusBody(escalation)}</div>
      ${escalation?.exists ? `<div class="zc-escalation-meta"><span>Erinnerung: ${escapeHtml(String(escalation.reminderMinutes || '–'))} Min.</span>${autoText}</div>` : ''}
      ${manageHtml(escalation)}
      <small class="zc-escalation-safe">Sobald die Prüfung beantwortet, abgeschlossen oder manuell weitergegeben wird, stoppt die Automatik.</small>`;
  }

  function renderDetailCard() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    const escalation = state.escalation;
    if (!detail || !escalation || detail.dataset.checkId !== escalation.checkId) {
      document.querySelector('[data-zc-escalation-card]')?.remove();
      return;
    }

    if (escalation.role !== 'requester' && !escalation.exists) {
      document.querySelector('[data-zc-escalation-card]')?.remove();
      return;
    }

    let card = document.querySelector('[data-zc-escalation-card]');
    if (!card || card.dataset.checkId !== escalation.checkId) {
      card?.remove();
      card = document.createElement('section');
      card.className = 'panel zc-escalation-card';
      card.dataset.zcEscalationCard = 'true';
      card.dataset.checkId = escalation.checkId;
      const routing = document.querySelector(`[data-zc-routing-card][data-check-id="${CSS.escape(escalation.checkId)}"]`);
      if (routing) routing.after(card);
      else detail.after(card);
    }

    const html = cardHtml(escalation);
    if (card.innerHTML !== html) card.innerHTML = html;
  }

  async function loadDetailEscalation(checkId, { force = false } = {}) {
    if (!checkId || state.loading) return;
    if (!force && state.detailId === checkId && Date.now() - state.lastLoadedAt < 8_000) return;
    state.loading = true;
    try {
      const result = await api(`/api/checks/${encodeURIComponent(checkId)}/escalation`);
      state.detailId = checkId;
      state.escalation = result.escalation;
      state.lastLoadedAt = Date.now();
      renderDetailCard();
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        state.escalation = null;
        document.querySelector('[data-zc-escalation-card]')?.remove();
      }
    } finally {
      state.loading = false;
    }
  }

  function syncDetail() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    if (!detail) {
      state.detailId = null;
      state.escalation = null;
      state.lastLoadedAt = 0;
      document.querySelector('[data-zc-escalation-card]')?.remove();
      return;
    }
    const checkId = detail.dataset.checkId;
    loadDetailEscalation(checkId).catch(() => {});
    renderDetailCard();
  }

  async function updateEscalation(payload, button) {
    const checkId = state.detailId;
    if (!checkId) return;
    const previous = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Wird gespeichert …';
    }
    try {
      const result = await api(`/api/checks/${encodeURIComponent(checkId)}/escalation`, {
        method: 'PUT',
        body: payload
      });
      state.escalation = result.escalation;
      state.lastLoadedAt = Date.now();
      renderDetailCard();
    } catch (error) {
      window.alert(error.message);
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = previous;
      }
    }
  }

  document.addEventListener('change', (event) => {
    const form = event.target.closest('form[data-form="create-check"]');
    if (form && (
      event.target.matches('[data-zc-escalation-create-minutes]')
      || event.target.matches('select[name="fallbackReviewerId"]')
    )) syncCreateControls(form);
  });

  document.addEventListener('click', (event) => {
    const enable = event.target.closest('[data-zc-escalation-enable]');
    if (enable) {
      const card = enable.closest('[data-zc-escalation-card]');
      const reminderMinutes = Number(card?.querySelector('[data-zc-escalation-detail-minutes]')?.value || 15);
      const autoReroute = Boolean(card?.querySelector('[data-zc-escalation-detail-auto]')?.checked);
      updateEscalation({ enabled: true, reminderMinutes, autoReroute }, enable).catch(() => {});
      return;
    }

    const cancel = event.target.closest('[data-zc-escalation-cancel]');
    if (cancel) updateEscalation({ enabled: false }, cancel).catch(() => {});
  });

  function tick() {
    if (!document.querySelector('.app-shell')) {
      state.detailId = null;
      state.escalation = null;
      document.querySelector('[data-zc-escalation-card]')?.remove();
      return;
    }
    decorateCreateForm();
    syncDetail();
  }

  const timer = window.setInterval(tick, 1_000);
  timer.unref?.();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();
