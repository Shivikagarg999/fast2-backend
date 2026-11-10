// One-time seed for the Occasion calendar (upcoming-festivals suggestion
// feature). Lunar-calendar festivals (Diwali, Holi, Raksha Bandhan, Eid) vary
// year to year and sources disagree on exact 2026/2027 dates — these are
// best-effort and should be corrected in the DB (or a future admin UI) closer
// to the date. Fixed-date festivals (New Year, Republic Day, Independence Day,
// Christmas, Valentine's, Mother's Day) are reliable.
require("dotenv").config();
const mongoose = require("mongoose");
const Occasion = require("../models/occasion");

const occasions = [
  { name: "Christmas", emoji: "🎄", date: new Date("2026-12-25"), keywords: ["gift", "sweet", "chocolate", "cake", "decor", "party"] },
  { name: "New Year", emoji: "🎉", date: new Date("2027-01-01"), keywords: ["gift", "party", "chocolate", "snacks", "celebration"] },
  { name: "Republic Day", emoji: "🇮🇳", date: new Date("2027-01-26"), keywords: ["sweet", "snacks"] },
  { name: "Valentine's Day", emoji: "❤️", date: new Date("2027-02-14"), keywords: ["chocolate", "gift", "flower", "rose", "cake"] },
  { name: "Holi", emoji: "🎨", date: new Date("2027-03-04"), keywords: ["sweet", "snacks", "color", "gujiya", "thandai"] },
  { name: "Mother's Day", emoji: "🌸", date: new Date("2027-05-09"), keywords: ["flower", "gift", "cake", "chocolate"] },
  { name: "Raksha Bandhan", emoji: "🎗️", date: new Date("2027-08-16"), keywords: ["sweet", "gift", "rakhi", "chocolate"] },
  { name: "Independence Day", emoji: "🇮🇳", date: new Date("2027-08-15"), keywords: ["sweet", "snacks", "tricolor"] },
  { name: "Diwali", emoji: "🪔", date: new Date("2027-10-26"), keywords: ["sweet", "dry fruit", "gift", "decor", "diya", "candle", "chocolate"] }
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  for (const occasion of occasions) {
    await Occasion.updateOne({ name: occasion.name }, { $set: occasion }, { upsert: true });
  }
  console.log(`Seeded ${occasions.length} occasions.`);
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
