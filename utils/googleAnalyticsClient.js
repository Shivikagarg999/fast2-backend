const { BetaAnalyticsDataClient } = require("@google-analytics/data");

// Reuses the same Firebase Admin service account already configured for push
// notifications (FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY) — that service
// account just needs Viewer access added to the GA4 property in
// Admin > Property Access Management, no separate key to create.
const PROPERTY_ID = process.env.GA4_PROPERTY_ID;

let client = null;
const getClient = () => {
  if (client) return client;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;
  if (!clientEmail || !privateKey) return null;

  client = new BetaAnalyticsDataClient({
    credentials: { client_email: clientEmail, private_key: privateKey }
  });
  return client;
};

const isConfigured = () => !!(PROPERTY_ID && getClient());

// Per-event, per-platform breakdown over the given day range.
const getEventSummary = async (days = 7) => {
  const analyticsClient = getClient();
  if (!analyticsClient || !PROPERTY_ID) {
    throw new Error("Firebase Analytics is not configured (missing GA4_PROPERTY_ID or service account credentials)");
  }

  const [report] = await analyticsClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "eventName" }, { name: "platform" }],
    metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 100
  });

  const rows = (report.rows || []).map((row) => ({
    event: row.dimensionValues[0].value,
    platform: row.dimensionValues[1].value,
    count: Number(row.metricValues[0].value || 0),
    users: Number(row.metricValues[1].value || 0)
  }));

  const [totalsReport] = await analyticsClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "platform" }],
    metrics: [{ name: "activeUsers" }, { name: "eventCount" }]
  });

  const totals = (totalsReport.rows || []).map((row) => ({
    platform: row.dimensionValues[0].value,
    activeUsers: Number(row.metricValues[0].value || 0),
    eventCount: Number(row.metricValues[1].value || 0)
  }));

  return { events: rows, totals };
};

module.exports = { isConfigured, getEventSummary };
