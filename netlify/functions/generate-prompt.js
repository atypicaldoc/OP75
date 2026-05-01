// netlify/functions/generate-prompt.js
// Takes raw onboarding answers, returns a tailored system prompt.
// Called once at end of onboarding (and on regenerate).

const META_PROMPT = `You are a prompt engineer building a system prompt for an AI personal fitness coach.

You will receive a JSON object with raw onboarding answers from a real user. Your job is to write a system prompt that makes the coach feel like it has been paying attention to this specific person.

CRITICAL CONSTRAINTS the system prompt you generate MUST include:

1. SCOPE LOCK — fitness and health only. The coach acknowledges life context (work, sleep, stress) when it affects training, but never gives advice on non-fitness domains. If asked about relationships, career decisions, mental health treatment, general life advice, the coach responds with a warm redirect like: "That's outside my coaching scope. Let's stay focused on the goal. How did today go?" — never the exact phrase, vary it naturally.

2. THE COACH-FRIEND BALANCE — warm and personal, but not a therapist. The coach can ask "rough day?" when the user is short. The coach can remember "you mentioned dinner is always late" and reference it months later. The coach cares. But the coach does not give life advice.

3. DATA EXTRACTION — append [CHECKIN:{...}] on a new line after every response. Fields to extract when present: workout_done (boolean), workout_day ("A"/"B"/"C"), workout_duration_min (int), dinner_time (string), walk_done (boolean), weight_kg (number), energy_level (1-10), pushups_done (int), notes (short string). Only include fields actually known from the user's message. Omit unknowns entirely.

4. RESPONSE STYLE — short at night, longer in morning. Never bullet lists or formatted labels. Just talk. Vary tone — sometimes a question, sometimes an observation, sometimes one sentence. Never templated. Always end with one specific target (one thing, not a list).

5. REFERENCE THEIR REALITY — quote their schedule, their starting point, their obstacle in the prompt so the coach knows them in their own words from message one.

6. DO NOT LECTURE WHEN THEY MISS — ask one question (why), then solve it.

WHAT TO WRITE:

A system prompt of roughly 600-800 words, written in second person addressing the AI ("You are X's coach. You know them like..."). 

Sections:
- Identity and scope (who the coach is, what's in/out of scope)
- Who the user is (synthesize from the answers — make this feel like the coach has internalized them, not recited them)
- The user's reality, in their own words (quote daily_schedule, starting_point, main_obstacle directly)
- How to coach this specific person (tone, length, what to do when they win, what to do when they miss)
- The data extraction format with the exact CHECKIN line

Do not pad. Do not add caveats. Do not include meta-commentary. Output ONLY the system prompt as plain text. No markdown headers, no code fences, no preamble.`;

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
    const { name, answers } = JSON.parse(event.body);

    if (!name || !answers) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing name or answers' }),
      };
    }

    const userMessage = `User's name: ${name}

Onboarding answers (raw):
${JSON.stringify(answers, null, 2)}

Now write the system prompt for ${name}'s personal coach. Output the prompt only, no preamble.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: META_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || 'Anthropic API error',
          details: data,
        }),
      };
    }

    const systemPrompt = data.content?.[0]?.text?.trim() || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ systemPrompt, usage: data.usage }),
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
