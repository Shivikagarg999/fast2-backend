const admin = require('firebase-admin');

let driverApp;

try {
    const serviceAccount = {
        projectId: process.env.DRIVER_FIREBASE_PROJECT_ID,
        clientEmail: process.env.DRIVER_FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.DRIVER_FIREBASE_PRIVATE_KEY
            ? process.env.DRIVER_FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined,
    };

    if (serviceAccount.projectId && serviceAccount.privateKey) {
        driverApp = admin.initializeApp(
            { credential: admin.credential.cert(serviceAccount) },
            'driver' // named app — won't clash with the default user app
        );
        console.log('✅ Firebase Driver Admin Initialized');
    } else {
        console.warn('⚠️ Driver Firebase credentials not found in env. Driver push notifications will be skipped.');
    }
} catch (error) {
    console.error('❌ Firebase Driver Initialization Error:', error.message);
}

module.exports = driverApp;
