(() => {
  'use strict';

  let configPromise = null;
  let syncing = false;
  let syncedEndpoint = '';

  function supportsPush() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
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
    if (!response.ok) throw new Error(body?.error || 'Push-Einstellung konnte nicht gespeichert werden.');
    return body;
  }

  function loadConfig() {
    if (!configPromise) {
      configPromise = api('/api/push/config').catch((error) => {
        configPromise = null;
        throw error;
      });
    }
    return configPromise;
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  async function registration() {
    return navigator.serviceWorker.ready;
  }

  async function currentSubscription() {
    if (!supportsPush()) return null;
    const serviceWorker = await registration();
    return serviceWorker.pushManager.getSubscription();
  }

  async function saveSubscription(subscription) {
    await api('/api/push/subscriptions', {
      method: 'POST',
      body: { subscription: subscription.toJSON() }
    });
    syncedEndpoint = subscription.endpoint;
  }

  async function syncExistingSubscription() {
    if (!supportsPush() || syncing || !document.querySelector('.app-shell')) return;
    syncing = true;
    try {
      const config = await loadConfig();
      if (!config.enabled || Notification.permission !== 'granted') return;
      const subscription = await currentSubscription();
      if (subscription && subscription.endpoint !== syncedEndpoint) {
        await saveSubscription(subscription);
      }
    } catch {
      // Die sichtbare Kontoeinstellung zeigt Fehler bei einer aktiven Bedienung an.
    } finally {
      syncing = false;
    }
  }

  function setPanelState(panel, { label, detail, button, disabled = false, active = false }) {
    const status = panel.querySelector('[data-push-status]');
    const description = panel.querySelector('[data-push-detail]');
    const toggle = panel.querySelector('[data-push-toggle]');
    status.textContent = label;
    status.className = `status ${active ? 'status-answered' : 'status-open'}`;
    description.textContent = detail;
    toggle.textContent = button;
    toggle.disabled = disabled;
    toggle.dataset.mode = active ? 'disable' : 'enable';
  }

  async function refreshPanel(panel) {
    if (!supportsPush()) {
      setPanelState(panel, {
        label: 'Nicht unterstützt',
        detail: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.',
        button: 'Nicht verfügbar',
        disabled: true
      });
      return;
    }

    try {
      const config = await loadConfig();
      if (!config.enabled) {
        setPanelState(panel, {
          label: 'Noch nicht eingerichtet',
          detail: 'Die sichere Server-Konfiguration fehlt noch.',
          button: 'Noch nicht verfügbar',
          disabled: true
        });
        return;
      }

      if (Notification.permission === 'denied') {
        setPanelState(panel, {
          label: 'Im Browser blockiert',
          detail: 'Erlaube Benachrichtigungen in den Website-Einstellungen deines Browsers.',
          button: 'Im Browser freigeben',
          disabled: true
        });
        return;
      }

      const subscription = await currentSubscription();
      if (subscription) {
        await saveSubscription(subscription);
        setPanelState(panel, {
          label: 'Aktiv',
          detail: 'Neue Prüfanfragen und Antworten erscheinen sofort auf diesem Gerät.',
          button: 'Auf diesem Gerät deaktivieren',
          active: true
        });
      } else {
        setPanelState(panel, {
          label: 'Aus',
          detail: 'Aktiviere Push für neue Prüfanfragen und Antworten.',
          button: 'Push aktivieren'
        });
      }
    } catch (error) {
      setPanelState(panel, {
        label: 'Nicht erreichbar',
        detail: error.message,
        button: 'Erneut versuchen'
      });
    }
  }

  function mountPanel() {
    if (document.querySelector('[data-push-panel]')) return;
    const accountPanel = document.querySelector('.account-panel');
    if (!accountPanel) return;

    const panel = document.createElement('section');
    panel.className = 'panel account-panel';
    panel.dataset.pushPanel = 'true';
    panel.innerHTML = `
      <div class="setting-row">
        <div>
          <strong>Push-Benachrichtigungen</strong>
          <small data-push-detail>Status wird geprüft …</small>
        </div>
        <span class="status status-open" data-push-status>Prüfung …</span>
      </div>
      <button class="button button-secondary" type="button" data-push-toggle disabled>Wird geladen …</button>
      <small class="legal-hint">Die Freigabe gilt nur für dieses Gerät und kann jederzeit wieder entfernt werden.</small>`;
    accountPanel.insertAdjacentElement('afterend', panel);
    refreshPanel(panel);
  }

  async function enablePush(panel) {
    const toggle = panel.querySelector('[data-push-toggle]');
    toggle.disabled = true;
    toggle.textContent = 'Wird aktiviert …';

    try {
      const config = await loadConfig();
      if (!config.enabled || !config.publicKey) throw new Error('Push ist serverseitig noch nicht eingerichtet.');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');

      const serviceWorker = await registration();
      const existing = await serviceWorker.pushManager.getSubscription();
      const subscription = existing || await serviceWorker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey)
      });
      await saveSubscription(subscription);
      await refreshPanel(panel);
    } catch (error) {
      setPanelState(panel, {
        label: Notification.permission === 'denied' ? 'Im Browser blockiert' : 'Fehler',
        detail: error.message,
        button: Notification.permission === 'denied' ? 'Im Browser freigeben' : 'Erneut versuchen',
        disabled: Notification.permission === 'denied'
      });
    }
  }

  async function disablePush(panel) {
    const toggle = panel.querySelector('[data-push-toggle]');
    toggle.disabled = true;
    toggle.textContent = 'Wird deaktiviert …';

    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await api('/api/push/subscriptions', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint }
        });
        await subscription.unsubscribe();
      }
      syncedEndpoint = '';
      await refreshPanel(panel);
    } catch (error) {
      setPanelState(panel, {
        label: 'Fehler',
        detail: error.message,
        button: 'Erneut versuchen',
        active: true
      });
    }
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-push-toggle]');
    if (!toggle) return;
    const panel = toggle.closest('[data-push-panel]');
    if (!panel) return;
    if (toggle.dataset.mode === 'disable') disablePush(panel);
    else enablePush(panel);
  });

  const observer = new MutationObserver(() => {
    mountPanel();
    syncExistingSubscription();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountPanel();
      syncExistingSubscription();
    }, { once: true });
  } else {
    mountPanel();
    syncExistingSubscription();
  }
})();
