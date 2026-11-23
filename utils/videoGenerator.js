const axios = require("axios");

// Pollinations' text-to-video endpoint — unlike their free image endpoint,
// EVERY video model is paid_only (confirmed against gen.pollinations.ai/video/models),
// so this requires a funded secret key from enter.pollinations.ai/keys.
// Video is generated silent (no native dialogue) — the Hindi voiceover is
// added separately by ttsGenerator + videoCompositor, for full script control.
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;
const VIDEO_MODEL = process.env.POLLINATIONS_VIDEO_MODEL || "google/veo-3.1-fast";

const isConfigured = () => !!POLLINATIONS_API_KEY;

/**
 * Generate a short silent video from a text prompt.
 * @param {string} prompt
 * @param {object} options - { duration: 4|6|8 }
 * @returns {Promise<Buffer|null>} MP4 bytes, or null if not configured/failed.
 */
const generateVideo = async (prompt, options = {}) => {
  if (!POLLINATIONS_API_KEY) {
    console.warn("Video generation requested but POLLINATIONS_API_KEY is not configured");
    return null;
  }

  const duration = options.duration || 8;
  const fullPrompt = `${prompt}. Commercial advertisement video, photorealistic, smooth camera motion, no text, no words, no letters, no watermark, no logos, no subtitles.`;

  try {
    const url = `https://gen.pollinations.ai/video/${encodeURIComponent(fullPrompt)}`;
    const { data } = await axios.get(url, {
      params: { model: VIDEO_MODEL, duration },
      responseType: "arraybuffer",
      timeout: 180000, // video generation is slow — give it real time
      headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` }
    });
    return Buffer.from(data);
  } catch (err) {
    console.error("Pollinations video generation failed:", err.response?.data ? err.response.data.toString() : err.message);
    return null;
  }
};

module.exports = { isConfigured, generateVideo };
