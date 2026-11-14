const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

/**
 * Image Generation Pipeline:
 * 1. Primary: Pollinations AI (FLUX) — 100% Free, 0 tokens, ₹0 cost.
 * 2. Gemini is DISABLED by default. Only used if explicitly requested (options.allowGemini === true).
 * 3. Safe fallback: Satori clean brand vector gradient.
 */

// Helper to call Pollinations FLUX
const callPollinations = async (prompt, width = 1080, height = 1080, timeoutMs = 45000) => {
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
    console.warn("Pollinations call failed:", err.message);
    return null;
  }
};

// Helper to call Gemini (Strictly disabled unless allowGemini === true)
const callGemini = async (contents, timeoutMs = 40000) => {
  if (!GEMINI_API_KEY) {
    console.warn("Gemini requested but GEMINI_API_KEY is not configured");
    return null;
  }
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
    console.error("Gemini generation error:", err.response?.data?.error?.message || err.message);
    return null;
  }
};

/**
 * Generate decorative background art
 * @param {string} prompt
 * @param {object} dimensions - { width, height }
 * @param {object} options - { allowGemini: false }
 */
const generateBackgroundImage = async (prompt, dimensions = {}, options = {}) => {
  const width = dimensions.width || 1080;
  const height = dimensions.height || 1080;
  const allowGemini = options.allowGemini === true || options.useGemini === true;

  // 1. Try Free Pollinations FLUX first (₹0 cost, 0 tokens)
  const pollinationsPrompt = `${prompt}. Commercial background art, grocery store atmosphere, warm ambient lighting, soft bokeh blur, minimal, elegant, no text, no words, no letters, no watermark, no logos`;
  const result = await callPollinations(pollinationsPrompt, width, height);
  if (result) return result;

  // 2. Gemini fallback is ONLY called if specifically enabled by caller
  if (allowGemini && GEMINI_API_KEY) {
    console.log("Gemini explicitly enabled: calling Gemini for background generation...");
    const geminiResult = await callGemini([{
      parts: [{
        text: `${prompt}. Decorative background art only — no text, no words, no letters, no logos, no numbers anywhere in the image.`
      }]
    }]);
    if (geminiResult) return geminiResult;
  } else {
    console.log("Gemini is kept disabled (default). Falling back to safe brand gradient.");
  }

  // 3. Fallback to Satori vector gradient (₹0 cost, 100% reliable)
  return null;
};

/**
 * Generate a photorealistic lifestyle scene featuring one or multiple products
 * @param {Array<string>|string} productImageDataUris - Base64 data URIs
 * @param {string} sceneDescription - Setting description
 * @param {Array<string>|string} productNames - Name(s) of products
 * @param {object} dimensions - { width, height }
 * @param {object} options - { allowGemini: false }
 */
const generateLifestyleScene = async (productImageDataUris, sceneDescription, productNames = [], dimensions = {}, options = {}) => {
  const width = dimensions.width || 1080;
  const height = dimensions.height || 1080;
  const allowGemini = options.allowGemini === true || options.useGemini === true;

  const namesList = Array.isArray(productNames) ? productNames.filter(Boolean) : (productNames ? [productNames] : []);
  const productsLabel = namesList.length > 1
    ? `curated grocery bundle of ${namesList.slice(0, -1).join(", ")} and ${namesList[namesList.length - 1]}`
    : (namesList[0] ? `"${namesList[0]}" grocery product` : "fresh grocery products");

  // 1. Try Free Pollinations FLUX (₹0 cost, 0 tokens)
  const pollinationsPrompt = `Commercial advertisement product photography featuring a ${productsLabel}, arranged naturally together on ${sceneDescription || "a modern cozy Indian kitchen breakfast table with warm morning sunlight"}. Beautiful commercial composition, photorealistic, 8k, sharp focus, magazine quality, depth of field, no text, no words, no letters, no watermark, no logos`;
  const result = await callPollinations(pollinationsPrompt, width, height);
  if (result) return result;

  // 2. Gemini fallback is strictly disabled unless explicitly allowed
  if (allowGemini && GEMINI_API_KEY) {
    console.log("Gemini explicitly enabled: calling Gemini for lifestyle scene...");
    const primaryDataUri = Array.isArray(productImageDataUris) ? productImageDataUris[0] : productImageDataUris;
    if (primaryDataUri) {
      const [, mimeType, base64Data] = primaryDataUri.match(/^data:(.+?);base64,(.+)$/) || [];
      if (base64Data) {
        const geminiResult = await callGemini([{
          parts: [
            {
              text: `Create a photorealistic lifestyle advertisement photo featuring ${productsLabel}, placed naturally in: ${sceneDescription || "a modern Indian kitchen"}. Do not add any text, watermark or logo. Leave clear empty space in top-right corner.`
            },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }]);
        if (geminiResult) return geminiResult;
      }
    }
  } else {
    console.log("Gemini is kept disabled (default).");
  }

  return null;
};

module.exports = {
  generateBackgroundImage,
  generateLifestyleScene,
  isConfigured: () => true
};
