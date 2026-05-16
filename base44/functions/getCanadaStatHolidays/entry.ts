import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { startDate, endDate } = await req.json();
  if (!startDate || !endDate) {
    return Response.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Search the internet and return a list of all Canadian statutory (stat) holidays that fall between ${startDate} and ${endDate} inclusive. Include both federal holidays and provincial holidays for all provinces. For each holiday, return the date (in YYYY-MM-DD format), the holiday name, and which provinces/territories observe it (or "Federal" if it's a federal holiday observed nationwide). Only return holidays that actually fall within the date range ${startDate} to ${endDate}.`,
    add_context_from_internet: true,
    response_json_schema: {
      type: 'object',
      properties: {
        holidays: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              name: { type: 'string' },
              provinces: { type: 'string' }
            }
          }
        }
      }
    }
  });

  return Response.json({ holidays: result.holidays || [] });
});