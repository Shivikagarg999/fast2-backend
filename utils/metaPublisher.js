const axios = require("axios");

// Same Meta Business Manager/app as the WhatsApp integration — reuses the
// System User token (whatsappAccessToken) rather than a separate one, as
// long as that System User has the Facebook Page asset assigned and the app
// has been granted pages_show_list/pages_manage_posts/instagram_basic/
// instagram_content_publish (added the same way catalog_management was:
// Business Settings > System Users > assign the Page, then App > Use Cases).
const SYSTEM_USER_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const BUSINESS_ID = process.env.FACEBOOK_BUSINESS_ID || "2057366934911903";
const GRAPH_VERSION = "v21.0";
const graphUrl = (path) => `https://graph.facebook.com/${GRAPH_VERSION}${path}`;

let cachedPage = null;

// Auto-discovers the business's Facebook Page (and its own Page access token,
// which is what photo/media-publish calls actually need — not the System
// User token directly) — no Page ID needs to be hardcoded in .env.
const getPage = async () => {
  if (cachedPage) return cachedPage;
  if (!SYSTEM_USER_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");

  const { data } = await axios.get(graphUrl(`/${BUSINESS_ID}/owned_pages`), {
    params: { fields: "id,name,access_token,instagram_business_account", access_token: SYSTEM_USER_TOKEN }
  });

  const page = data?.data?.[0];
  if (!page) {
    throw new Error("No Facebook Page is assigned to this System User yet — assign it in Business Settings first");
  }
  cachedPage = page;
  return page;
};

const isConfigured = () => !!SYSTEM_USER_TOKEN;

// imageUrl must be a public URL (our ImageKit-hosted generated post already is).
const postToFacebookPage = async (imageUrl, caption) => {
  const page = await getPage();
  const { data } = await axios.post(graphUrl(`/${page.id}/photos`), null, {
    params: { url: imageUrl, caption, access_token: page.access_token }
  });
  return { postId: data.post_id || data.id };
};

// Instagram publishing is two steps: create a media container, then publish
// it — both against the Instagram Business Account linked to the Page.
const postToInstagram = async (imageUrl, caption) => {
  const page = await getPage();
  const igUserId = page.instagram_business_account?.id;
  if (!igUserId) {
    throw new Error("No Instagram account is linked to the Facebook Page yet");
  }

  const { data: container } = await axios.post(graphUrl(`/${igUserId}/media`), null, {
    params: { image_url: imageUrl, caption, access_token: page.access_token }
  });

  const { data: published } = await axios.post(graphUrl(`/${igUserId}/media_publish`), null, {
    params: { creation_id: container.id, access_token: page.access_token }
  });

  return { postId: published.id };
};

// Facebook video upload: unlike photos, this is `file_url`/`description` (not
// `url`/`caption`), and the video processes in the background after Meta
// acks the request — no polling needed for a basic feed video post.
const postVideoToFacebookPage = async (videoUrl, caption) => {
  const page = await getPage();
  const { data } = await axios.post(graphUrl(`/${page.id}/videos`), null, {
    params: { file_url: videoUrl, description: caption, access_token: page.access_token }
  });
  return { postId: data.post_id || data.id };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Instagram Reels container processing is async — unlike a photo container,
// which is ready instantly, a video container must be polled until Meta
// reports FINISHED before media_publish will succeed.
const waitForIgContainerReady = async (containerId, accessToken, { attempts = 10, delayMs = 12000 } = {}) => {
  for (let i = 0; i < attempts; i++) {
    const { data } = await axios.get(graphUrl(`/${containerId}`), {
      params: { fields: "status_code", access_token: accessToken }
    });
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error("Instagram failed to process the video container");
    }
    await sleep(delayMs);
  }
  throw new Error("Timed out waiting for Instagram to finish processing the video");
};

const postVideoToInstagram = async (videoUrl, caption) => {
  const page = await getPage();
  const igUserId = page.instagram_business_account?.id;
  if (!igUserId) {
    throw new Error("No Instagram account is linked to the Facebook Page yet");
  }

  const { data: container } = await axios.post(graphUrl(`/${igUserId}/media`), null, {
    params: { media_type: "REELS", video_url: videoUrl, caption, access_token: page.access_token }
  });

  await waitForIgContainerReady(container.id, page.access_token);

  const { data: published } = await axios.post(graphUrl(`/${igUserId}/media_publish`), null, {
    params: { creation_id: container.id, access_token: page.access_token }
  });

  return { postId: published.id };
};

module.exports = {
  isConfigured,
  postToFacebookPage,
  postToInstagram,
  postVideoToFacebookPage,
  postVideoToInstagram
};
