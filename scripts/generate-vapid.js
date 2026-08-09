const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:noreply@kamilunavo.com');
console.log('\nBewahre den privaten Schlüssel ausschließlich in den Portainer-Umgebungsvariablen auf.');
