// netlify/functions/generate-coupons.js
// Generates coupon codes and inserts them into the coupons table.
// Protected by COUPON_ADMIN_SECRET env variable — requests without it are rejected.
//
// POST body: { secret: string, count?: number, duration_days?: number }
// Returns: { codes: string[], sql: string }

const { createClient } = require('@supabase/supabase-js');

const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0,O,1,I,L

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function generateCode() {
  return 'MD-' + Array.from({ length: 4 }, randomChar).join('');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { secret, count = 1, duration_days = 30 } = JSON.parse(event.body || '{}');

    if (!secret || secret !== process.env.COUPON_ADMIN_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const safeCount = Math.min(Math.max(1, parseInt(count) || 1), 20);
    const safeDays = Math.min(Math.max(1, parseInt(duration_days) || 30), 365);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Generate codes, retry on collision (extremely unlikely but handled)
    const codes = [];
    let attempts = 0;
    while (codes.length < safeCount && attempts < safeCount * 5) {
      attempts++;
      const code = generateCode();
      const { error } = await supabase
        .from('coupons')
        .insert({ code, duration_days: safeDays });
      if (!error) codes.push(code);
      // If error is a unique violation, just try again with a new code
    }

    if (codes.length === 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to generate codes' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ codes, duration_days: safeDays }),
    };

  } catch (err) {
    console.error('generate-coupons error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
