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

// Next occurrence (strictly after `after`) among `daysOfWeek` at `time` (IST),
// bounded by `startDate`/`endDate`. Returns null if none exists (e.g. past endDate).
const computeNextWeeklyRun = ({ daysOfWeek, time, startDate, endDate }, after = new Date()) => {
    if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) return null;
    const { hours, minutes } = parseTime(time);
    const floor = startDate && startDate > after ? startDate : after;
    const { year, month, day, dow } = istPartsOf(floor);

    for (let offset = 0; offset <= 7; offset++) {
        const candidateDow = (dow + offset) % 7;
        if (!daysOfWeek.includes(candidateDow)) continue;
        const candidate = istWallClockToUtc(year, month, day + offset, hours, minutes);
        if (candidate <= after) continue;
        if (startDate && candidate < startDate) continue;
        if (endDate && candidate > endDate) continue;
        return candidate;
    }
    return null;
};

module.exports = { istPartsOf, istWallClockToUtc, computeNextWeeklyRun };
