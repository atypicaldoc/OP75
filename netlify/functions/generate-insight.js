// netlify/functions/generate-insight.js
// Generates one AI-observed pattern insight from the user's last 30 checkins.
// Uses claude-haiku — cheap, one call per user per day (frontend caches by date).

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let checkins;
  try {
    ({ checkins } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!checkins || checkins.length < 3) {
    return {
      statusCode: 200,
      body: JSON.stringify({ insight: 'Not enough data yet for a pattern insight.' }),
    };
  }

  // Summarise checkins into a compact text block for the prompt
  const summary = checkins.map(c => {
    const parts = [`Date: ${c.checkin_date}`];
    if (c.workout_done !== null) parts.push(`workout: ${c.workout_done ? 'done' : 'missed'}${c.workout_day ? ' (Day ' + c.workout_day + ')' : ''}`);
    if (c.dinner_time) parts.push(`dinner: ${c.dinner_time}`);
    if (c.walk_done !== null) parts.push(`walk: ${c.walk_done ? 'yes' : 'no'}`);
    if (c.weight_kg) parts.push(`weight: ${c.weight_kg}kg`);
    if (c.energy_level) parts.push(`energy: ${c.energy_level}/10`);
    if (c.pushups_done) parts.push(`pushups: ${c.pushups_done}`);
    return parts.join(', ');
  }).join('\n');

  const prompt = `You are analysing a fitness coaching app user's check-in data. Write exactly ONE sentence — a sharp, specific observation about a pattern you see. 

Rules:
- One sentence only. No preamble. No sign-off.
- Be specific to the actual data, not generic.
- Prioritise patterns that link two variables (e.g. dinner time vs energy, workout days vs walk days).
- Use plain language. No em dashes. No motivational filler.
- Examples of good insights:
  "Your energy is lower on days you eat dinner after 9pm — that's happened 5 of the last 6 times."
  "You've hit every Day A workout but skipped Day C three times in a row."
  "Walk streak is at 4 days, longest run yet."
  "Push-ups are up from 7 to 11 over three weeks."

Check-in data:
${summary}

Write your one-sentence insight now:`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const insight = message.content[0]?.text?.trim() || 'Keep logging — patterns will emerge.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insight }),
    };
  } catch (err) {
    console.error('Insight generation error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Insight generation failed' }),
    };
  }
};
