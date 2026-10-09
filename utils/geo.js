const getDistanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const toRadians = (degree) => degree * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// slabs need not be pre-sorted. The distance falls into exactly one band;
// that band's own rate is the charge (a flat fee, or a per-km rate times the
// full distance) — bands are not summed across each other.
const calculateSlabDeliveryCharge = (distanceKm, slabs) => {
  if (!slabs || !slabs.length) return null;

  const sorted = [...slabs].sort((a, b) => a.fromKm - b.fromKm);
  const maxKm = sorted[sorted.length - 1].toKm;

  if (distanceKm > maxKm) {
    return { withinRange: false, maxKm };
  }

  const band = sorted.find((slab) => distanceKm >= slab.fromKm && distanceKm <= slab.toKm)
    || (distanceKm < sorted[0].fromKm ? sorted[0] : null);

  if (!band) {
    return { withinRange: false, maxKm };
  }

  const charge = band.chargeType === 'flat' ? band.rate : band.rate * distanceKm;

  return { withinRange: true, charge: Math.round(charge * 100) / 100, maxKm };
};

module.exports = { getDistanceKm, calculateSlabDeliveryCharge };
