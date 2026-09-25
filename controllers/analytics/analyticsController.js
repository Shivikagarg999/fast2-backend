const mongoose = require('mongoose');
const AnalyticsEvent = require('../../models/analyticsEvent');
const Product = require('../../models/product');

// Only these events are accepted from the browser.
const ALLOWED_EVENTS = new Set([
    'page_view',
    'product_view',
    'product_click',
    'category_click',
    'subcategory_click',
    'add_to_cart',
    'search',
    'location_set',
    'login_page_view',
    'login_popup_shown',
    'login_popup_submit',
    'login_success',
    'checkout_start',
    'order_placed',
    'offer_popup_shown',
    'offer_popup_cta_click'
]);

const MAX_BATCH = 20;
const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const isUuidLike = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);

// Keeps meta small and flat: string/number/boolean values only.
const sanitizeMeta = (meta) => {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(meta).slice(0, 8)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(key)) continue;
        if (typeof value === 'string') clean[key] = value.slice(0, 200);
        else if (typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
    }
    return clean;
};

exports.trackEvents = async (req, res) => {
    try {
        const { visitorId, sessionId, device, isLoggedIn, referrer, events } = req.body || {};

        if (!isUuidLike(visitorId) || !isUuidLike(sessionId) || !Array.isArray(events)) {
            return res.status(400).json({ success: false });
        }

        const docs = events
            .slice(0, MAX_BATCH)
            .filter((item) => item && ALLOWED_EVENTS.has(item.event))
            .map((item) => ({
                visitorId,
                sessionId,
                event: item.event,
                path: clip(item.path, 300),
                meta: sanitizeMeta(item.meta),
                device: ['mobile', 'tablet', 'desktop'].includes(device) ? device : 'desktop',
                isLoggedIn: !!isLoggedIn,
                referrer: clip(referrer, 200)
            }));

        if (docs.length) {
            await AnalyticsEvent.insertMany(docs, { ordered: false });
        }

        // Nothing useful to return; 202 keeps beacon/fetch callers simple.
        return res.status(202).json({ success: true });
    } catch (error) {
        console.error('Analytics track error:', error);
        return res.status(500).json({ success: false });
    }
};

const parseRange = (query) => {
    const days = Math.min(Math.max(parseInt(query.days, 10) || 7, 1), 90);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to, days };
};

// Funnel steps in the order a customer moves through the site.
const FUNNEL_STEPS = [
    { key: 'visited', label: 'Visited website', event: 'page_view' },
    { key: 'product_view', label: 'Viewed a product', event: 'product_view' },
    { key: 'add_to_cart', label: 'Added to cart', event: 'add_to_cart' },
    { key: 'login_page_view', label: 'Opened login page', event: 'login_page_view' },
    { key: 'login_success', label: 'Logged in', event: 'login_success' },
    { key: 'checkout_start', label: 'Reached checkout', event: 'checkout_start' },
    { key: 'order_placed', label: 'Order placed', event: 'order_placed' }
];

exports.getSummary = async (req, res) => {
    try {
        const { from, to, days } = parseRange(req.query);
        const match = { createdAt: { $gte: from, $lte: to } };

        const [
            perEvent,
            totals,
            daily,
            topPages,
            topProductRefs,
            topCategoryRefs,
            topSearches,
            devices
        ] = await Promise.all([
            // total count + unique visitors per event
            AnalyticsEvent.aggregate([
                { $match: match },
                { $group: { _id: { event: '$event', visitor: '$visitorId' }, count: { $sum: 1 } } },
                { $group: { _id: '$_id.event', total: { $sum: '$count' }, visitors: { $sum: 1 } } }
            ]),
            AnalyticsEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        visitors: { $addToSet: '$visitorId' },
                        sessions: { $addToSet: '$sessionId' },
                        loggedInVisitors: { $addToSet: { $cond: ['$isLoggedIn', '$visitorId', '$$REMOVE'] } }
                    }
                },
                {
                    $project: {
                        visitors: { $size: '$visitors' },
                        sessions: { $size: '$sessions' },
                        loggedInVisitors: { $size: '$loggedInVisitors' }
                    }
                }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'page_view' } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
                        pageViews: { $sum: 1 },
                        visitors: { $addToSet: '$visitorId' }
                    }
                },
                { $project: { _id: 0, date: '$_id', pageViews: 1, visitors: { $size: '$visitors' } } },
                { $sort: { date: 1 } }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'page_view' } },
                { $group: { _id: '$path', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
                { $project: { _id: 0, path: '$_id', views: 1, visitors: { $size: '$visitors' } } },
                { $sort: { views: -1 } },
                { $limit: 10 }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'product_click', 'meta.ref': { $exists: true } } },
                { $group: { _id: '$meta.ref', clicks: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
                { $project: { _id: 0, ref: '$_id', clicks: 1, visitors: { $size: '$visitors' } } },
                { $sort: { clicks: -1 } },
                { $limit: 10 }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'category_click', 'meta.ref': { $exists: true } } },
                { $group: { _id: '$meta.ref', clicks: { $sum: 1 } } },
                { $project: { _id: 0, ref: '$_id', clicks: 1 } },
                { $sort: { clicks: -1 } },
                { $limit: 10 }
            ]),
            AnalyticsEvent.aggregate([
                { $match: { ...match, event: 'search', 'meta.query': { $exists: true, $ne: '' } } },
                { $group: { _id: { $toLower: '$meta.query' }, searches: { $sum: 1 } } },
                { $project: { _id: 0, query: '$_id', searches: 1 } },
                { $sort: { searches: -1 } },
                { $limit: 10 }
            ]),
            AnalyticsEvent.aggregate([
                { $match: match },
                { $group: { _id: '$device', visitors: { $addToSet: '$visitorId' } } },
                { $project: { _id: 0, device: '$_id', visitors: { $size: '$visitors' } } }
            ])
        ]);

        const eventStats = Object.fromEntries(perEvent.map((row) => [row._id, { total: row.total, visitors: row.visitors }]));
        const stat = (event) => eventStats[event] || { total: 0, visitors: 0 };

        const funnel = FUNNEL_STEPS.map((step) => ({
            key: step.key,
            label: step.label,
            visitors: stat(step.event).visitors,
            events: stat(step.event).total
        }));

        // Product names: refs are either a Mongo id or a slug (from the product URL).
        const productRefs = topProductRefs.map((row) => row.ref);
        const objectIds = productRefs.filter((ref) => mongoose.Types.ObjectId.isValid(ref));
        const products = productRefs.length
            ? await Product.find({ $or: [{ _id: { $in: objectIds } }, { slug: { $in: productRefs } }] })
                .select('name slug').lean()
            : [];
        const productName = (ref) => {
            const found = products.find((p) => String(p._id) === ref || p.slug === ref);
            return found?.name || ref;
        };

        return res.status(200).json({
            success: true,
            range: { from, to, days },
            totals: {
                visitors: totals[0]?.visitors || 0,
                sessions: totals[0]?.sessions || 0,
                loggedInVisitors: totals[0]?.loggedInVisitors || 0,
                pageViews: stat('page_view').total,
                productClicks: stat('product_click').total,
                productClickVisitors: stat('product_click').visitors,
                addToCart: stat('add_to_cart').total,
                loginPageVisitors: stat('login_page_view').visitors,
                loginSuccess: stat('login_success').visitors,
                ordersPlaced: stat('order_placed').total
            },
            funnel,
            daily,
            topPages,
            topProducts: topProductRefs.map((row) => ({ name: productName(row.ref), ref: row.ref, clicks: row.clicks, visitors: row.visitors })),
            topCategories: topCategoryRefs,
            topSearches,
            devices,
            popups: {
                loginPopupShown: stat('login_popup_shown').visitors,
                loginPopupSubmitted: stat('login_popup_submit').visitors,
                offerPopupShown: stat('offer_popup_shown').visitors,
                offerPopupClicked: stat('offer_popup_cta_click').visitors
            }
        });
    } catch (error) {
        console.error('Analytics summary error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load analytics' });
    }
};
