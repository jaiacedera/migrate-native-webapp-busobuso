import OpenAI from 'openai';

const GITHUB_TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN;
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference';
const GITHUB_MODEL = 'openai/gpt-4.1';

const openai = new OpenAI({
  baseURL: GITHUB_MODELS_ENDPOINT,
  apiKey: GITHUB_TOKEN,
  dangerouslyAllowBrowser: true,
});

const SYSTEM_PROMPT =
  'You are Buso-Buso Assistant. Be concise, calm, and helpful for emergency preparedness and incident reporting.';

export async function sendChatbotMessage(userMessage: string): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error('Missing EXPO_PUBLIC_GITHUB_TOKEN in .env');
  }

  try {
    const completion = await openai.chat.completions.create({
      model: GITHUB_MODEL,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      top_p: 1,
    });

    const content = completion.choices?.[0]?.message?.content?.trim();
    if (content) {
      return content;
    }

    throw new Error('GitHub Models returned an empty response.');
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`GitHub Models request failed: ${details}`);
  }
}