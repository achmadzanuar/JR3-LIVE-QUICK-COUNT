import {createResultsService, sourceMode, publicSourceError} from '../lib/source.js';
const getResults = createResultsService();

export function createResultsHandler(service = getResults, env = process.env, now = Date.now) {
  return async function handle(request) {
    const headers = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
    if (request.method !== 'GET') return Response.json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Metode tidak tersedia.'}}, {status:405,headers:{...headers,Allow:'GET','Cache-Control':'no-store'}});
    try {
      const result = await service();
      // CDN and instance cache share the same five-second freshness budget.
      const remaining = Math.max(0,Math.floor((5000 - (now() - Date.parse(result.readAt))) / 1000));
      headers['Cache-Control'] = remaining > 0 ? 'public, max-age=0, s-maxage=' + remaining + ', must-revalidate' : 'no-store';
      return Response.json(result, {headers});
    } catch (error) {
      return Response.json({ok:false,mode:sourceMode(env),error:publicSourceError(error)}, {status:503,headers:{...headers,'Cache-Control':'no-store','Retry-After':'10'}});
    }
  };
}

export default { fetch: createResultsHandler() };
