const admin = require('firebase-admin');

try {
    // Option 1: Load from service account file
    // const serviceAccount = require('../path/to/serviceAccountKey.json');

    // Option 2: Load from environment variables (Recommended for security)
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle private key newlines
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    };

    if (serviceAccount.projectId && serviceAccount.privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin Initialized');
    } else {
        console.warn('⚠️ Firebase credentials not found in env. Push notifications will be skipped.');
    }
} catch (error) {
    console.error('❌ Firebase Initialization Error:', error.message);
}

module.exports = admin;
