require('dotenv').config();
const mongoose = require('mongoose');
const notificationService = require('../services/notificationService');
const User = require('../models/user');
const Notification = require('../models/notification');

async function testNotificationSystem() {
    try {
        console.log('1. Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find a random user to test with
        const user = await User.findOne();
        if (!user) {
            console.error('❌ No user found to test with');
            process.exit(1);
        }
        console.log(`2. Testing with User: ${user._id} (${user.email})`);

        // Test creation
        console.log('3. Sending Test Notification...');
        const title = "Test Notification " + Date.now();
        const body = "This is a debug test message";

        // This mimics exactly what the controller does
        await notificationService.sendNotification(
            user._id,
            title,
            body,
            'system',
            'TEST-REF-123'
        );
        console.log('✅ sendNotification function executed');

        // Test Retrieval (Mimic GET /api/notifications)
        console.log('4. Verifying Retrieval (Controller Logic)...');
        const notifications = await Notification.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(1);

        if (notifications.length > 0) {
            const n = notifications[0];
            if (n.title === title) {
                console.log('✅ SUCCESS! Notification fetched correctly.');
                console.log('   Title:', n.title);
                console.log('   Type:', n.type);
                console.log('   RefID:', n.referenceId);
            } else {
                console.warn('⚠️ Found a notification, but it wasn\'t the one we just created. (Race condition?)');
            }
        } else {
            console.error('❌ FAILURE! could not fetch any notifications for this user.');
        }

    } catch (error) {
        console.error('❌ Test Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

testNotificationSystem();
