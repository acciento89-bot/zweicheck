const BRAND = {
  navy: '#061a2f',
  navySoft: '#102f4f',
  teal: '#0f827e',
  tealSoft: '#dff4f2',
  orange: '#f28c28',
  background: '#f3f7fa',
  text: '#17324d',
  muted: '#61758a',
  border: '#dfe8ef'
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanLine(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function safeUrl(value = '') {
  const url = String(value).trim();
  if (!/^https:\/\//i.test(url)) return '';
  return url;
}

function paragraph(text, { strong = false } = {}) {
  const body = strong ? `<strong>${escapeHtml(text)}</strong>` : escapeHtml(text);
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${BRAND.text};">${body}</p>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:7px 10px 7px 0;font-size:13px;line-height:1.45;color:${BRAND.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:14px;line-height:1.45;color:${BRAND.text};font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function layout({
  preheader,
  eyebrow,
  title,
  bodyHtml,
  actionLabel,
  actionUrl,
  detailRows = [],
  notice,
  footer = 'Diese Nachricht wurde automatisch von ZweiCheck gesendet.'
}) {
  const url = safeUrl(actionUrl);
  const button = url
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 22px;">
        <tr>
          <td bgcolor="${BRAND.teal}" style="border-radius:12px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 24px;border-radius:12px;background:${BRAND.teal};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;line-height:1.2;">${escapeHtml(actionLabel)}</a>
          </td>
        </tr>
      </table>`
    : '';

  const fallback = url
    ? `<div style="margin-top:6px;padding:16px;border:1px solid ${BRAND.border};border-radius:12px;background:#f8fbfd;">
        <p style="margin:0 0 7px;font-size:12px;line-height:1.5;color:${BRAND.muted};">Falls der Button nicht funktioniert, kopiere diesen Link:</p>
        <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${BRAND.teal};text-decoration:underline;">${escapeHtml(url)}</a></p>
      </div>`
    : '';

  const details = detailRows.filter((row) => row?.value)
    .map((row) => detailRow(row.label, row.value))
    .join('');

  const detailsBlock = details
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px;padding:12px 14px;border-radius:12px;background:${BRAND.tealSoft};">${details}</table>`
    : '';

  const noticeBlock = notice
    ? `<div style="margin-top:20px;padding:14px 16px;border-left:4px solid ${BRAND.orange};border-radius:8px;background:#fff7ed;font-size:13px;line-height:1.55;color:${BRAND.text};">${escapeHtml(notice)}</div>`
    : '';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <style>
    @media only screen and (max-width:620px) {
      .zc-shell { width:100% !important; border-radius:0 !important; }
      .zc-pad { padding-left:22px !important; padding-right:22px !important; }
      .zc-title { font-size:28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${BRAND.background};">
    <tr>
      <td align="center" style="padding:30px 12px;">
        <table class="zc-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 8px 28px rgba(6,26,47,.10);">
          <tr>
            <td class="zc-pad" style="padding:24px 34px;background:${BRAND.navy};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:42px;height:42px;border-radius:12px;background:${BRAND.teal};text-align:center;vertical-align:middle;color:#ffffff;font-size:25px;font-weight:700;">✓</td>
                  <td style="padding-left:13px;vertical-align:middle;">
                    <div style="font-size:24px;line-height:1.1;font-weight:800;color:#ffffff;letter-spacing:-.3px;">ZweiCheck</div>
                    <div style="margin-top:4px;font-size:12px;line-height:1.3;color:#a9d9d6;">Gemeinsam prüfen. Sicher handeln.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="zc-pad" style="padding:34px 34px 28px;">
              <div style="margin-bottom:9px;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.teal};">${escapeHtml(eyebrow || 'ZweiCheck')}</div>
              <h1 class="zc-title" style="margin:0 0 20px;font-size:32px;line-height:1.18;letter-spacing:-.5px;color:${BRAND.navy};">${escapeHtml(title)}</h1>
              ${bodyHtml || ''}
              ${detailsBlock}
              ${button}
              ${fallback}
              ${noticeBlock}
            </td>
          </tr>
          <tr>
            <td class="zc-pad" style="padding:22px 34px 26px;border-top:1px solid ${BRAND.border};background:#fbfdfe;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.55;color:${BRAND.muted};">${escapeHtml(footer)}</p>
              <p style="margin:0;font-size:12px;line-height:1.55;color:${BRAND.muted};">ZweiCheck · Gemeinsam prüfen. Sicher handeln.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function verificationEmail({ name, actionUrl }) {
  const displayName = cleanLine(name) || 'du';
  const text = `Hallo ${displayName},\n\nbitte bestätige deine E-Mail-Adresse, damit du ZweiCheck vollständig nutzen kannst.\n\nE-Mail bestätigen:\n${actionUrl}\n\nDer Link ist 24 Stunden gültig. Falls du dich nicht registriert hast, kannst du diese Nachricht ignorieren.`;
  const html = layout({
    preheader: 'Bestätige deine E-Mail-Adresse für ZweiCheck.',
    eyebrow: 'Konto schützen',
    title: 'E-Mail-Adresse bestätigen',
    bodyHtml: `${paragraph(`Hallo ${displayName},`)}${paragraph('bitte bestätige deine E-Mail-Adresse, damit du ZweiCheck vollständig nutzen kannst.')}`,
    actionLabel: 'E-Mail bestätigen',
    actionUrl,
    detailRows: [{ label: 'Gültigkeit', value: '24 Stunden' }],
    notice: 'Falls du dich nicht bei ZweiCheck registriert hast, kannst du diese Nachricht einfach ignorieren.'
  });
  return { subject: 'E-Mail für ZweiCheck bestätigen', text, html };
}

function passwordResetEmail({ name, actionUrl }) {
  const displayName = cleanLine(name) || 'du';
  const text = `Hallo ${displayName},\n\ndu hast eine Zurücksetzung deines ZweiCheck-Passworts angefordert.\n\nPasswort zurücksetzen:\n${actionUrl}\n\nDer Link ist eine Stunde gültig. Falls du das nicht angefordert hast, ignoriere diese Nachricht.`;
  const html = layout({
    preheader: 'Setze dein ZweiCheck-Passwort sicher zurück.',
    eyebrow: 'Kontozugang',
    title: 'Passwort zurücksetzen',
    bodyHtml: `${paragraph(`Hallo ${displayName},`)}${paragraph('du hast eine Zurücksetzung deines ZweiCheck-Passworts angefordert. Über den Button kannst du ein neues Passwort festlegen.')}`,
    actionLabel: 'Neues Passwort festlegen',
    actionUrl,
    detailRows: [{ label: 'Gültigkeit', value: '1 Stunde' }],
    notice: 'Falls du das nicht angefordert hast, ignoriere diese Nachricht. Dein bisheriges Passwort bleibt unverändert.'
  });
  return { subject: 'ZweiCheck-Passwort zurücksetzen', text, html };
}

function invitationEmail({ inviterName, actionUrl, code }) {
  const inviter = cleanLine(inviterName) || 'Eine Person';
  const inviteCode = cleanLine(code);
  const text = `${inviter} möchte dich als Vertrauensperson bei ZweiCheck verbinden.\n\nEinladung annehmen:\n${actionUrl}\n\nEinladungscode: ${inviteCode}\nDer Code ist 48 Stunden gültig.`;
  const html = layout({
    preheader: `${inviter} lädt dich als Vertrauensperson zu ZweiCheck ein.`,
    eyebrow: 'Vertrauensverbindung',
    title: 'Du wurdest eingeladen',
    bodyHtml: `${paragraph(`${inviter} möchte dich als Vertrauensperson bei ZweiCheck verbinden.`)}${paragraph('Erst nachdem du die Einladung annimmst, entsteht die private Verbindung.')}`,
    actionLabel: 'Einladung annehmen',
    actionUrl,
    detailRows: [
      { label: 'Eingeladen von', value: inviter },
      { label: 'Einladungscode', value: inviteCode },
      { label: 'Gültigkeit', value: '48 Stunden' }
    ],
    notice: 'Nimm die Einladung nur an, wenn du die Person kennst und ihr vertraust.'
  });
  return { subject: `${inviter} lädt dich zu ZweiCheck ein`, text, html };
}

function newCheckEmail({ recipientName, requesterName, category, urgency, actionUrl }) {
  const recipient = cleanLine(recipientName) || 'du';
  const requester = cleanLine(requesterName) || 'Eine Vertrauensperson';
  const text = `Hallo ${recipient},\n\n${requester} hat dir eine neue Prüfanfrage bei ZweiCheck gesendet.\n\nKategorie: ${category}\nZeitdruck: ${urgency}\n\nPrüfanfrage öffnen:\n${actionUrl}\n\nBitte öffne die Anfrage direkt in ZweiCheck. Sensible Inhalte werden nicht in dieser E-Mail wiederholt.`;
  const html = layout({
    preheader: `${requester} wartet auf deinen zweiten Blick.`,
    eyebrow: 'Neue Prüfanfrage',
    title: 'Deine Einschätzung wird gebraucht',
    bodyHtml: `${paragraph(`Hallo ${recipient},`)}${paragraph(`${requester} hat dir eine neue Prüfanfrage gesendet.`)}${paragraph('Die vollständigen Angaben und mögliche Bilder findest du geschützt in ZweiCheck.')}`,
    actionLabel: 'Prüfanfrage öffnen',
    actionUrl,
    detailRows: [
      { label: 'Von', value: requester },
      { label: 'Kategorie', value: category },
      { label: 'Zeitdruck', value: urgency }
    ],
    notice: 'Bis zur Klärung sollte die anfragende Person nichts bezahlen, installieren oder weitergeben.'
  });
  return { subject: `Neue Prüfanfrage von ${requester}`, text, html };
}

function checkAnsweredEmail({ recipientName, reviewerName, recommendation, actionUrl }) {
  const recipient = cleanLine(recipientName) || 'du';
  const reviewer = cleanLine(reviewerName) || 'Deine Vertrauensperson';
  const text = `Hallo ${recipient},\n\n${reviewer} hat deine Prüfanfrage beantwortet.\n\nEinschätzung: ${recommendation}\n\nAntwort öffnen:\n${actionUrl}\n\nÖffne ZweiCheck, um die vollständige Rückmeldung zu sehen.`;
  const html = layout({
    preheader: `${reviewer} hat deine Prüfanfrage beantwortet.`,
    eyebrow: 'Antwort eingegangen',
    title: 'Du hast eine Rückmeldung',
    bodyHtml: `${paragraph(`Hallo ${recipient},`)}${paragraph(`${reviewer} hat deine Prüfanfrage beantwortet.`)}${paragraph('Öffne die Anfrage in ZweiCheck, um die vollständige Einschätzung und Begründung zu sehen.')}`,
    actionLabel: 'Rückmeldung öffnen',
    actionUrl,
    detailRows: [
      { label: 'Von', value: reviewer },
      { label: 'Einschätzung', value: recommendation }
    ],
    notice: 'Die Rückmeldung ist eine persönliche Einschätzung und keine Sicherheitsgarantie.'
  });
  return { subject: 'Deine ZweiCheck-Prüfanfrage wurde beantwortet', text, html };
}

function genericEmail({ subject, text }) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bodyHtml = lines.map((line) => paragraph(line)).join('');
  return {
    subject,
    text: String(text || ''),
    html: layout({
      preheader: subject,
      eyebrow: 'Nachricht',
      title: subject,
      bodyHtml
    })
  };
}

function extractUrl(text) {
  return String(text || '').match(/https:\/\/[^\s<>]+/i)?.[0] || '';
}

function extractGreetingName(text) {
  return String(text || '').match(/Hallo\s+([^,\n]+),/i)?.[1]?.trim() || '';
}

function fromLegacyEmail({ subject, text }) {
  const normalizedSubject = String(subject || 'ZweiCheck');
  const normalizedText = String(text || '');
  const actionUrl = extractUrl(normalizedText);

  if (/bestätigen/i.test(normalizedSubject) && actionUrl) {
    return verificationEmail({ name: extractGreetingName(normalizedText), actionUrl });
  }

  if (/passwort/i.test(normalizedSubject) && /zurück/i.test(normalizedText) && actionUrl) {
    return passwordResetEmail({ name: extractGreetingName(normalizedText), actionUrl });
  }

  if (/lädt dich zu zweicheck ein/i.test(normalizedSubject) && actionUrl) {
    const inviterName = normalizedSubject.replace(/\s+lädt dich zu ZweiCheck ein.*$/i, '').trim();
    const code = normalizedText.match(/Code\s+([A-Z0-9-]{6,})/i)?.[1] || '';
    return invitationEmail({ inviterName, actionUrl, code });
  }

  return genericEmail({ subject: normalizedSubject, text: normalizedText });
}

module.exports = {
  BRAND,
  escapeHtml,
  layout,
  verificationEmail,
  passwordResetEmail,
  invitationEmail,
  newCheckEmail,
  checkAnsweredEmail,
  genericEmail,
  fromLegacyEmail
};
