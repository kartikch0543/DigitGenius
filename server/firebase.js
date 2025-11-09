import admin from 'firebase-admin';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_B64');

let json;
try {
  json = Buffer.from(b64, 'base64').toString('utf8');
} catch {
  throw new Error('Invalid base64 in FIREBASE_SERVICE_ACCOUNT_B64');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(json);
} catch {
  throw new Error('Decoded FIREBASE_SERVICE_ACCOUNT_B64 is not valid JSON');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  console.log('[firebase] Admin initialized for project:', serviceAccount.project_id);
}

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
