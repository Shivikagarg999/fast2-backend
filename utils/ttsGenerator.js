const textToSpeech = require("@google-cloud/text-to-speech");

// Reuses the same Firebase Admin service account already configured for push
// notifications / GA4 (FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY). The
// project (gmkart-d7c0b) needs the "Cloud Text-to-Speech API" enabled —
// a one-click enablement, separate from this credential.
let client = null;
const getClient = () => {
  if (client) return client;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;
  if (!clientEmail || !privateKey) return null;

  client = new textToSpeech.TextToSpeechClient({
    credentials: { client_email: clientEmail, private_key: privateKey }
  });
  return client;
};

const isConfigured = () => !!getClient();

/**
 * Synthesize Hindi speech from text. Free tier: 1M characters/month
 * (Neural2), so cost is effectively $0 at this business's volume.
 * @param {string} text - Hindi (or Hinglish) script
 * @returns {Promise<Buffer>} MP3 bytes
 */
const synthesizeHindiSpeech = async (text) => {
  const ttsClient = getClient();
  if (!ttsClient) {
    throw new Error("Text-to-Speech is not configured (missing Firebase service account credentials)");
  }

  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: "hi-IN", name: "hi-IN-Neural2-A" },
    audioConfig: { audioEncoding: "MP3" }
  });

  return Buffer.from(response.audioContent);
};

module.exports = { isConfigured, synthesizeHindiSpeech };
