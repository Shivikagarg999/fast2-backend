const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

/**
 * 1. Primary: Try Pollinations AI (FLUX) - saves tokens & costs ₹0.
 * 2. Fallback: Gemini API if Pollinations fails/times out.
 * 3. Final Fallback: Returns null, causing Satori to render the clean brand vector gradient.
 */

// Helper to call Pollinations FLUX
const callPollinations = async (prompt, width = 1080, height = 1080, timeoutMs = 35000) => {
  try {
    const seed = Math.floor(Math.random() * 10000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;
    const { data, headers } = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      headers: { "User-Agent": "GMKart/1.0" }
    });
    const mimeType = headers["content-type"] || "image/jpeg";
    return `data:${mimeType};base64,${Buffer.from(data).toString("base64")}`;
  } catch (err) {
    console.warn("Pollinations call failed, falling back to Gemini:", err.message);
    return null;
  }
};

// Helper to call Gemini as fallback
const callGemini = async (contents, timeoutMs = 40000) => {
  if (!GEMINI_API_KEY) return null;
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      { contents },
      {
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        timeout: timeoutMs
      }
    );

    const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!imagePart) return null;
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  } catch (err) {
    console.error("Gemini fallback generation error:", err.response?.data?.error?.message || err.message);
    return null;
  }
};

/**
 * Generate decorative background art
 * Pipeline: Pollinations (Free) -> Gemini (Fallback) -> Brand Gradient (Safe Fallback)
 */
const generateBackgroundImage = async (prompt, dimensions = {}) => {
  const width = dimensions.width || 1080;
  const height = dimensions.height || 1080;

  // 1. Try Pollinations first (0 tokens, 0 cost)
  const pollinationsPrompt = `${prompt}. Commercial background art, grocery store atmosphere, warm ambient lighting, soft bokeh blur, minimal, elegant, no text, no words, no letters, no watermark, no logos`;
  const result = await callPollinations(pollinationsPrompt, width, height, 30000);
  if (result) return result;

  // 2. Fallback to Gemini if Pollinations fails
  if (GEMINI_API_KEY) {
    console.log("Using Gemini as fallback for background generation...");
    const geminiResult = await callGemini([{
      parts: [{
        text: `${prompt}. Decorative background art only — no text, no words, no letters, no logos, no numbers anywhere in the image.`
      }]
    }]);
    if (geminiResult) return geminiResult;
  }

  // 3. Final: return null so Satori uses the brand gradient (₹0 cost, 100% reliable)
  return null;
};

/**
 * Generate a photorealistic lifestyle scene featuring the product
 * Pipeline: Pollinations (Free) -> Gemini (Fallback)
 */
const generateLifestyleScene = async (productImageDataUri, sceneDescription, productName = "", dimensions = {}) => {
  const width = dimensions.width || 1080;
  const height = dimensions.height || 1080;

  // 1. Try Pollinations first (0 tokens, 0 cost)
  const pollinationsPrompt = `Commercial product advertisement photography of ${productName ? `"${productName}"` : "fresh grocery product"}, placed naturally in ${sceneDescription || "a cozy modern Indian kitchen with warm morning sunlight"}. Photorealistic, 8k, sharp focus, magazine quality, depth of field, no text, no words, no letters, no watermark, no logos`;
  const result = await callPollinations(pollinationsPrompt, width, height, 35000);
  if (result) return result;

  // 2. Fallback to Gemini if Pollinations fails & Gemini key exists
  if (GEMINI_API_KEY && productImageDataUri) {
    console.log("Using Gemini as fallback for lifestyle scene...");
    const [, mimeType, base64Data] = productImageDataUri.match(/^data:(.+?);base64,(.+)$/) || [];
    if (base64Data) {
      const geminiResult = await callGemini([{
        parts: [
          {
            text: `Create a photorealistic lifestyle advertisement photo featuring this product package, unaltered, placed naturally in: ${sceneDescription || "a modern Indian kitchen"}. Do not add any text, watermark or logo. Leave clear empty space in top-right corner.`
          },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }]);
      if (geminiResult) return geminiResult;
    }
  }

  return null;
};

module.exports = {
  generateBackgroundImage,
  generateLifestyleScene,
  isConfigured: () => true // Always true because of hybrid fallback pipeline
};
