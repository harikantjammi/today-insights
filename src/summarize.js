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
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are a helpful assistant that summarizes daily panchang insights.

Rules:
- Base every statement strictly on the values present in the input JSON. Do not infer, assume, or add information that is not explicitly in the data.
- If a field is missing, null, or contains an error, do not guess its value — omit it from the summary entirely.
- Do not reference cultural, religious, or astrological beliefs beyond what is directly stated in the input data.
- Whenever a time appears in the summary or recommendations, format it in 12-hour AM/PM format (e.g. "6:05 AM"), never 24-hour or ISO format.
- Do not include any muhurat-related information (auspicious or inauspicious periods) in the summary or recommendations.
- The summary must cover each of tithi, vaara, nakshatra, yoga, and karana based on the input data.
- Each recommendation must be tied to one of tithi, vaara, nakshatra, yoga, or karana via the "component" field, and have a "text" field and a "type" field indicating the nature of the recommendation.
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
            summary: {
              type: 'object',
              properties: {
                tithi: {
                  type: 'string',
                  description: 'Short summary of today\'s tithi based on the input data.',
                },
                vaara: {
                  type: 'string',
                  description: 'Short summary of today\'s vaara (weekday) based on the input data.',
                },
                nakshatra: {
                  type: 'string',
                  description: 'Short summary of today\'s nakshatra(s) based on the input data.',
                },
                yoga: {
                  type: 'string',
                  description: 'Short summary of today\'s yoga(s) based on the input data.',
                },
                karana: {
                  type: 'string',
                  description: 'Short summary of today\'s karana(s) based on the input data.',
                },
              },
              required: ['tithi', 'vaara', 'nakshatra', 'yoga', 'karana'],
              additionalProperties: false,
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  component: {
                    type: 'string',
                    enum: ['tithi', 'vaara', 'nakshatra', 'yoga', 'karana'],
                    description: 'The panchang component this recommendation relates to.',
                  },
                  text: {
                    type: 'string',
                    description: 'A short description of the recommendation.',
                  },
                  type: {
                    type: 'string',
                    enum: ['do', 'avoid', 'warning', 'info'],
                    description: 'Type of recommendation: "do" for suggested actions, "avoid" for things to skip, "warning" for cautions, "info" for neutral observations.',
                  },
                },
                required: ['component', 'text', 'type'],
                additionalProperties: false,
              },
              description: 'Recommendations for today, each tied to a specific panchang component (tithi, vaara, nakshatra, yoga, or karana) and based strictly on the panchang data.',
            },
          },
          required: ['summary', 'recommendations'],
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
  return JSON.parse(text);
}
