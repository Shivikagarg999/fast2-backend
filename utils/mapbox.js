const axios = require("axios");

// Same public Mapbox token both Flutter apps already ship with.
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const GEOCODE_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// Resolves a 6-digit Indian pincode to its area's centre {lat, lng}. Used
// instead of geocoding the full free-text address — place names like
// "Chandpur" exist in multiple states, and a wrong match there can send a
// whole order to the wrong city's coordinates. The pincode itself is already
// validated (6 digits) and far less ambiguous. Returns null on any failure
// (no match, network error, missing token) so callers can fall back gracefully.
const resolvePincode = async (pincode) => {
  if (!MAPBOX_TOKEN || !pincode) return null;
  try {
    const { data } = await axios.get(
      `${GEOCODE_BASE}/${encodeURIComponent(pincode)}.json`,
      { params: { access_token: MAPBOX_TOKEN, country: "IN", limit: 1, types: "postcode" } }
    );
    const center = data?.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    return { lat: center[1], lng: center[0] };
  } catch (error) {
    console.error("Mapbox pincode geocoding error:", error.response?.data || error.message);
    return null;
  }
};

module.exports = { resolvePincode };
