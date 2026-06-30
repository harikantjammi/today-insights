import Anthropic from '@anthropic-ai/sdk';
import { trimPanchang } from './panchang.js';

const anthropic = new Anthropic();

export async function summarizePanchangInsights(panchang) {
  const { auspicious_period, inauspicious_period, ...panchangForSummary } = trimPanchang(panchang) ?? {};
  const trimmed = { panchang: panchangForSummary };
  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: `You are a helpful assistant that summarizes daily panchang insights.

Rules:
- Base every statement about today strictly on the values present in the input JSON. Do not infer, assume, or add information that is not explicitly in the data.
- If a field is missing, null, or contains an error, do not guess its value — omit it from the summary entirely.
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data, except in the "summary" field, which may include general, well-known knowledge about today's specific value for that component.
- Whenever a time appears in the summary or recommendations, format it in 12-hour AM/PM format (e.g. "6:05 AM"), never 24-hour or ISO format. When referring to a transition time (e.g. when a tithi, nakshatra, yoga, or karana starts or ends), include the weekday name and date along with the time (e.g. "Monday, June 29 at 6:05 AM"), since the transition may fall on a different day than today.
- Do not include any muhurat-related information (auspicious or inauspicious periods) in the summary or recommendations.
- The output must cover each of tithi, vaara, nakshatra, yoga, and karana based on the input data.
- For each component, provide "summary" (states today's exact value for this component, from the input data, gives a precise, specific explanation of its meaning and significance — this may draw on well-known general knowledge beyond the input data — and a precise, specific account of what today's value of this component means for the day, based on the input data; avoid vague or generic statements) and "recommendations" (a list of "text"/"type" entries).
- "summary" must be at most 150 words. Keep it tightly focused on the most important points — do not pad with generic or repetitive statements.
- For each component, populate "recommendations" as thoroughly as possible: include every relevant "do", "avoid", and "warning" item that can reasonably be derived from today's value for that component. Only leave "recommendations" empty if truly nothing applicable can be said.
- "recommendations" is mandatory for every component and must never be cut short or omitted to save space. If the response is at risk of running out of room, shorten "summary" first — never sacrifice "recommendations" content to do so.
- Respond only with the JSON object — no markdown fences, no extra text, no commentary.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: Object.fromEntries(
            ['tithi', 'vaara', 'nakshatra', 'yoga', 'karana'].map((component) => [
              component,
              {
                type: 'object',
                properties: {
                  summary: {
                    type: 'string',
                    description: `States today's exact ${component} (from the input data), gives a precise, specific explanation of its meaning and significance (drawing on well-known general knowledge beyond the input data if needed), and a precise, specific account of what today's ${component} means for the day. Avoid vague or generic statements. At most 150 words, tightly focused on the most important points.`,
                  },
                  recommendations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: {
                          type: 'string',
                          description: 'A short description of the recommendation.',
                        },
                        type: {
                          type: 'string',
                          enum: ['do', 'avoid', 'warning'],
                          description: 'Type of recommendation: "do" for suggested actions, "avoid" for things to skip, "warning" for cautions.',
                        },
                      },
                      required: ['text', 'type'],
                      additionalProperties: false,
                    },
                    description: `Recommendations for today related to ${component}, based strictly on the panchang data. Include as many relevant "do", "avoid", and "warning" items as can reasonably be derived. Only empty if truly nothing applicable can be said.`,
                  },
                },
                required: ['summary', 'recommendations'],
                additionalProperties: false,
              },
            ])
          ),
          required: ['tithi', 'vaara', 'nakshatra', 'yoga', 'karana'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Summarize today's panchang insights:\n\n${JSON.stringify(trimmed)}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content.find((b) => b.type === 'text')?.text;
  const recommendations = JSON.parse(text);
  return { panchang: panchangForSummary, recommendations };
}
