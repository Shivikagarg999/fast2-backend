# Firebase OTP Auth

Firebase sends and verifies the OTP on the client. The backend verifies the Firebase ID token, creates or finds the Mongo user, then returns the normal Fast2 JWT used by existing protected APIs.

## Backend Endpoint

`POST /api/user/firebase-otp-login`

```json
{
  "idToken": "firebase-user-id-token",
  "name": "Customer Name",
  "referralCode": "OPTIONAL",
  "fcmToken": "OPTIONAL"
}
```

Success response:

```json
{
  "message": "Login successful",
  "token": "fast2-jwt",
  "wallet": 20,
  "referralCode": "ABCD1234",
  "user": {
    "id": "mongo-user-id",
    "email": null,
    "phone": "9876543210",
    "name": "Customer Name",
    "avatar": "https://www.gravatar.com/avatar/?d=mp"
  }
}
```

Use `token` as:

```http
Authorization: Bearer fast2-jwt
```

## Firebase Admin Env Vars

The backend already reads these in `config/firebase.js`:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Frontend Flow

1. Configure Firebase Web SDK with the Firebase project config.
2. Enable Phone provider in Firebase Console > Authentication > Sign-in method.
3. Use Firebase client SDK to send OTP and sign in with phone number.
4. After sign-in, call:

```js
const idToken = await firebaseUser.getIdToken();

await fetch(`${API_BASE}/api/user/firebase-otp-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken, name, referralCode, fcmToken })
});
```

Firebase Spark/free plan can be used for development, but phone-auth SMS has quota and abuse protections controlled by Firebase.
