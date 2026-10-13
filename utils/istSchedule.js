// IST is a fixed UTC+5:30 offset with no DST, so this is plain arithmetic —
// no need for a timezone library.
const IST_OFFSET_MINUTES = 5.5 * 60;

// IST calendar date/time of a given instant.
const istPartsOf = (date) => {
    const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
    return {
        year: ist.getUTCFullYear(),
        month: ist.getUTCMonth(),
        day: ist.getUTCDate(),
        dow: ist.getUTCDay() // 0=Sun..6=Sat
    };
};

// The UTC instant corresponding to a given IST wall-clock date+time.
const istWallClockToUtc = (year, month, day, hours, minutes) => {
    const utcMinutes = hours * 60 + minutes - IST_OFFSET_MINUTES;
    return new Date(Date.UTC(year, month, day, 0, utcMinutes, 0));
};

const parseTime = (time) => {
    const [hh, mm] = String(time || '').split(':').map((n) => parseInt(n, 10));
    return { hours: Number.isFinite(hh) ? hh : 0, minutes: Number.isFinite(mm) ? mm : 0 };
};

// Fixed time-of-day presets the admin picks per weekday — e.g. "Monday:
// Morning + Evening" — instead of one time applied to every selected day.
const SLOT_PRESETS = {
    morning: '09:00',
    afternoon: '14:00',
    evening: '18:00'
};

// Next occurrence (strictly after `after`) among `weeklySlots` (each a
// { dayOfWeek: 0-6, time: "HH:mm" } pair, IST), bounded by `startDate`/
// `endDate`. Each weekday can carry multiple independent slots. Returns null
// if none exists (e.g. past endDate).
const computeNextWeeklyRun = ({ weeklySlots, startDate, endDate }, after = new Date()) => {
    if (!Array.isArray(weeklySlots) || !weeklySlots.length) return null;
    const floor = startDate && startDate > after ? startDate : after;
    const { year, month, day, dow } = istPartsOf(floor);

    for (let offset = 0; offset <= 7; offset++) {
        const candidateDow = (dow + offset) % 7;
        const candidatesForDay = weeklySlots
            .filter((slot) => slot.dayOfWeek === candidateDow)
            .map((slot) => {
                const { hours, minutes } = parseTime(slot.time);
                return istWallClockToUtc(year, month, day + offset, hours, minutes);
            })
            .filter((candidate) => (
                candidate > after &&
                (!startDate || candidate >= startDate) &&
                (!endDate || candidate <= endDate)
            ))
            .sort((a, b) => a - b);
        // Offsets are checked in increasing chronological order, so the first
        // day with any valid candidate holds the overall soonest occurrence.
        if (candidatesForDay.length) return candidatesForDay[0];
    }
    return null;
};

module.exports = { istPartsOf, istWallClockToUtc, computeNextWeeklyRun, SLOT_PRESETS };
