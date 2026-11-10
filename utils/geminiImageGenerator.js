const axios = require("axios");

// "nano banana" — Gemini's image-generation model, chosen over OpenAI's
// gpt-image-1 for cost and because it renders short text/logos more reliably.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

// Generates a decorative BACKGROUND only — never asked to draw the logo,
// product photos, names or prices (those are composited precisely afterwards
// in socialPostGenerator.js). Returns a data URI, or null if no API key is
// configured or generation fails — callers should fall back to the plain
// brand-gradient background rather than block the whole post on this.
const generateBackgroundImage = async (prompt) => {
  if (!GEMINI_API_KEY) return null;
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      {
        contents: [{
          parts: [{
            text: `${prompt}. Decorative background art only — no text, no words, no letters, no logos, no numbers anywhere in the image.`
          }]
        }]
      },
      {
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        timeout: 30000
      }
    );

    const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!imagePart) return null;
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  } catch (error) {
    console.error("Gemini background generation error:", error.response?.data || error.message);
    return null;
  }
};

// Takes a REAL product photo (as a data URI, e.g. from toDataUri() in
// socialPostGenerator.js) and asks Gemini to place it in a photorealistic
// lifestyle scene. Explicitly told to add no logo/text/brand marks anywhere —
// our own logo and tagline are composited precisely afterwards in
// socialPostGenerator.js, same reasoning as generateBackgroundImage above.
// Returns a data URI, or null if no API key / generation fails.
const generateLifestyleScene = async (productImageDataUri, sceneDescription) => {
  if (!GEMINI_API_KEY || !productImageDataUri) return null;
  try {
    const [, mimeType, base64Data] = productImageDataUri.match(/^data:(.+?);base64,(.+)$/) || [];
    if (!base64Data) return null;

    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      {
        contents: [{
          parts: [
            {
              text: `Create a photorealistic lifestyle advertisement photo featuring this exact product package, unaltered, placed naturally in this scene: ${sceneDescription}. ` +
                `Do not add any logo, text, words, letters, numbers, watermark or brand marks anywhere in the image — leave it completely clean. ` +
                `Leave clear, uncluttered empty space in the top-right corner and along the bottom edge.`
            },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }]
      },
      {
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        timeout: 40000
      }
    );

    const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!imagePart) return null;
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  } catch (error) {
    console.error("Gemini lifestyle scene generation error:", error.response?.data || error.message);
    return null;
  }
};

module.exports = { generateBackgroundImage, generateLifestyleScene, isConfigured: () => !!GEMINI_API_KEY };
