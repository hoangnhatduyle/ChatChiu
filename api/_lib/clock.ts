import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TIMEZONE, defaultPreferences, type Preferences } from '@chatchiu/contracts';
import { localHourInTimeZone, todayInTimeZone } from '@chatchiu/domain';
import { ApiError } from './errors.js';
import { mapPreferences, type PreferencesRow } from './preferences.js';

export interface UserClock {
  timezone: string;
  /** Her calendar date now (YYYY-MM-DD), CS-DAY-MATHS. */
  today: string;
  hour: number;
  preferences: Preferences;
  /** False when she has no user_preferences row yet (defaults in use). */
  stored: boolean;
}

/**
 * Her preferences (RLS-bound client) and "today" in her timezone. With no row,
 * the device-supplied zone (?tz=, already validated) or UTC is used.
 */
export async function userClock(
  client: SupabaseClient,
  deviceTimeZone?: string,
  now: Date = new Date(),
): Promise<UserClock> {
  const { data, error } = await client.from('user_preferences').select('*').maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Failed to load preferences', error);
  const preferences = data
    ? mapPreferences(data as PreferencesRow)
    : defaultPreferences(deviceTimeZone ?? DEFAULT_TIMEZONE);
  return {
    timezone: preferences.timezone,
    today: todayInTimeZone(preferences.timezone, now),
    hour: localHourInTimeZone(preferences.timezone, now),
    preferences,
    stored: data != null,
  };
}
