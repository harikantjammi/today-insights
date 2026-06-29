import { getPanchang } from './panchang.js';
import { summarizePanchangInsights } from './summarize.js';
import { lookupCache, saveCache } from './cache.js';

export default async ({ req, res, log, error }) => {
  if (req.path === '/ping') {
    return res.text('Pong');
  }

  if (req.path === '/panchang-insights') {
    const { date, latitude, longitude } = req.query;

    if (!date || !latitude || !longitude) {
      return res.json({ error: 'Missing required query params: date, latitude, longitude' }, 400);
    }

    const [dateStr] = date.split('T');

    const cachedSummary = await lookupCache({ documentType: 'panchang-insights', dateStr, latitude, longitude });

    if (cachedSummary) {
      log(`Cache hit for panchang at ${latitude},${longitude} on ${dateStr}`);
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
      await saveCache({ documentType: 'panchang-insights', dateStr, latitude, longitude, summary });
      log(`Cached panchang summary at ${latitude},${longitude} on ${dateStr}`);
    } catch (err) {
      error('Failed to cache panchang insights: ' + err.message);
    }

    log(`Fetched panchang-insights at ${latitude},${longitude} on ${date}`);
    return res.json(summary);
  }

  return res.json({ error: 'Not found' }, 404);
};
