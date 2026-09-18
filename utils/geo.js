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

// slabs need not be pre-sorted; bands must be contiguous starting at 0 for a
// sensible result. Charge is cumulative/tiered: each band's rate applies only
// to the portion of the distance that falls inside that band.
const calculateSlabDeliveryCharge = (distanceKm, slabs) => {
  if (!slabs || !slabs.length) return null;

  const sorted = [...slabs].sort((a, b) => a.fromKm - b.fromKm);
  const maxKm = sorted[sorted.length - 1].toKm;

  if (distanceKm > maxKm) {
    return { withinRange: false, maxKm };
  }

  let charge = 0;
  for (const slab of sorted) {
    if (distanceKm <= slab.fromKm) break;
    const coveredKm = Math.max(Math.min(distanceKm, slab.toKm) - slab.fromKm, 0);
    if (coveredKm <= 0) continue;
    charge += slab.chargeType === 'flat' ? slab.rate : slab.rate * coveredKm;
  }

  return { withinRange: true, charge: Math.round(charge * 100) / 100, maxKm };
};

module.exports = { getDistanceKm, calculateSlabDeliveryCharge };
