const ScheduledNotification = require('../../../models/scheduledNotification');
const User = require('../../../models/user');
const { validateContent } = require('../../../services/notificationCampaignService');
const { computeNextWeeklyRun } = require('../../../utils/istSchedule');

const MAX_DAYS_OF_WEEK = 7;

const buildScheduleFields = (body) => {
    const scheduleType = body.scheduleType === 'weekly' ? 'weekly' : 'once';

    if (scheduleType === 'once') {
        const sendAt = new Date(body.sendAt);
        if (!body.sendAt || Number.isNaN(sendAt.getTime())) {
            return { error: 'Enter a valid date and time to send' };
        }
        if (sendAt <= new Date()) {
            return { error: 'Scheduled time must be in the future' };
        }
        return { scheduleType, sendAt, nextRunAt: sendAt };
    }

    const daysOfWeek = Array.isArray(body.daysOfWeek)
        ? [...new Set(body.daysOfWeek.map(Number))].filter((d) => d >= 0 && d <= 6)
        : [];
    if (!daysOfWeek.length || daysOfWeek.length > MAX_DAYS_OF_WEEK) {
        return { error: 'Select at least one day of the week' };
    }
    if (!/^\d{1,2}:\d{2}$/.test(body.time || '')) {
        return { error: 'Enter a valid time' };
    }
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    if (Number.isNaN(startDate.getTime())) {
        return { error: 'Invalid start date' };
    }
    let endDate = null;
    if (body.endDate) {
        endDate = new Date(body.endDate);
        if (Number.isNaN(endDate.getTime())) {
            return { error: 'Invalid end date' };
        }
        if (endDate < startDate) {
            return { error: 'End date must be after the start date' };
        }
    }

    const nextRunAt = computeNextWeeklyRun(
        { daysOfWeek, time: body.time, startDate, endDate },
        new Date()
    );
    if (!nextRunAt) {
        return { error: 'No valid send time falls within the selected date range' };
    }

    return { scheduleType, daysOfWeek, time: body.time, startDate, endDate, nextRunAt };
};

exports.createScheduledNotification = async (req, res) => {
    try {
        const validated = validateContent(req.body || {});
        if (validated.error) {
            return res.status(400).json({ success: false, message: validated.error });
        }

        const schedule = buildScheduleFields(req.body || {});
        if (schedule.error) {
            return res.status(400).json({ success: false, message: schedule.error });
        }

        const { audience, phone, userId } = req.body;
        const adminId = req.admin?._id;

        let targetUser = null;
        let targetLabel = 'All customers';
        if (audience === 'user') {
            let userQuery = null;
            if (userId) userQuery = { _id: userId };
            else if (phone) userQuery = { phone: String(phone).replace(/\D/g, '').slice(-10) };
            if (!userQuery) {
                return res.status(400).json({ success: false, message: 'Enter a customer phone number or user ID' });
            }
            const user = await User.findOne(userQuery).select('_id name phone').lean();
            if (!user) {
                return res.status(404).json({ success: false, message: 'No customer found with that phone number or ID' });
            }
            targetUser = user._id;
            targetLabel = user.name || user.phone || String(user._id);
        } else if (audience !== 'all') {
            return res.status(400).json({ success: false, message: "audience must be 'all' or 'user'" });
        }

        const scheduled = await ScheduledNotification.create({
            title: validated.title,
            body: validated.body,
            audience,
            targetUser,
            targetLabel,
            ...schedule,
            createdBy: adminId
        });

        return res.status(201).json({ success: true, message: 'Notification scheduled', data: scheduled });
    } catch (error) {
        console.error('Create scheduled notification error:', error);
        return res.status(500).json({ success: false, message: 'Failed to schedule notification', error: error.message });
    }
};

exports.getScheduledNotifications = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const [items, total] = await Promise.all([
            ScheduledNotification.find(filter)
                .sort({ status: 1, nextRunAt: 1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ScheduledNotification.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: items,
            pagination: { currentPage: page, totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error('Get scheduled notifications error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load scheduled notifications' });
    }
};

exports.setScheduledNotificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['active', 'paused', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const scheduled = await ScheduledNotification.findById(id);
        if (!scheduled) {
            return res.status(404).json({ success: false, message: 'Scheduled notification not found' });
        }
        if (scheduled.status === 'completed' || scheduled.status === 'cancelled') {
            return res.status(400).json({ success: false, message: `Cannot change a ${scheduled.status} schedule` });
        }

        scheduled.status = status;
        if (status === 'active' && scheduled.scheduleType === 'weekly') {
            // Recompute in case it was paused long enough that the stored nextRunAt is in the past.
            scheduled.nextRunAt = computeNextWeeklyRun(scheduled, new Date());
            if (!scheduled.nextRunAt) scheduled.status = 'completed';
        }
        await scheduled.save();

        return res.status(200).json({ success: true, message: 'Updated', data: scheduled });
    } catch (error) {
        console.error('Update scheduled notification status error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update scheduled notification' });
    }
};

exports.deleteScheduledNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ScheduledNotification.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Scheduled notification not found' });
        }
        return res.status(200).json({ success: true, message: 'Scheduled notification deleted' });
    } catch (error) {
        console.error('Delete scheduled notification error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete scheduled notification' });
    }
};
