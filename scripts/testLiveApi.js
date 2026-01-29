const https = require('https');

// Helper to make HTTP requests
function makeRequest(url, method, headers, body) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function testLiveServer() {
    const baseUrl = 'https://api.fast2.in';
    console.log(`🚀 Testing functionality on Test Live Server: ${baseUrl}`);

    try {
        // 1. Register a temporary user to trigger "Welcome" notification
        const email = `test.notif.${Date.now()}@fast2.in`;
        const password = 'TestPassword123';

        console.log(`\n1. Registering new user (${email})...`);
        const regRes = await makeRequest(`${baseUrl}/api/user/register`, 'POST', {}, {
            email,
            password,
            name: "Test Bot"
        });

        if (regRes.statusCode !== 201) {
            console.error('❌ Registration Failed:', regRes.data);
            return;
        }

        const token = regRes.data.token;
        const userId = regRes.data.user.id;
        console.log('✅ Registration Successful!');
        console.log(`   User ID: ${userId}`);
        console.log(`   Token received (first 10 chars): ${token.substring(0, 10)}...`);

        // 2. Fetch Notifications
        console.log('\n2. Fetching Notifications (Expect "Welcome" message)...');
        // Give DB a slight moment to ensure consistency (optional but good for testing)
        await new Promise(r => setTimeout(r, 1000));

        const notifRes = await makeRequest(`${baseUrl}/api/notifications`, 'GET', {
            'Authorization': `Bearer ${token}`
        });

        if (notifRes.statusCode !== 200) {
            console.error('❌ Fetch Notifications Failed:', notifRes.data);
            return;
        }

        const notifications = notifRes.data.notifications;
        console.log(`✅ Clicked Fetch API. Found ${notifications.length} notifications.`);

        if (notifications.length > 0) {
            const n = notifications[0];
            console.log('\n--- Latest Notification ---');
            console.log('Title:', n.title);
            console.log('Body:', n.body);
            console.log('Type:', n.type);
            console.log('Date:', n.date);
            console.log('---------------------------');

            if (n.title.includes('Welcome')) {
                console.log('\n✅ SUCCESS: The "Welcome" notification was generated and fetched from the live server!');
            } else {
                console.warn('\n⚠️ WARNING: Notifications found, but waiting for "Welcome" message. (Might be delayed or server code not updated)');
            }
        } else {
            console.error('\n❌ FAILURE: No notifications found. The "Welcome" hook logic might not be live on api.fast2.in yet.');
        }

    } catch (error) {
        console.error('❌ Script Error:', error);
    }
}

testLiveServer();
