import { fetchSunAndMoonDetails } from './astronomy.js';
import { getUpcomingCalendar } from './calendar.js';
import { getPanchang } from './panchang.js';
import { summarizeInsights, summarizePanchangInsights } from './summarize.js';
import { lookupCache, saveCache } from './cache.js';

export default async ({ req, res, log, error }) => {
  if (req.path === '/ping') {
    return res.text('Pong');
  }

  if (req.path === '/today-insights') {
    const { city, date, latitude, longitude, state, tz } = req.query;

    if (!city || !date || !latitude || !longitude || !state || !tz) {
      return res.json({ error: 'Missing required query params: city, date, latitude, longitude, state, tz' }, 400);
    }

    const [dateStr] = date.split('T');

    const cachedSummary = await lookupCache({ documentType: 'today-insights', city, dateStr, latitude, longitude, state, tz });

    const [astronomyResult, panchangResult, calendarResult] = await Promise.allSettled([
      fetchSunAndMoonDetails({ cityTz: tz, cityName: city, cityState: state, dateStr }),
      getPanchang({ longitude, latitude, date }),
      getUpcomingCalendar({ dateStr }),
    ]);

    const toValue = (result) =>
      result.status === 'fulfilled' ? result.value : { error: result.reason?.message };

    const response = {
      astronomy: toValue(astronomyResult),
      calendar: toValue(calendarResult),
      panchang: toValue(panchangResult),
    };

    if (cachedSummary) {
      log(`Cache hit for ${city}, ${state} on ${dateStr}`);
      response.summary = cachedSummary;
    } else {
      try {
        response.summary = await summarizeInsights(response);
      } catch (err) {
        error('Failed to summarize insights: ' + err.message);
        response.summary = { error: err.message };
      }

      if (!response.summary?.error) {
        try {
          await saveCache({ documentType: 'today-insights', city, dateStr, latitude, longitude, state, tz, summary: response.summary });
          log(`Cached summary for ${city}, ${state} on ${dateStr}`);
        } catch (err) {
          error('Failed to cache insights: ' + err.message);
        }
      }
    }

    log(`Fetched today-insights for ${city}, ${state} on ${date}`);
    return res.json(response.summary);
  }

  if (req.path === '/panchang-insights') {
    const { city, date, latitude, longitude, state, tz } = req.query;

    if (!city || !date || !latitude || !longitude || !state || !tz) {
      return res.json({ error: 'Missing required query params: city, date, latitude, longitude, state, tz' }, 400);
    }

    const [dateStr] = date.split('T');

    const cachedSummary = await lookupCache({ documentType: 'panchang-insights', city, dateStr, latitude, longitude, state, tz });

    if (cachedSummary) {
      log(`Cache hit for panchang ${city}, ${state} on ${dateStr}`);
      return res.json(cachedSummary);
    }

    let panchang;
    try {
      panchang = await getPanchang({ longitude, latitude, date });
    } catch (err) {
      error('Failed to fetch panchang: ' + err.message);
      return res.json({ error: err.message }, 502);
    }

    let summary;
    try {
      summary = await summarizePanchangInsights(panchang);
    } catch (err) {
      error('Failed to summarize panchang insights: ' + err.message);
      return res.json({ error: err.message }, 500);
    }

    try {
      await saveCache({ documentType: 'panchang-insights', city, dateStr, latitude, longitude, state, tz, summary });
      log(`Cached panchang summary for ${city}, ${state} on ${dateStr}`);
    } catch (err) {
      error('Failed to cache panchang insights: ' + err.message);
    }

    log(`Fetched panchang-insights for ${city}, ${state} on ${date}`);
    return res.json(summary);
  }

  return res.json({ error: 'Not found' }, 404);
};
