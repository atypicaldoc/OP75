const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_MAILTO,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const MESSAGES = [
  "Bennet hasn't heard from you today. Everything okay?",
  "No check-in yet. How did the day actually go?",
  "Silent day. Even a bad report is useful. What happened?",
  "Nothing logged today. Dinner before 8 tonight?",
  "You went quiet. One message is enough. How are you doing?",
  "No update today. Workout happen or not?",
  "Bennet's waiting. Quick check-in before bed?",
  "Day's almost done. How did it go?",
  "Still no check-in. Even one line helps.",
  "Quiet day on the app. That usually means something. What was it?",
  "No update yet. Walk after dinner tonight?",
  "Haven't heard from you. Quick one before you sleep?",
  "Missed your check-in today. What got in the way?",
  "Nothing from you today. Log it before the day closes.",
  "No check-in. How's the weight tracking this week?",
  "Silent today. Did the workout happen?",
  "You skipped the check-in. That's fine, just tell Bennet what actually happened.",
  "No update yet. Dinner time tonight?",
  "Quiet. One message before bed. That's all it takes.",
  "Haven't heard from you today. Push-ups happen?",
  "No check-in yet. Long day? Tell Bennet how it went.",
  "Still waiting. Even a rough day counts. Log it.",
  "Nothing logged. Walk done tonight?",
  "No update today. What slipped?",
  "Silent day. Quick check-in before midnight?",
  "Bennet's still here. How did today actually go?",
  "No check-in. Don't let the day close without logging it.",
  "Quiet today. One line is enough. What happened?",
  "Nothing from you yet. How's the week looking overall?",
  "Last check before midnight. How did today go?"
];

exports.handler = async () => {
  try {
    // Get IST date for today
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0];
    const dayOfMonth = istNow.getDate();
    const message = MESSAGES[dayOfMonth - 1];

    // Get all users with notifications enabled
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, push_subscription')
      .eq('notifications_enabled', true)
      .not('push_subscription', 'is', null);

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      return { statusCode: 200, body: 'No users to notify' };
    }

    // For each user, check if they chatted today
    const results = await Promise.allSettled(
      users.map(async (user) => {
        const { data: messages } = await supabase
          .from('messages')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', todayIST + 'T00:00:00+05:30')
          .lte('created_at', todayIST + 'T23:59:59+05:30')
          .limit(1);

        // If they chatted today, skip
        if (messages && messages.length > 0) return 'skipped';

        // Send push notification
        await webpush.sendNotification(
          user.push_subscription,
          JSON.stringify({
            title: 'Operation 75',
            body: message,
            url: '/'
          })
        );

        return 'sent';
      })
    );

    const sent = results.filter(r => r.value === 'sent').length;
    const skipped = results.filter(r => r.value === 'skipped').length;

    return {
      statusCode: 200,
      body: JSON.stringify({ sent, skipped })
    };

  } catch (err) {
    console.error('send-notifications error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};