const cron = require('node-cron');
const ScheduledNotification = require('../models/scheduledNotification');
const { sendBroadcast, sendToUser } = require('./notificationCampaignService');
const { computeNextWeeklyRun } = require('../utils/istSchedule');

const runDueNotification = async (scheduled) => {
    const { title, body, audience, targetUser } = scheduled;

    try {
        if (audience === 'all') {
            await sendBroadcast({ title, body, adminId: scheduled.createdBy, scheduledNotification: scheduled._id });
        } else {
            await sendToUser({
                title,
                body,
                adminId: scheduled.createdBy,
                userQuery: { _id: targetUser },
                scheduledNotification: scheduled._id
            });
        }

        scheduled.lastSentAt = new Date();
        scheduled.sendCount += 1;

        if (scheduled.scheduleType === 'once') {
            scheduled.status = 'completed';
            scheduled.nextRunAt = null;
        } else {
            const next = computeNextWeeklyRun(scheduled, new Date());
            scheduled.nextRunAt = next;
            if (!next) scheduled.status = 'completed';
        }
    } catch (error) {
        console.error(`Scheduled notification ${scheduled._id} failed to send:`, error.message);
        // Leave status/nextRunAt as-is so the next sweep retries it rather than
        // silently losing a scheduled send over a transient error.
    }

    await scheduled.save();
};

const sweep = async () => {
    const due = await ScheduledNotification.find({
        status: 'active',
        nextRunAt: { $lte: new Date() }
    });

    for (const scheduled of due) {
        await runDueNotification(scheduled);
    }
};

let started = false;

const startNotificationScheduler = () => {
    if (started) return;
    started = true;
    // Runs every minute; due notifications are rare enough that a simple sweep
    // is far simpler than per-job cron entries and doesn't need a queue.
    cron.schedule('* * * * *', () => {
        sweep().catch((error) => console.error('Notification scheduler sweep failed:', error));
    });
    console.log('🔔 Notification scheduler started (checks every minute)');
};

module.exports = { startNotificationScheduler, sweep };
