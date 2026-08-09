const fs = require('node:fs');

const file = 'app.js';
const source = fs.readFileSync(file, 'utf8');
const oldCode = "    state.pollingTimer = window.setInterval(() => loadData({ quiet: true }).then(render), 15000);";
const newCode = `    state.pollingTimer = window.setInterval(async () => {
      await loadData({ quiet: true });
      if (!document.querySelector('#app form[data-form]')) render();
    }, 15000);`;

if (source.includes(newCode)) {
  process.exit(0);
}

if (!source.includes(oldCode)) {
  throw new Error('Expected polling code was not found in app.js');
}

fs.writeFileSync(file, source.replace(oldCode, newCode));
