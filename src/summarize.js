import Anthropic from '@anthropic-ai/sdk';
import { trimPanchang } from './panchang.js';

const anthropic = new Anthropic();

function trimForSummarization({ astronomy, calendar, panchang }) {
  const astro = astronomy?.astronomy?.astro;
  const trimmedAstronomy = astro
    ? {
        sunrise: astro.sunrise,
        sunset: astro.sunset,
        moonrise: astro.moonrise,
        moonset: astro.moonset,
        moon_phase: astro.moon_phase,
        moon_illumination: astro.moon_illumination,
      }
    : astronomy;

  return { astronomy: trimmedAstronomy, calendar, panchang: trimPanchang(panchang) };
}

export async function summarizeInsights(data) {
  const trimmed = trimForSummarization(data);
  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are a helpful assistant that summarizes daily astronomical, panchang, and calendar insights.

Rules:
- Base every statement strictly on the values present in the input JSON. Do not infer, assume, or add information that is not explicitly in the data.
- If a field is missing, null, or contains an error, do not guess its value — omit it from the summary entirely.
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data.
- For recommendations: only generate festival-based recommendations for Hindu festivals. Ignore all non-Hindu festivals (e.g. Christmas, Easter, Eid, etc.).
- Do NOT include recommendations about upcoming holidays or future dates — only today.
- If today has a Hindu festival, you may add a recommendation relevant to that festival.
- Each recommendation must have a "text" field and a "type" field indicating the nature of the recommendation.
- Respond only with the JSON object — no markdown fences, no extra text, no commentary.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            dayRating: {
              type: 'string',
              enum: ['excellent', 'good', 'neutral', 'bad'],
              description: 'Rate the day using only the calendar[0].festival field (Hindu festivals only) and panchang data. Use "excellent" if today has more than one Hindu festival. Use "good" if today has exactly one Hindu festival, or if there are auspicious muhurats/favorable panchang with no dominant inauspicious periods. Use "neutral" if there are no festivals and auspicious/inauspicious factors are balanced. Use "bad" if inauspicious periods dominate with no festivals.',
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'The recommendation text.',
                  },
                  type: {
                    type: 'string',
                    enum: ['do', 'avoid', 'warning', 'info', 'festival'],
                    description: 'Type of recommendation: "do" for suggested actions, "avoid" for things to skip, "warning" for cautions, "info" for neutral observations, "festival" for Hindu festival-specific guidance.',
                  },
                },
                required: ['text', 'type'],
                additionalProperties: false,
              },
              description: 'Recommendations for today only, based strictly on panchang and today\'s Hindu festivals. Do not include upcoming holidays or future dates.',
            },
          },
          required: ['dayRating', 'recommendations'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Summarize today's insights:\n\n${JSON.stringify(trimmed)}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(text);
}

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
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data, except in the "information" field, which may include general, well-known knowledge about today's specific value for that component.
- Whenever a time appears in the summary or recommendations, format it in 12-hour AM/PM format (e.g. "6:05 AM"), never 24-hour or ISO format. When referring to a transition time (e.g. when a tithi, nakshatra, yoga, or karana starts or ends), include the weekday name and date along with the time (e.g. "Monday, June 29 at 6:05 AM"), since the transition may fall on a different day than today.
- Do not include any muhurat-related information (auspicious or inauspicious periods) in the summary or recommendations.
- The output must cover each of tithi, vaara, nakshatra, yoga, and karana based on the input data.
- For each component, provide "information" (states today's exact value for this component, from the input data, and gives a precise, specific explanation of its meaning and significance — this may draw on well-known general knowledge beyond the input data), a "summary" (a precise, specific account of what today's value of this component means for the day, based on the input data — avoid vague or generic statements), and "recommendations" (a list of "text"/"type" entries).
- "information" and "summary" must each be at most 50 words. Keep them tightly focused on the single most important point — do not pad with generic or repetitive statements.
- For each component, populate "recommendations" as thoroughly as possible: include every relevant "do", "avoid", and "warning" item that can reasonably be derived from today's value for that component. Only leave "recommendations" empty if truly nothing applicable can be said.
- "recommendations" is mandatory for every component and must never be cut short or omitted to save space. If the response is at risk of running out of room, shorten "information" and "summary" first — never sacrifice "recommendations" content to do so.
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
                  information: {
                    type: 'string',
                    description: `States today's exact ${component} (from the input data) and gives a precise, specific explanation of its meaning and significance, drawing on well-known general knowledge beyond the input data if needed. At most 50 words, tightly focused on the single most important point.`,
                  },
                  summary: {
                    type: 'string',
                    description: `Precise, specific account of what today's ${component} means for the day, based on the input data. Avoid vague or generic statements. At most 50 words, tightly focused on the single most important point.`,
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
                required: ['information', 'summary', 'recommendations'],
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
