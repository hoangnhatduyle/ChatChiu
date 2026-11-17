import { defaultPreferences } from '@chatchiu/contracts';
import { authedHandler, assertMethod } from '../_lib/handler.js';
import { ApiError } from '../_lib/errors.js';
import { parseBody, parseQuery } from '../_lib/validation.js';
import { preferencesQuery, preferencesUpdate } from '../_lib/schemas.js';
import { toSnake } from '../_lib/mappers.js';
import { mapPreferences, type PreferencesRow } from '../_lib/preferences.js';

// GET   /api/preferences[?tz=] — her row, or defaults (the device zone when valid,
//                                 else UTC) without writing anything (AC-API-17)
// PATCH /api/preferences { … } — changes only the fields sent; creates the row on
//                                 first save (column defaults fill the rest)
export default authedHandler(async ({ user, client }, req) => {
  const method = assertMethod(req, ['GET', 'PATCH']);

  if (method === 'GET') {
    const { tz } = parseQuery(req, preferencesQuery);
    const { data, error } = await client.from('user_preferences').select('*').maybeSingle();
    if (error) throw new ApiError('INTERNAL', 'Failed to load preferences', error);
    return data ? mapPreferences(data as PreferencesRow) : defaultPreferences(tz);
  }

  const body = parseBody(req, preferencesUpdate);
  if (Object.keys(body).length === 0) throw new ApiError('BAD_REQUEST', 'No fields to update');
  const { data, error } = await client
    .from('user_preferences')
    .upsert({ user_id: user.id, ...toSnake(body) }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) {
    if (error.code === '22023' || error.code === '23514') {
      throw new ApiError('BAD_REQUEST', 'Invalid preferences', error);
    }
    throw new ApiError('INTERNAL', 'Failed to save preferences', error);
  }
  return mapPreferences(data as PreferencesRow);
});
