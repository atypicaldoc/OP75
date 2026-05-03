// netlify/functions/redeem-coupon.js
// Validates a coupon code, marks it used, and extends access_expires_at on the profile.
// Uses service role key to bypass RLS on the coupons table.
// Coupon format: MD + 4 non-ambiguous chars (e.g. MD-K7X2).
// Access stacks: if user still has time left, we add 30 days to their current expiry.
// If expired or null, we add 30 days from now. History is never lost.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { code, userId } = JSON.parse(event.body);

    if (!code || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing code or userId' }) };
    }

    const normalised = code.trim().toUpperCase();

    // Service role client — can read/write coupons table and update profiles bypassing RLS
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Look up the coupon
    const { data: coupon, error: fetchError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', normalised)
      .single();

    if (fetchError || !coupon) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid code. Check and try again.' }) };
    }

    if (coupon.used) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'This code has already been used.' }) };
    }

    // Fetch current profile to check existing expiry
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('access_expires_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'User profile not found.' }) };
    }

    // Stack access: extend from current expiry if still valid, otherwise from now
    const now = new Date();
    const currentExpiry = profile.access_expires_at ? new Date(profile.access_expires_at) : null;
    const base = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
    const durationDays = coupon.duration_days || 30;
    const newExpiry = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Mark coupon used
    const { error: couponUpdateError } = await supabase
      .from('coupons')
      .update({ used: true, used_by: userId, used_at: now.toISOString() })
      .eq('id', coupon.id);

    if (couponUpdateError) {
      console.error('Coupon update error:', couponUpdateError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to redeem code. Try again.' }) };
    }

    // Update profile expiry
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ access_expires_at: newExpiry.toISOString() })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Code accepted but could not update access. Contact MD.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        access_expires_at: newExpiry.toISOString(),
        days_added: durationDays,
      }),
    };

  } catch (err) {
    console.error('redeem-coupon error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
