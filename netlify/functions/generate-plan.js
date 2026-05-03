// netlify/functions/generate-plan.js
// Generates a personalised 3-day workout plan based on user's equipment and goals.
// Called once during onboarding. Result stored in profiles.workout_plan as JSONB.

const PLAN_PROMPT = `You are a fitness coach generating a personalised 3-day workout plan.

You will receive a user's equipment list, goals, current fitness level, and any relevant constraints.

Output ONLY a valid JSON object. No preamble. No explanation. No code fences. Just the JSON.

The JSON must follow this exact structure:

{
  "frequency": "3 sessions per week, alternate days",
  "duration": "30 minutes per session",
  "days": [
    {
      "label": "DAY A",
      "title": "Push",
      "subtitle": "Chest, shoulders, triceps",
      "exercises": [
        { "name": "Exercise Name", "sets": 3, "reps": "12", "rest": "45 sec" }
      ]
    },
    {
      "label": "DAY B",
      "title": "Pull",
      "subtitle": "Back, biceps, rear delts",
      "exercises": [...]
    },
    {
      "label": "DAY C",
      "title": "Legs and Core",
      "subtitle": "Glutes, quads, abs",
      "exercises": [...]
    }
  ],
  "daily": [
    "Push-ups: max reps, add 1 every 3 days",
    "Dead hangs: 3 x 30 seconds",
    "10-min walk after dinner",
    "Dinner before 8pm"
  ]
}

Rules:
- Use ONLY equipment the user has listed. If they have no cable machine, use no cable exercises.
- 5 exercises per day, matching the push/pull/legs split.
- Sets: always 3. Reps: 8-20 depending on exercise type. Rest: 30-45 sec.
- Adapt daily non-negotiables to the user's goals. Keep dinner and walk if relevant. Add pull-up progressions if they want pull-ups.
- Output valid JSON only. No trailing commas. No comments.`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { answers } = JSON.parse(event.body);

    if (!answers) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing answers' }),
      };
    }

    const equipment = Array.isArray(answers.equipment)
      ? answers.equipment.join(', ')
      : answers.equipment || 'bodyweight only';

    const userMessage = `Equipment: ${equipment}
Goals: ${answers.primary_goals || 'general fitness'}
Current fitness: ${answers.starting_point || 'beginner'}
Main obstacle: ${answers.main_obstacle || 'none specified'}
Diet: ${answers.diet_type || 'not specified'}

Generate the workout plan JSON now.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: PLAN_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' }),
      };
    }

    const raw = data.content?.[0]?.text?.trim() || '';

    // Strip code fences if model ignored instructions
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let plan;
    try {
      plan = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse failed:', clean);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Plan generation returned invalid JSON', raw: clean }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ plan, usage: data.usage }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal error' }),
    };
  }
};
