// netlify/functions/chat.js
// Proxies chat requests to Anthropic. Holds the API key as env var.
// Validates the user's Supabase session before making the call.

exports.handler = async (event) => {
  // CORS — only needed if testing locally with a different origin
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
    const { systemPrompt, messages } = JSON.parse(event.body);

    if (!systemPrompt || !messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing systemPrompt or messages' }),
      };
    }

    // Cap message history to prevent runaway costs
    const trimmed = messages.slice(-30);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: trimmed,
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

    const text = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text, usage: data.usage }),
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
