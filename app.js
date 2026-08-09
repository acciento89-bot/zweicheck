const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

const categories = {
  message: { icon: '💬', title: 'Nachricht oder Anruf', subtitle: 'SMS, E-Mail, Messenger, WhatsApp oder Telefonat', tone: '' },
  payment: { icon: '💳', title: 'Zahlung oder Rechnung', subtitle: 'Überweisung, Rechnung, Kauf oder neue Bankverbindung', tone: 'orange' },
  link: { icon: '🔗', title: 'Link, QR-Code oder App', subtitle: 'Webseite, Download, QR-Code oder Installation', tone: 'blue' },
  data: { icon: '📄', title: 'Daten oder Dokumente', subtitle: 'Ausweis, Vertrag, Zugangsdaten oder persönliche Informationen', tone: 'red' }
};

const decisions = {
  stop: { label: 'Nicht handeln', icon: '⛔', tone: 'danger', explanation: 'Mach vorerst nichts und gib keine Daten, Codes oder Zahlungen weiter.' },
  clarify: { label: 'Erst persönlich klären', icon: '☎', tone: 'warning', explanation: 'Ruf die bekannte offizielle Nummer selbst an und kläre die Situation direkt.' },
  plausible: { label: 'Wirkt nachvollziehbar', icon: '✓', tone: 'positive', explanation: 'Die Angaben wirken nachvollziehbar. Prüfe wichtige Daten trotzdem noch einmal selbst.' },
  call: { label: 'Ruf mich jetzt an', icon: '📞', tone: '', explanation: 'Wir sollten kurz persönlich sprechen, bevor du weitermachst.' }
};

const demoRequest = {
  id: 'demo-1',
  category: 'payment',
  description: 'Ich habe diese Nachricht per E-Mail bekommen und soll angeblich eine offene Rechnung bezahlen. Die Bankverbindung ist neu.',
  amount: '150,00 €',
  urgency: 'very-high',
  sender: 'Mama',
  reviewer: 'Piotr',
  createdAt: 'Heute, 09:41',
  attachment: true,
  status: 'open',
  decision: null,
  reason: ''
};

const initialState = {
  screen: 'welcome',
  onboardingStep: 0,
  role: 'protected',
  user: { name: 'Piotr', connected: true },
  trustedPeople: [
    { id: 'diana', name: 'Diana', initials: 'DH', priority: true, status: 'Verbunden' },
    { id: 'mama', name: 'Mama', initials: 'MK', priority: false, status: 'Verbunden' }
  ],
  draft: { category: null, description: '', amount: '', urgency: 'none', attachment: false, reviewer: 'diana' },
  requests: [
    { ...demoRequest },
    { id: 'old-1', category: 'message', description: 'Anruf angeblich vom Microsoft-Support.', sender: 'Piotr', reviewer: 'Diana', createdAt: 'Gestern, 15:22', status: 'done', decision: 'stop', reason: 'Microsoft ruft nicht unaufgefordert an und verlangt keinen Fernzugriff.' },
    { id: 'old-2', category: 'message', description: 'Neue WhatsApp-Nummer angeblich von Nico.', sender: 'Piotr', reviewer: 'Diana', createdAt: '12.05.2026, 14:08', status: 'done', decision: 'clarify', reason: 'Bitte über die bekannte Nummer zurückrufen.' }
  ],
  selectedRequestId: 'demo-1'
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('zweicheck-prototype-state'));
    return saved ? { ...initialState, ...saved, draft: { ...initialState.draft, ...(saved.draft || {}) } } : structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem('zweicheck-prototype-state', JSON.stringify(state));
}

function resetPrototype() {
  localStorage.removeItem('zweicheck-prototype-state');
  state = structuredClone(initialState);
  render();
  toast('Demo wurde zurückgesetzt.');
}

function navigate(screen, patch = {}) {
  state = { ...state, ...patch, screen };
  saveState();
  render();
}

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  toastRoot.append(item);
  window.setTimeout(() => item.remove(), 2800);
}

function urgencyLabel(value) {
  return { none: 'Keiner', low: 'Niedrig', high: 'Hoch', 'very-high': 'Sehr hoch' }[value] || value;
}

function activeRequest() {
  return state.requests.find((request) => request.id === state.selectedRequestId) || state.requests[0];
}

function shell(content, { nav = true, back = null, title = '', dark = false } = {}) {
  return `
    <main class="app-stage">
      <section class="phone-shell" aria-label="ZweiCheck App-Prototyp">
        <header class="topbar">
          ${back ? `<button class="icon-button" type="button" data-nav="${back}" aria-label="Zurück">←</button>` : `<img class="topbar-logo" src="./assets/brand/zweicheck-logo-horizontal.svg" alt="ZweiCheck">`}
          ${title ? `<strong>${title}</strong>` : ''}
          <span class="topbar-spacer"></span>
          ${nav ? `<button class="icon-button" type="button" data-reset title="Demo zurücksetzen" aria-label="Demo zurücksetzen">↻</button>` : ''}
        </header>
        <div class="screen ${dark ? 'dark' : ''} ${nav ? '' : 'no-nav'}">${content}</div>
        ${nav ? bottomNav() : ''}
      </section>
      ${nav ? `<button class="demo-switch" type="button" data-role-switch>Demo: ${state.role === 'protected' ? 'Schutzperson' : 'Vertrauensperson'} ⇄</button>` : ''}
    </main>`;
}

function bottomNav() {
  const items = [
    ['home', '⌂', 'Start'],
    ['requests', '☑', 'Prüfungen'],
    ['circle', '♙', 'Kreis'],
    ['history', '◷', 'Verlauf'],
    ['profile', '⚙', 'Profil']
  ];
  return `<nav class="bottom-nav" aria-label="Hauptnavigation">${items.map(([screen, icon, label]) => `
    <button class="nav-button ${state.screen === screen ? 'active' : ''}" type="button" data-nav="${screen}"><span>${icon}</span><span>${label}</span></button>
  `).join('')}</nav>`;
}

function renderWelcome() {
  const pages = [
    { icon: '✓', title: 'Unsicher? Hol dir einen zweiten Blick.', text: 'Sende eine Nachricht, Rechnung oder Aufforderung an eine Person, der du vertraust – bevor du handelst.' },
    { icon: '♙', title: 'Nur Menschen, die du auswählst.', text: 'Dein Vertrauenskreis sieht ausschließlich die Prüfungen, die du gezielt mit ihm teilst.' },
    { icon: '⚡', title: 'Schnell reagieren, ohne Druck.', text: 'Eine klare Rückmeldung hilft dir, kurz innezuhalten und den nächsten Schritt bewusst zu wählen.' }
  ];
  const page = pages[state.onboardingStep];
  return shell(`
    <div class="hero-mark"><img src="./assets/brand/zweicheck-mark.svg" alt=""></div>
    <div class="center">
      <span class="eyebrow">Gemeinsam prüfen</span>
      <h1>${page.title}</h1>
      <p class="lead">${page.text}</p>
      <div class="onboarding-dots">${pages.map((_, index) => `<span class="${index === state.onboardingStep ? 'active' : ''}"></span>`).join('')}</div>
    </div>
    <div class="spacer-16"></div>
    <button class="btn btn-primary" type="button" data-onboarding-next>${state.onboardingStep === pages.length - 1 ? 'Loslegen' : 'Weiter'}</button>
    ${state.onboardingStep ? '<button class="btn btn-ghost" type="button" data-onboarding-back>Zurück</button>' : '<button class="btn btn-link" type="button" data-nav="home">Prototyp direkt öffnen</button>'}
  `, { nav: false, dark: true });
}

function renderConnect() {
  return shell(`
    <div class="progress"><span class="active"></span><span class="active"></span><span></span></div>
    <span class="eyebrow">Einrichtung</span>
    <h1>Wem vertraust du?</h1>
    <p class="lead">Diese Person kann deine Prüfanfragen sehen und dir eine klare Rückmeldung geben.</p>
    <div class="spacer-16"></div>
    <div class="stack">
      <button class="card pressable card-row" type="button" data-connect-action="share">
        <span class="category-icon">↗</span><span class="card-main"><h3>Einladungslink senden</h3><p>Per WhatsApp, SMS oder E-Mail</p></span><span class="chevron">›</span>
      </button>
      <button class="card pressable card-row" type="button" data-connect-action="show-code">
        <span class="category-icon blue">#</span><span class="card-main"><h3>Einladungscode anzeigen</h3><p>Code persönlich weitergeben</p></span><span class="chevron">›</span>
      </button>
      <button class="card pressable card-row" type="button" data-connect-action="enter-code">
        <span class="category-icon orange">⌨</span><span class="card-main"><h3>Code eingeben</h3><p>Eine erhaltene Einladung annehmen</p></span><span class="chevron">›</span>
      </button>
    </div>
    <div class="spacer-16"></div>
    <div class="notice info"><span>🔒</span><span>Nur verbundene Personen sehen die Inhalte deiner Prüfanfragen.</span></div>
    <div class="spacer-24"></div>
    <button class="btn btn-primary" type="button" data-connect-complete>Mit Diana fortfahren</button>
    <button class="btn btn-link" type="button" data-nav="home">Später einrichten</button>
  `, { nav: false, back: 'welcome', title: 'Vertrauenskreis' });
}

function renderHome() {
  const open = state.requests.filter((request) => request.status === 'open');
  const greeting = state.role === 'protected' ? 'Hallo Piotr 👋' : 'Hallo Diana 👋';
  return shell(`
    <span class="eyebrow">${greeting}</span>
    <section class="hero-panel">
      <div class="hero-illustration"><span class="avatar-bubble">P</span><span class="check-bubble">✓</span><span class="avatar-bubble alt">D</span></div>
      <h1>Unsicher?</h1>
      <p>Lass kurz jemanden mit draufschauen, bevor du zahlst, klickst oder Daten weitergibst.</p>
      <button class="btn btn-primary" type="button" data-start-check>Prüfung starten</button>
    </section>
    <div class="quick-list">
      <button class="quick-row" type="button" data-nav="requests"><span class="mini-icon">☑</span><strong>Offene Prüfungen</strong><span class="badge">${open.length}</span><span class="chevron">›</span></button>
      <button class="quick-row" type="button" data-nav="circle"><span class="mini-icon">♙</span><strong>Vertrauenskreis</strong><span class="badge soft">${state.trustedPeople.length}</span><span class="chevron">›</span></button>
      <button class="quick-row" type="button" data-nav="history"><span class="mini-icon">◷</span><strong>Verlauf</strong><span class="chevron">›</span></button>
    </div>
    ${open.length ? `<div class="section-head"><div><span class="eyebrow">Gerade offen</span><h2>${state.role === 'protected' ? 'Warten auf Rückmeldung' : 'Jemand braucht deinen Blick'}</h2></div></div>${requestCard(open[0], true)}` : ''}
  `);
}

function requestCard(request, pressable = false) {
  const category = categories[request.category];
  const decision = request.decision ? decisions[request.decision] : null;
  return `<${pressable ? 'button' : 'article'} class="card ${pressable ? 'pressable' : ''}" ${pressable ? `type="button" data-open-request="${request.id}"` : ''}>
    <div class="card-row">
      <span class="category-icon ${category.tone}">${category.icon}</span>
      <span class="card-main"><span class="eyebrow">${request.createdAt}</span><h3>${category.title}</h3><p>${request.description}</p></span>
      ${request.status === 'open' ? '<span class="badge orange">Offen</span>' : `<span class="badge ${request.decision === 'stop' ? 'red' : 'soft'}">${decision?.label || 'Erledigt'}</span>`}
    </div>
  </${pressable ? 'button' : 'article'}>`;
}

function renderCategories() {
  return shell(`
    <div class="progress"><span class="active"></span><span></span><span></span></div>
    <span class="eyebrow">Neue Prüfung</span>
    <h1>Was möchtest du prüfen?</h1>
    <p>Wähle die Situation, die am besten passt.</p>
    <div class="stack">${Object.entries(categories).map(([key, category]) => `
      <button class="card pressable card-row" type="button" data-category="${key}">
        <span class="category-icon ${category.tone}">${category.icon}</span>
        <span class="card-main"><h3>${category.title}</h3><p>${category.subtitle}</p></span><span class="chevron">›</span>
      </button>
    `).join('')}</div>
    <div class="spacer-16"></div>
    <button class="btn btn-secondary" type="button" data-nav="home">Abbrechen</button>
  `, { back: 'home', title: 'Prüfung starten' });
}

function renderDetails() {
  const category = categories[state.draft.category] || categories.message;
  return shell(`
    <div class="progress"><span class="active"></span><span class="active"></span><span></span></div>
    <span class="eyebrow">${category.icon} ${category.title}</span>
    <h1>Erzähl kurz, worum es geht.</h1>
    <p>Je klarer die Situation beschrieben ist, desto schneller kann dir jemand helfen.</p>
    <form data-details-form>
      <div class="form-group">
        <label for="description">Was ist passiert? *</label>
        <textarea class="textarea" id="description" name="description" maxlength="500" required placeholder="Zum Beispiel: Ich soll angeblich eine offene Rechnung auf ein neues Konto überweisen.">${escapeHtml(state.draft.description)}</textarea>
        <span class="helper">Keine Passwörter, TANs oder vollständigen Kartendaten eintragen.</span>
      </div>
      <div class="form-group">
        <label>Anhänge hinzufügen</label>
        <div class="attach-grid">
          <button class="attach-button" type="button" data-attachment="photo"><span>${state.draft.attachment ? '✓' : '▧'}</span><span>${state.draft.attachment ? 'Bild hinzugefügt' : 'Foto'}</span></button>
          <button class="attach-button" type="button" data-attachment="camera"><span>📷</span><span>Kamera</span></button>
          <button class="attach-button" type="button" data-attachment="voice"><span>🎙</span><span>Sprache</span></button>
        </div>
      </div>
      <div class="form-group">
        <label for="amount">Betrag (optional)</label>
        <input class="input" id="amount" name="amount" inputmode="decimal" value="${escapeHtml(state.draft.amount)}" placeholder="z. B. 150,00 €">
      </div>
      <div class="form-group">
        <label>Wie groß ist der Zeitdruck?</label>
        <div class="segmented">${[['none','Keiner'],['low','Niedrig'],['high','Hoch'],['very-high','Sehr hoch']].map(([value,label]) => `<button type="button" class="${state.draft.urgency === value ? 'active' : ''}" data-urgency="${value}">${label}</button>`).join('')}</div>
      </div>
      <div class="form-group">
        <label for="reviewer">Wer soll mit draufschauen?</label>
        <select class="select" id="reviewer" name="reviewer">${state.trustedPeople.map((person) => `<option value="${person.id}" ${state.draft.reviewer === person.id ? 'selected' : ''}>${person.name}${person.priority ? ' · Prioritätskontakt' : ''}</option>`).join('')}</select>
      </div>
      <div class="spacer-16"></div>
      <div class="notice"><span>⏸</span><span>Bis zur Rückmeldung noch nichts bezahlen, installieren oder weitergeben.</span></div>
      <div class="spacer-16"></div>
      <button class="btn btn-primary" type="submit">An Vertrauenskreis senden</button>
    </form>
  `, { back: 'categories', title: 'Details' });
}

function renderSent() {
  const reviewer = state.trustedPeople.find((person) => person.id === state.draft.reviewer)?.name || 'deine Vertrauensperson';
  return shell(`
    <div class="status-hero positive">
      <div class="status-symbol">✓</div>
      <h1>Prüfung gesendet</h1>
      <p>${reviewer} wurde benachrichtigt. Du erhältst eine Rückmeldung, sobald jemand die Situation angesehen hat.</p>
    </div>
    <div class="spacer-16"></div>
    <div class="notice"><span>⏸</span><span>Bis dahin: nichts bezahlen, installieren oder persönliche Daten weitergeben.</span></div>
    <div class="spacer-24"></div>
    <button class="btn btn-primary" type="button" data-demo-review>Ansicht der Vertrauensperson öffnen</button>
    <button class="btn btn-secondary" type="button" data-nav="home">Zur Startseite</button>
  `, { nav: false, title: 'Gesendet' });
}

function renderRequests() {
  const open = state.requests.filter((request) => request.status === 'open');
  return shell(`
    <span class="eyebrow">Prüfungen</span>
    <h1>${state.role === 'protected' ? 'Deine Anfragen' : 'Braucht deinen Blick'}</h1>
    <p>${open.length ? `${open.length} Prüfung wartet noch auf eine klare Rückmeldung.` : 'Aktuell ist nichts offen.'}</p>
    <div class="section-head"><div><h2>Offen</h2></div></div>
    <div class="stack">${open.length ? open.map((request) => requestCard(request, true)).join('') : '<div class="card empty-state"><div class="empty-symbol">✓</div><h3>Alles beantwortet</h3><p>Neue Prüfanfragen erscheinen hier.</p></div>'}</div>
    <div class="section-head"><div><h2>Zuletzt abgeschlossen</h2></div></div>
    <div class="stack">${state.requests.filter((request) => request.status === 'done').slice(0,2).map((request) => requestCard(request, true)).join('')}</div>
  `);
}

function renderRequestDetail() {
  const request = activeRequest();
  const category = categories[request.category];
  if (request.status === 'done') return renderResponse();
  if (state.role === 'protected') {
    return shell(`
      <span class="eyebrow">Offene Prüfung</span>
      <h1>Rückmeldung steht noch aus</h1>
      <div class="card request-summary">
        <div class="card-row"><span class="category-icon ${category.tone}">${category.icon}</span><span class="card-main"><h3>${category.title}</h3><p>${request.createdAt}</p></span><span class="badge red">${urgencyLabel(request.urgency)}</span></div>
        <div class="summary-row"><span>Prüft</span><strong>${request.reviewer}</strong></div>
        ${request.amount ? `<div class="summary-row"><span>Betrag</span><strong class="amount">${request.amount}</strong></div>` : ''}
        <p>${request.description}</p>
      </div>
      <div class="spacer-16"></div>
      <div class="notice"><span>⏸</span><span>Handle erst weiter, wenn du eine Rückmeldung erhalten oder die Situation selbst über einen bekannten Kontakt geklärt hast.</span></div>
      <div class="spacer-24"></div>
      <button class="btn btn-dark" type="button" data-call>Vertrauensperson anrufen</button>
      <button class="btn btn-secondary" type="button" data-role-switch>Demo als Vertrauensperson öffnen</button>
    `, { back: 'requests', title: 'Prüfung' });
  }
  return shell(`
    <span class="eyebrow">Neue Prüfung <span class="badge red">${urgencyLabel(request.urgency)}</span></span>
    <h1>${request.sender} braucht deinen Blick.</h1>
    <div class="card request-summary">
      <div class="person-card"><span class="person-avatar">${request.sender.slice(0,1)}</span><span class="card-main"><h3>Von ${request.sender}</h3><p>${request.createdAt}</p></span><button class="icon-button light" type="button" data-call>☎</button></div>
      <div class="summary-row"><span>Kategorie</span><strong>${category.icon} ${category.title}</strong></div>
      ${request.amount ? `<div class="summary-row"><span>Betrag</span><strong class="amount">${request.amount}</strong></div>` : ''}
      <p>${request.description}</p>
      ${request.attachment ? '<div class="notice info"><span>▧</span><span>Ein Screenshot wurde als Beispieldatei hinzugefügt.</span></div>' : ''}
    </div>
    <div class="section-head"><div><span class="eyebrow">Deine Empfehlung</span><h2>Was soll jetzt passieren?</h2></div></div>
    <div class="decision-grid">
      <button class="btn btn-danger" type="button" data-decision="stop"><span>⛔</span>Nicht handeln</button>
      <button class="btn btn-warning" type="button" data-decision="clarify"><span>☎</span>Erst persönlich klären</button>
      <button class="btn btn-primary" type="button" data-decision="plausible"><span>✓</span>Wirkt nachvollziehbar</button>
      <button class="btn btn-dark" type="button" data-decision="call"><span>📞</span>Ruf mich jetzt an</button>
    </div>
    <div class="form-group">
      <label for="reason">Kurze Begründung (optional)</label>
      <textarea class="textarea" id="reason" data-reason placeholder="Zum Beispiel: Die neue Bankverbindung sollte über die bekannte Telefonnummer bestätigt werden."></textarea>
    </div>
  `, { back: 'requests', title: 'Prüfung ansehen' });
}

function submitDecision(value) {
  const reason = document.querySelector('[data-reason]')?.value.trim() || decisions[value].explanation;
  state.requests = state.requests.map((request) => request.id === state.selectedRequestId ? { ...request, status: 'done', decision: value, reason } : request);
  state.role = 'protected';
  saveState();
  navigate('response');
}

function renderResponse() {
  const request = activeRequest();
  const decision = decisions[request.decision] || decisions.clarify;
  return shell(`
    <div class="status-hero ${decision.tone}">
      <div class="status-symbol">${decision.icon}</div>
      <span class="eyebrow">Rückmeldung von ${request.reviewer}</span>
      <h1>${decision.label}</h1>
      <p>${request.reason || decision.explanation}</p>
    </div>
    <div class="spacer-16"></div>
    <div class="card">
      <h3>Was du jetzt tun kannst</h3>
      <p>${decision.explanation}</p>
      <div class="stack-tight">
        <button class="btn btn-dark" type="button" data-call>Vertrauensperson anrufen</button>
        <button class="btn btn-secondary" type="button" data-official-call>Bekannte offizielle Nummer wählen</button>
        <button class="btn btn-secondary" type="button" data-ask-another>Weitere Person fragen</button>
      </div>
    </div>
    <div class="spacer-16"></div>
    <div class="notice info"><span>ℹ</span><span>Die Rückmeldung ist eine persönliche Einschätzung und keine Garantie. Teile niemals TANs, Passwörter oder Sicherheitscodes.</span></div>
    <div class="spacer-24"></div>
    <button class="btn btn-primary" type="button" data-close-request>Vorgang abschließen</button>
  `, { back: 'requests', title: 'Rückmeldung' });
}

function renderHistory() {
  return shell(`
    <span class="eyebrow">Verlauf</span>
    <h1>Deine bisherigen ZweiChecks</h1>
    <p>Chronologisch und ohne Bewertung deiner Person.</p>
    <div class="timeline">${state.requests.map((request) => {
      const category = categories[request.category];
      const decision = request.decision ? decisions[request.decision] : null;
      return `<button class="card pressable timeline-card" type="button" data-open-request="${request.id}"><span class="line"></span><span class="category-icon ${category.tone}">${category.icon}</span><span class="card-main"><h3>${category.title}</h3><p>${request.description}</p><time>${request.createdAt} · ${decision?.label || 'Offen'}</time></span><span class="chevron">›</span></button>`;
    }).join('')}</div>
  `);
}

function renderCircle() {
  return shell(`
    <span class="eyebrow">Vertrauenskreis</span>
    <h1>Menschen, die mit draufschauen.</h1>
    <p>Nur ausdrücklich verbundene Personen können deine Anfragen empfangen.</p>
    <div class="stack">${state.trustedPeople.map((person) => `
      <article class="card person-card"><span class="person-avatar">${person.initials}</span><span class="card-main"><h3>${person.name}</h3><p>${person.status}${person.priority ? ' · Prioritätskontakt' : ''}</p></span><span class="badge ${person.priority ? '' : 'soft'}">${person.priority ? '★' : '✓'}</span></article>
    `).join('')}</div>
    <div class="spacer-16"></div>
    <button class="btn btn-primary" type="button" data-add-person>Person hinzufügen</button>
    <div class="section-head"><div><span class="eyebrow">Familiencode</span><h2>Stimme und Nachricht prüfen</h2></div></div>
    <div class="card"><p>Ein gemeinsames Codewort hilft bei angeblichen Notfällen über neue Telefonnummern oder gefälschte Stimmen.</p><button class="btn btn-secondary" type="button" data-family-code>Familiencode einrichten</button></div>
  `);
}

function renderProfile() {
  return shell(`
    <span class="eyebrow">Profil</span>
    <h1>Piotr</h1>
    <p>Prototyp-Einstellungen und Vorschau auf ZweiCheck Familie.</p>
    <div class="stack">
      <article class="card person-card"><span class="person-avatar">PK</span><span class="card-main"><h3>Piotr</h3><p>Schutzperson und Vertrauensperson</p></span><span class="badge">Aktiv</span></article>
      <button class="card pressable card-row" type="button" data-nav="subscription"><span class="category-icon">★</span><span class="card-main"><h3>ZweiCheck Familie</h3><p>Unbegrenzt gemeinsam prüfen</p></span><span class="chevron">›</span></button>
      <button class="card pressable card-row" type="button" data-reset><span class="category-icon red">↻</span><span class="card-main"><h3>Prototyp zurücksetzen</h3><p>Alle Demoänderungen löschen</p></span><span class="chevron">›</span></button>
    </div>
  `);
}

function renderSubscription() {
  return shell(`
    <span class="eyebrow">ZweiCheck Familie</span>
    <h1>Schützt euch gemeinsam – ohne Begrenzung.</h1>
    <p>Mehrere Vertrauenspersonen, unbegrenzte Prüfungen und Prioritätsmeldungen für die ganze Familie.</p>
    <div class="card price-card">
      <span class="price-ribbon">BESTER WERT</span>
      <span class="eyebrow">Familienabo</span>
      <div class="price">39,99 € <small>pro Jahr</small></div>
      <ul class="feature-list">
        <li>Bis zu sechs Familienmitglieder</li>
        <li>Unbegrenzte Prüfanfragen</li>
        <li>Mehrere Vertrauenspersonen</li>
        <li>Sprachnachrichten und Prioritätsalarm</li>
        <li>Gemeinsamer Familiencode</li>
      </ul>
      <button class="btn btn-primary" type="button" data-subscribe>Familienabo testen</button>
    </div>
    <div class="spacer-16"></div>
    <div class="notice info"><span>ℹ</span><span>Dies ist nur eine Preis- und Funktionsvorschau. Im Prototyp wird kein Kauf ausgelöst.</span></div>
  `, { back: 'profile', title: 'Familie' });
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function render() {
  const screens = {
    welcome: renderWelcome,
    connect: renderConnect,
    home: renderHome,
    categories: renderCategories,
    details: renderDetails,
    sent: renderSent,
    requests: renderRequests,
    request: renderRequestDetail,
    response: renderResponse,
    history: renderHistory,
    circle: renderCircle,
    profile: renderProfile,
    subscription: renderSubscription
  };
  app.innerHTML = (screens[state.screen] || renderHome)();
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
  document.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', resetPrototype));
  document.querySelectorAll('[data-role-switch]').forEach((button) => button.addEventListener('click', () => {
    state.role = state.role === 'protected' ? 'reviewer' : 'protected';
    saveState();
    navigate(state.screen === 'request' ? 'request' : 'home');
  }));

  document.querySelector('[data-onboarding-next]')?.addEventListener('click', () => {
    if (state.onboardingStep < 2) {
      state.onboardingStep += 1;
      saveState();
      render();
    } else navigate('connect');
  });
  document.querySelector('[data-onboarding-back]')?.addEventListener('click', () => {
    state.onboardingStep = Math.max(0, state.onboardingStep - 1);
    saveState();
    render();
  });
  document.querySelectorAll('[data-connect-action]').forEach((button) => button.addEventListener('click', () => toast({ share: 'Einladungslink wurde als Demo kopiert.', 'show-code': 'Dein Demo-Code lautet: ZWEI-2048', 'enter-code': 'Code-Eingabe wäre hier geöffnet.' }[button.dataset.connectAction])));
  document.querySelector('[data-connect-complete]')?.addEventListener('click', () => navigate('home'));
  document.querySelector('[data-start-check]')?.addEventListener('click', () => {
    state.draft = { ...initialState.draft };
    saveState();
    navigate('categories');
  });
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
    state.draft.category = button.dataset.category;
    saveState();
    navigate('details');
  }));
  document.querySelectorAll('[data-urgency]').forEach((button) => button.addEventListener('click', () => {
    state.draft.urgency = button.dataset.urgency;
    saveState();
    render();
  }));
  document.querySelectorAll('[data-attachment]').forEach((button) => button.addEventListener('click', () => {
    state.draft.attachment = true;
    saveState();
    render();
    toast('Beispielanhang hinzugefügt.');
  }));
  document.querySelector('[data-details-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.draft.description = String(form.get('description') || '').trim();
    state.draft.amount = String(form.get('amount') || '').trim();
    state.draft.reviewer = String(form.get('reviewer') || 'diana');
    const reviewer = state.trustedPeople.find((person) => person.id === state.draft.reviewer)?.name || 'Diana';
    const request = {
      id: `request-${Date.now()}`,
      category: state.draft.category,
      description: state.draft.description,
      amount: state.draft.amount,
      urgency: state.draft.urgency,
      sender: 'Piotr',
      reviewer,
      createdAt: 'Gerade eben',
      attachment: state.draft.attachment,
      status: 'open',
      decision: null,
      reason: ''
    };
    state.requests = [request, ...state.requests];
    state.selectedRequestId = request.id;
    saveState();
    navigate('sent');
  });
  document.querySelector('[data-demo-review]')?.addEventListener('click', () => {
    state.role = 'reviewer';
    saveState();
    navigate('request');
  });
  document.querySelectorAll('[data-open-request]').forEach((button) => button.addEventListener('click', () => {
    state.selectedRequestId = button.dataset.openRequest;
    saveState();
    navigate('request');
  }));
  document.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', () => submitDecision(button.dataset.decision)));
  document.querySelectorAll('[data-call]').forEach((button) => button.addEventListener('click', () => toast('Demo: Anruf würde jetzt gestartet.')));
  document.querySelector('[data-official-call]')?.addEventListener('click', () => toast('Demo: bekannte offizielle Nummer selbst auswählen.'));
  document.querySelector('[data-ask-another]')?.addEventListener('click', () => toast('Demo: weitere Vertrauensperson wird angefragt.'));
  document.querySelector('[data-close-request]')?.addEventListener('click', () => navigate('history'));
  document.querySelector('[data-add-person]')?.addEventListener('click', () => toast('Demo: Einladung für eine weitere Person geöffnet.'));
  document.querySelector('[data-family-code]')?.addEventListener('click', () => toast('Demo-Familiencode: NORDSTERN'));
  document.querySelector('[data-subscribe]')?.addEventListener('click', () => toast('Kein echter Kauf – Familienabo wurde nur vorgemerkt.'));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

render();
