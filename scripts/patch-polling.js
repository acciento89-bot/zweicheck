const fs = require('node:fs');

const file = 'app.js';
let source = fs.readFileSync(file, 'utf8');
const oldCode = "    state.pollingTimer = window.setInterval(() => loadData({ quiet: true }).then(render), 15000);";
const patchedCodeV1 = `    state.pollingTimer = window.setInterval(async () => {
      await loadData({ quiet: true });
      if (!document.querySelector('#app form[data-form]')) render();
    }, 15000);`;
const patchedCodeV2 = `    state.pollingTimer = window.setInterval(async () => {
      await loadData({ quiet: true });
      const pollingLocked = document.querySelector(
        '#app form[data-form], #app [data-zc-account-privacy], #app [data-zc-polling-lock]'
      );
      if (!pollingLocked) render();
    }, 15000);`;
const stablePollingCode = `    state.pollingTimer = window.setInterval(async () => {
      await loadData({ quiet: true });
      window.dispatchEvent(new CustomEvent('zweicheck:data-refreshed'));
    }, 15000);`;

// Hintergrund-Aktualisierung darf niemals den sichtbaren Renderbaum ersetzen.
// Das verhindert, dass Login-Zielansichten, Prüfschritte, Selects, Reminder,
// Bilder oder geöffnete Hilfebereiche während der Bedienung zurückgesetzt werden.
if (!source.includes(stablePollingCode)) {
  if (source.includes(patchedCodeV2)) {
    source = source.replace(patchedCodeV2, stablePollingCode);
  } else if (source.includes(patchedCodeV1)) {
    source = source.replace(patchedCodeV1, stablePollingCode);
  } else if (source.includes(oldCode)) {
    source = source.replace(oldCode, stablePollingCode);
  } else {
    throw new Error('Expected polling code was not found in app.js');
  }
}

const oldDetail = '<section class="detail-card">';
const newDetail = `<section class="detail-card" data-check-detail data-check-id="\${escapeHtml(item.id)}" data-check-role="\${isRequester ? 'requester' : 'reviewer'}" data-check-status="\${escapeHtml(item.status)}">`;
if (!source.includes(newDetail)) {
  if (!source.includes(oldDetail)) throw new Error('Expected check detail card was not found in app.js');
  source = source.replace(oldDetail, newDetail);
}

fs.writeFileSync(file, source);

const trustFile = 'trust-routing.js';
if (fs.existsSync(trustFile)) {
  let trustSource = fs.readFileSync(trustFile, 'utf8');
  const oldObserver = "  observer.observe(document.documentElement, { childList: true, subtree: true });";
  const newObserver = `  const appRoot = document.getElementById('app');\n  if (appRoot) observer.observe(appRoot, { childList: true });`;

  if (!trustSource.includes(newObserver)) {
    if (!trustSource.includes(oldObserver)) throw new Error('Expected trust routing observer was not found in trust-routing.js');
    trustSource = trustSource.replace(oldObserver, newObserver);
  }

  const oldRoutingRender = `  function renderRoutingCard() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    if (!detail || !state.routing || detail.dataset.checkId !== state.routing.checkId) return;
    const old = document.querySelector('[data-zc-routing-card]');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = routingCardHtml(state.routing);
    const card = wrapper.firstElementChild;
    if (old) old.replaceWith(card);
    else detail.after(card);
  }`;
  const stableRoutingRender = `  function renderRoutingCard() {
    const detail = document.querySelector('[data-check-detail][data-check-id]');
    if (!detail || !state.routing || detail.dataset.checkId !== state.routing.checkId) return;
    const old = document.querySelector('[data-zc-routing-card]');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = routingCardHtml(state.routing);
    const card = wrapper.firstElementChild;

    // Kein DOM-Austausch, wenn sich inhaltlich nichts geändert hat. Ein dauerndes
    // replaceWith würde andere interaktive Karten daneben unnötig neu layouten.
    if (old && old.dataset.checkId === state.routing.checkId && old.innerHTML === card.innerHTML) return;
    if (old) old.replaceWith(card);
    else detail.after(card);
  }`;

  if (!trustSource.includes(stableRoutingRender)) {
    if (!trustSource.includes(oldRoutingRender)) throw new Error('Expected routing renderer was not found in trust-routing.js');
    trustSource = trustSource.replace(oldRoutingRender, stableRoutingRender);
  }

  fs.writeFileSync(trustFile, trustSource);
}

const escalationFile = 'escalation-client.js';
if (fs.existsSync(escalationFile)) {
  let escalationSource = fs.readFileSync(escalationFile, 'utf8');

  const oldCardMarker = `      card.dataset.checkId = escalation.checkId;`;
  const stableCardMarker = `      card.dataset.checkId = escalation.checkId;\n      card.dataset.zcPollingLock = 'true';`;
  if (!escalationSource.includes(stableCardMarker)) {
    if (!escalationSource.includes(oldCardMarker)) throw new Error('Expected escalation card marker was not found.');
    escalationSource = escalationSource.replace(oldCardMarker, stableCardMarker);
  }

  const oldRenderGuard = `    const key = renderKey(escalation);\n    if (card.dataset.zcEscalationRenderKey !== key) {`;
  const stableRenderGuard = `    const key = renderKey(escalation);\n    const userIsInteracting = card.matches(':focus-within');\n    if (!userIsInteracting && card.dataset.zcEscalationRenderKey !== key) {`;
  if (!escalationSource.includes(stableRenderGuard)) {
    if (!escalationSource.includes(oldRenderGuard)) throw new Error('Expected escalation render guard was not found.');
    escalationSource = escalationSource.replace(oldRenderGuard, stableRenderGuard);
  }

  const oldSync = `    const checkId = detail.dataset.checkId;\n    loadDetailEscalation(checkId).catch(() => {});\n    renderDetailCard();`;
  const stableSync = `    const checkId = detail.dataset.checkId;\n    const activeReminderControl = document.querySelector('[data-zc-escalation-card]:focus-within');\n    if (!activeReminderControl) loadDetailEscalation(checkId).catch(() => {});\n    renderDetailCard();`;
  if (!escalationSource.includes(stableSync)) {
    if (!escalationSource.includes(oldSync)) throw new Error('Expected escalation sync code was not found.');
    escalationSource = escalationSource.replace(oldSync, stableSync);
  }

  fs.writeFileSync(escalationFile, escalationSource);
}
