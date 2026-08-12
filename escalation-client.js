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
      const label = `${minutes} Minuten`;
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
          <span class="eyebrow">Optional</span>
          <strong>Soll ZweiCheck nochmal erinnern?</strong>
        </div>
        <label>Wenn niemand antwortet
          <select name="escalationReminderMinutes" data-zc-escalation-create-minutes>
            <option value="0">Nein, nicht erinnern</option>
            ${reminderOptions()}
          </select>
        </label>
        <label class="zc-escalation-toggle">
          <input type="checkbox" name="escalationAutoReroute" value="true" data-zc-escalation-create-auto>
          <span><strong>Danach automatisch die zweite Person fragen</strong><small>Nur möglich, wenn du eine zweite Person ausgewählt hast.</small></span>
        </label>
        <small class="zc-escalation-safe">Sobald jemand antwortet, hört ZweiCheck automatisch auf.</small>`;

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
      return '<p>ZweiCheck erinnert bei dieser Anfrage nicht automatisch.</p>';
    }
    if (escalation.state === 'waiting_reminder') {
      return `<p>Wenn bis dahin niemand antwortet, erinnert ZweiCheck in <strong data-zc-escalation-countdown="reminder">${escapeHtml(remainingText(escalation.reminderAt))}</strong> nochmal.</p>`;
    }
    if (escalation.state === 'waiting_reroute') {
      return `<p>Die erste Person wurde erinnert. Ohne Antwort fragt ZweiCheck in <strong data-zc-escalation-countdown="reroute">${escapeHtml(remainingText(escalation.rerouteAt))}</strong> automatisch ${escapeHtml(escalation.fallbackReviewer?.name || 'die zweite Person')}.</p>`;
    }
    if (escalation.state === 'reminded') {
      return '<p>ZweiCheck hat nochmal erinnert. Jetzt wird weiter auf eine Antwort gewartet.</p>';
    }
    if (escalation.state === 'rerouted') {
      return '<p>ZweiCheck hat automatisch die zweite Person um Hilfe gebeten.</p>';
    }
    if (escalation.state === 'cancelled') {
      const reason = escalation.lastError ? `<small>${escapeHtml(escalation.lastError)}</small>` : '';
      return `<p>Diese automatische Erinnerung ist beendet.</p>${reason}`;
    }
    return '';
  }

  function manageHtml(escalation) {
    if (escalation.role !== 'requester' || !escalation.canManage) return '';

    if (escalation.enabled) {
      const label = escalation.state === 'waiting_reroute'
        ? 'Automatisches Weitergeben stoppen'
        : 'Erinnerung stoppen';
      return `<div class="zc-escalation-actions"><button type="button" class="button button-secondary" data-zc-escalation-cancel>${escapeHtml(label)}</button></div>`;
    }

    if (!escalation.canConfigure) return '';
    const hasFallback = Boolean(escalation.fallbackReviewer);
    return `
      <div class="zc-escalation-config">
        <label>Wann soll ZweiCheck erinnern?
          <select data-zc-escalation-detail-minutes>${reminderOptions(15)}</select>
        </label>
        <label class="zc-escalation-toggle ${hasFallback ? '' : 'is-disabled'}">
          <input type="checkbox" data-zc-escalation-detail-auto ${hasFallback ? '' : 'disabled'}>
          <span><strong>Danach die zweite Person fragen</strong><small>${hasFallback ? `Zweite Person: ${escapeHtml(escalation.fallbackReviewer.name)}` : 'Für diese Anfrage wurde keine zweite Person ausgewählt.'}</small></span>
        </label>
        <button type="button" class="button button-primary" data-zc-escalation-enable>Erinnerung einschalten</button>
      </div>`;
  }

  function cardHtml(escalation) {
    const meta = stateMeta(escalation);
    const autoText = escalation?.exists && escalation.autoReroute
      ? `<span>Zweite Person automatisch fragen: <strong>Ja</strong></span>`
      : escalation?.exists
        ? '<span>Zweite Person automatisch fragen: Nein</span>'
        : '';
    return `
      <div class="zc-escalation-heading">
        <div><span class="eyebrow">Automatische Hilfe</span><h2>Wenn niemand antwortet</h2></div>
        <span class="zc-escalation-state is-${meta.className}">${escapeHtml(meta.label)}</span>
      </div>
      <div class="zc-escalation-body">${statusBody(escalation)}</div>
      ${escalation?.exists ? `<div class="zc-escalation-meta"><span>Erinnerung nach: ${escapeHtml(String(escalation.reminderMinutes || '–'))} Min.</span>${autoText}</div>` : ''}
      ${manageHtml(escalation)}
      <small class="zc-escalation-safe">Sobald jemand antwortet oder du die Anfrage beendest, hört ZweiCheck automatisch auf.</small>`;
  }

  function renderKey(escalation) {
    return JSON.stringify({
      checkId: escalation?.checkId || null,
      role: escalation?.role || null,
      exists: Boolean(escalation?.exists),
      enabled: Boolean(escalation?.enabled),
      state: escalation?.state || null,
      reminderMinutes: escalation?.reminderMinutes ?? null,
      reminderAt: escalation?.reminderAt || null,
      remindedAt: escalation?.remindedAt || null,
      autoReroute: Boolean(escalation?.autoReroute),
      rerouteAt: escalation?.rerouteAt || null,
      reroutedAt: escalation?.reroutedAt || null,
      cancelledAt: escalation?.cancelledAt || null,
      canManage: Boolean(escalation?.canManage),
      canConfigure: Boolean(escalation?.canConfigure),
      fallbackId: escalation?.fallbackReviewer?.id || null,
      fallbackName: escalation?.fallbackReviewer?.name || null,
      lastError: escalation?.lastError || null
    });
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

    // Wichtig: nicht anhand von innerHTML neu rendern. Sonst gilt jede Auswahl im
    // <select> als DOM-Abweichung und wird beim 1-Sekunden-Tick wieder auf 15 Min.
    // zurückgesetzt. Nur echte Server-Zustandsänderungen dürfen die Karte ersetzen.
    const key = renderKey(escalation);
    if (card.dataset.zcEscalationRenderKey !== key) {
      card.innerHTML = cardHtml(escalation);
      card.dataset.zcEscalationRenderKey = key;
    }

    // Countdowns aktualisieren ohne die Bedienelemente neu aufzubauen.
    const reminderCountdown = card.querySelector('[data-zc-escalation-countdown="reminder"]');
    if (reminderCountdown) reminderCountdown.textContent = remainingText(escalation.reminderAt);
    const rerouteCountdown = card.querySelector('[data-zc-escalation-countdown="reroute"]');
    if (rerouteCountdown) rerouteCountdown.textContent = remainingText(escalation.rerouteAt);
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

  function setLeadingText(element, text) {
    if (!element) return;
    const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (node) node.textContent = `${text}\n`;
  }

  function makeSimpleStep(number, title, text) {
    const section = document.createElement('section');
    section.className = 'zc-simple-step';
    section.dataset.zcSimpleStep = String(number);
    section.innerHTML = `
      <div class="zc-simple-step-heading">
        <span class="eyebrow">Schritt ${number} von 4</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="zc-simple-step-body" data-zc-simple-step-body></div>`;
    return section;
  }

  function makeStepButtons({ back = false, next = false } = {}) {
    const row = document.createElement('div');
    row.className = 'zc-simple-step-actions';
    if (back) row.insertAdjacentHTML('beforeend', '<button type="button" class="button button-secondary" data-zc-simple-back>Zurück</button>');
    if (next) row.insertAdjacentHTML('beforeend', '<button type="button" class="button button-primary" data-zc-simple-next>Weiter</button>');
    return row;
  }

  function updateSimpleSummary(form) {
    const summary = form.querySelector('[data-zc-simple-summary]');
    if (!summary) return;
    const reviewer = form.querySelector('select[name="reviewerId"]')?.selectedOptions?.[0]?.textContent?.split(' · ')[0]?.trim() || 'Vertrauensperson';
    const category = form.querySelector('input[name="category"]:checked')?.closest('.option-card')?.querySelector('strong')?.textContent?.trim() || 'Prüfung';
    summary.innerHTML = `
      <div><small>Du fragst</small><strong>${escapeHtml(reviewer)}</strong></div>
      <div><small>Es geht um</small><strong>${escapeHtml(category)}</strong></div>`;
  }

  function showSimpleStep(form, number) {
    const step = Math.max(1, Math.min(4, Number(number) || 1));
    form.dataset.zcSimpleCurrentStep = String(step);
    form.querySelectorAll('[data-zc-simple-step]').forEach((section) => {
      section.hidden = Number(section.dataset.zcSimpleStep) !== step;
    });
    const current = form.querySelector('[data-zc-simple-current]');
    const bar = form.querySelector('[data-zc-simple-progress-bar]');
    if (current) current.textContent = String(step);
    if (bar) bar.style.width = `${step * 25}%`;
    if (step === 4) updateSimpleSummary(form);
  }

  function validateSimpleStep(form, number) {
    if (number === 1) {
      const reviewer = form.querySelector('select[name="reviewerId"]');
      return reviewer ? reviewer.reportValidity() : false;
    }
    if (number === 2) {
      const checked = form.querySelector('input[name="category"]:checked');
      if (checked) return true;
      window.alert('Bitte wähle aus, worum es geht.');
      return false;
    }
    if (number === 3) {
      const description = form.querySelector('textarea[name="description"]');
      return description ? description.reportValidity() : false;
    }
    return true;
  }

  function syncAdvancedFields(form) {
    const holder = form.querySelector('[data-zc-simple-advanced-body]');
    if (!holder) return;

    const fallback = form.querySelector('[data-zc-fallback-field]');
    if (fallback) {
      if (fallback.parentElement !== holder) holder.append(fallback);
      setLeadingText(fallback, 'Wer soll sonst helfen? (optional)');
      const hint = fallback.querySelector('small');
      if (hint) hint.textContent = 'Nur falls die erste Person nicht antworten kann.';
    }

    const escalation = form.querySelector('[data-zc-escalation-create]');
    if (escalation && escalation.parentElement !== holder) holder.append(escalation);
  }

  function enhanceSimpleCreateForm(form) {
    if (!form) return;

    if (!form.dataset.zcSimpleFlow) {
      const reviewerLabel = form.querySelector('select[name="reviewerId"]')?.closest('label');
      const categoryFieldset = form.querySelector('input[name="category"]')?.closest('fieldset');
      const descriptionLabel = form.querySelector('textarea[name="description"]')?.closest('label');
      const imageLabel = form.querySelector('input[name="images"]')?.closest('label');
      const formGrid = form.querySelector('.form-grid');
      const safety = [...form.querySelectorAll('.notice')].find((item) => item.textContent.includes('noch nichts tun'));
      const submit = form.querySelector('button[type="submit"]');
      if (!reviewerLabel || !categoryFieldset || !descriptionLabel || !imageLabel || !formGrid || !safety || !submit) return;

      form.dataset.zcSimpleFlow = 'true';
      form.classList.add('zc-simple-flow');
      document.body.classList.add('zc-senior-first');

      const pageHeading = form.previousElementSibling?.classList?.contains('page-heading') ? form.previousElementSibling : null;
      if (pageHeading) {
        const eyebrow = pageHeading.querySelector('.eyebrow');
        const heading = pageHeading.querySelector('h1');
        if (eyebrow) eyebrow.textContent = 'Prüfung starten';
        if (heading) heading.textContent = 'Wir gehen Schritt für Schritt';
        if (!pageHeading.querySelector('[data-zc-simple-intro]')) {
          const intro = document.createElement('p');
          intro.dataset.zcSimpleIntro = 'true';
          intro.textContent = 'Du musst nichts vorbereiten. Beantworte einfach eine Frage nach der anderen.';
          pageHeading.append(intro);
        }
      }

      setLeadingText(reviewerLabel, 'Wen möchtest du fragen?');
      const legend = categoryFieldset.querySelector('legend');
      if (legend) legend.textContent = 'Was möchtest du prüfen?';
      setLeadingText(descriptionLabel, 'Was ist passiert?');
      const description = descriptionLabel.querySelector('textarea');
      if (description) description.placeholder = 'Schreib einfach in deinen Worten, was passiert ist …';
      setLeadingText(imageLabel, 'Hast du ein Bild oder einen Screenshot? (optional)');
      const imageHint = imageLabel.querySelector('small');
      if (imageHint) imageHint.textContent = 'Du kannst bis zu 3 Bilder hinzufügen. Keine TANs oder Passwörter fotografieren.';

      const amountLabel = formGrid.querySelector('input[name="amount"]')?.closest('label');
      const urgencyLabel = formGrid.querySelector('select[name="urgency"]')?.closest('label');
      setLeadingText(amountLabel, 'Betrag (optional)');
      setLeadingText(urgencyLabel, 'Wie dringend ist es?');
      const urgency = urgencyLabel?.querySelector('select');
      if (urgency) {
        const names = {
          none: 'Nicht dringend',
          low: 'Etwas dringend',
          high: 'Dringend',
          very_high: 'Sehr dringend – ich soll sofort handeln'
        };
        [...urgency.options].forEach((option) => {
          if (names[option.value]) option.textContent = names[option.value];
        });
      }

      submit.textContent = 'Jetzt sicher prüfen lassen';

      const progress = document.createElement('div');
      progress.className = 'zc-simple-progress';
      progress.innerHTML = `
        <span>Schritt <strong data-zc-simple-current>1</strong> von 4</span>
        <div class="zc-simple-progress-track" aria-hidden="true"><i data-zc-simple-progress-bar></i></div>`;

      const step1 = makeSimpleStep(1, 'Wer soll dir helfen?', 'Wähle eine Person, die du kennst und der du vertraust.');
      const step2 = makeSimpleStep(2, 'Worum geht es?', 'Tippe auf die Auswahl, die am besten passt.');
      const step3 = makeSimpleStep(3, 'Was ist passiert?', 'Schreib kurz auf, warum du unsicher bist. Ein oder zwei Sätze reichen.');
      const step4 = makeSimpleStep(4, 'Alles richtig?', 'Prüfe kurz die wichtigsten Angaben und sende die Anfrage dann ab.');

      step1.querySelector('[data-zc-simple-step-body]').append(reviewerLabel);
      step1.append(makeStepButtons({ next: true }));
      step2.querySelector('[data-zc-simple-step-body]').append(categoryFieldset);
      step2.append(makeStepButtons({ back: true, next: true }));
      step3.querySelector('[data-zc-simple-step-body]').append(descriptionLabel, imageLabel);
      step3.append(makeStepButtons({ back: true, next: true }));

      const finalBody = step4.querySelector('[data-zc-simple-step-body]');
      const summary = document.createElement('div');
      summary.className = 'zc-simple-summary';
      summary.dataset.zcSimpleSummary = 'true';
      const advanced = document.createElement('details');
      advanced.className = 'zc-simple-advanced';
      advanced.innerHTML = `
        <summary><strong>Mehr Möglichkeiten</strong><small>Zweite Person und automatische Erinnerung</small></summary>
        <div class="zc-simple-advanced-body" data-zc-simple-advanced-body></div>`;
      finalBody.append(summary, formGrid, advanced, safety, submit);
      step4.append(makeStepButtons({ back: true }));

      form.prepend(progress);
      form.append(step1, step2, step3, step4);
      showSimpleStep(form, 1);
    }

    syncAdvancedFields(form);
  }

  function simplifyMainUi() {
    const shell = document.querySelector('.app-shell');
    if (!shell) {
      document.body.classList.remove('zc-senior-first');
      return;
    }
    document.body.classList.add('zc-senior-first');

    const createButton = document.querySelector('[data-action="create-check"]');
    if (createButton) createButton.textContent = 'Ich bin unsicher – prüfen lassen';

    const connectionsNav = document.querySelector('.bottom-nav [data-view="connections"]');
    if (connectionsNav && !connectionsNav.dataset.zcSimpleLabel) {
      connectionsNav.dataset.zcSimpleLabel = 'true';
      connectionsNav.innerHTML = '<span>◎</span>Personen';
    }

    const presence = document.querySelector('[data-zc-presence-panel]');
    if (presence) {
      const eyebrow = presence.querySelector('.eyebrow');
      const heading = presence.querySelector('h2');
      const description = presence.querySelector('.zc-presence-heading p');
      if (eyebrow) eyebrow.textContent = 'Hilfe-Status';
      if (heading) heading.textContent = 'Kannst du gerade helfen?';
      if (description) description.textContent = 'Deine verbundenen Personen sehen nur diese Auswahl.';
      const duration = presence.querySelector('[data-presence-duration]')?.closest('label');
      setLeadingText(duration, 'Wie lange soll das gelten?');
      const names = {
        available: 'Ja, ich kann helfen',
        urgent_only: 'Nur wenn es dringend ist',
        unavailable: 'Gerade nicht',
        neutral: 'Keine Angabe'
      };
      presence.querySelectorAll('[data-presence-status]').forEach((button) => {
        if (names[button.dataset.presenceStatus]) button.textContent = names[button.dataset.presenceStatus];
      });
    }

    const routing = document.querySelector('[data-zc-routing-card]');
    if (routing) {
      const eyebrow = routing.querySelector('.eyebrow');
      const heading = routing.querySelector('h2');
      if (eyebrow) eyebrow.textContent = 'Wer hilft?';
      if (heading && heading.textContent.trim() === 'Zuständigkeit') heading.textContent = 'Wer hilft gerade?';
      const reroute = routing.querySelector('[data-zc-reroute]');
      if (reroute) reroute.textContent = 'Andere Person fragen';
    }
  }

  document.addEventListener('change', (event) => {
    const form = event.target.closest('form[data-form="create-check"]');
    if (form && (
      event.target.matches('[data-zc-escalation-create-minutes]')
      || event.target.matches('select[name="fallbackReviewerId"]')
    )) syncCreateControls(form);
    if (form && form.dataset.zcSimpleFlow) updateSimpleSummary(form);
  });

  document.addEventListener('click', (event) => {
    const next = event.target.closest('[data-zc-simple-next]');
    if (next) {
      const form = next.closest('form[data-form="create-check"]');
      const current = Number(form?.dataset.zcSimpleCurrentStep || 1);
      if (form && validateSimpleStep(form, current)) showSimpleStep(form, current + 1);
      return;
    }

    const back = event.target.closest('[data-zc-simple-back]');
    if (back) {
      const form = back.closest('form[data-form="create-check"]');
      const current = Number(form?.dataset.zcSimpleCurrentStep || 1);
      if (form) showSimpleStep(form, current - 1);
      return;
    }

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
      document.body.classList.remove('zc-senior-first');
      return;
    }
    decorateCreateForm();
    enhanceSimpleCreateForm(document.querySelector('form[data-form="create-check"]'));
    simplifyMainUi();
    syncDetail();
  }

  const timer = window.setInterval(tick, 1_000);
  timer.unref?.();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();
