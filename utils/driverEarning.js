const AppConfig = require('../models/appConfig');
const { getDistanceKm } = require('./geo');

// Used only when no driverPayoutSlabs are configured yet (fresh install) —
// admin's requested default: flat ₹30 for the first 3km, then ₹10/km.
const DEFAULT_DRIVER_PAYOUT_SLABS = [
  { fromKm: 0, toKm: 3, chargeType: 'flat', rate: 30 },
  { fromKm: 3, toKm: 100, chargeType: 'per_km', rate: 10 }
];

// Unlike the customer-facing delivery charge (which rejects a distance beyond
// its slabs), a driver who has already been assigned an order must be paid —
// so a trip past the last band is paid at that band's rate instead of refused.
const calculatePayoutFromSlabs = (distanceKm, slabs) => {
  const sorted = [...slabs].sort((a, b) => a.fromKm - b.fromKm);
  const band = sorted.find((slab) => distanceKm >= slab.fromKm && distanceKm <= slab.toKm) || sorted[sorted.length - 1];
  const charge = band.chargeType === 'flat' ? band.rate : band.rate * distanceKm;
  return Math.round(charge * 100) / 100;
};

const getDriverPayoutSlabs = async () => {
  const config = await AppConfig.findOne({ app: 'driver' }).select('driverPayoutSlabs').lean();
  return config?.driverPayoutSlabs?.length ? config.driverPayoutSlabs : DEFAULT_DRIVER_PAYOUT_SLABS;
};

// distanceKm may be null (pickup/drop coordinates missing) — falls back to
// the base/first slab's rate so a payout is always shown rather than erroring.
const payoutFromSlabsOrDistance = (distanceKm, slabs) => {
  if (!Number.isFinite(distanceKm)) {
    const base = [...slabs].sort((a, b) => a.fromKm - b.fromKm)[0];
    return base.chargeType === 'flat' ? base.rate : 0;
  }
  return calculatePayoutFromSlabs(distanceKm, slabs);
};

const calculateDriverPayout = async (distanceKm) => {
  const slabs = await getDriverPayoutSlabs();
  return payoutFromSlabsOrDistance(distanceKm, slabs);
};

// Pickup = the order's shop (seller.shop.address.coordinates), drop = the
// order's shippingAddress.lat/lng. Needs seller->shop populated on `order`.
const getOrderDistanceKm = (order) => {
  const pickupLat = Number(order.seller?.shop?.address?.coordinates?.lat);
  const pickupLng = Number(order.seller?.shop?.address?.coordinates?.lng);
  const dropLat = Number(order.shippingAddress?.lat);
  const dropLng = Number(order.shippingAddress?.lng);

  if (![pickupLat, pickupLng, dropLat, dropLng].every((n) => Number.isFinite(n) && n !== 0)) {
    return null;
  }
  return Math.round(getDistanceKm(pickupLat, pickupLng, dropLat, dropLng) * 10) / 10;
};

module.exports = {
  calculateDriverPayout,
  getOrderDistanceKm,
  getDriverPayoutSlabs,
  payoutFromSlabsOrDistance,
  DEFAULT_DRIVER_PAYOUT_SLABS
};
