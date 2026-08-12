const fs = require('node:fs');

const file = 'app.js';
let source = fs.readFileSync(file, 'utf8');
const oldCode = "    state.pollingTimer = window.setInterval(() => loadData({ quiet: true }).then(render), 15000);";
const newCode = `    state.pollingTimer = window.setInterval(async () => {
      await loadData({ quiet: true });
      if (!document.querySelector('#app form[data-form]')) render();
    }, 15000);`;

if (!source.includes(newCode)) {
  if (!source.includes(oldCode)) throw new Error('Expected polling code was not found in app.js');
  source = source.replace(oldCode, newCode);
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

  fs.writeFileSync(trustFile, trustSource);
}
