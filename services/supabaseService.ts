
// src/lib/inspectionStorage.ts
import { createClient, User } from '@supabase/supabase-js';
import type { InspectionProfile } from '../types';

// ---------------------------------------------------------------------
// SUPABASE CONFIGURATION
// ---------------------------------------------------------------------
// PASTE YOUR KEYS INSIDE THE QUOTES BELOW
const SUPABASE_URL = 'https://slyvxojshmliackrshym.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNseXZ4b2pzaG1saWFja3JzaHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzODk0MzUsImV4cCI6MjA2Mzk2NTQzNX0.ZP5oLyJYTOhlLcjqWot3A527g9uvwgCnOR5irQAozDc';

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabase) {
  console.warn('Supabase keys are missing in services/supabaseService.ts. App is using LocalStorage.');
}

// ---------------------------------------------------------------------
// LOCAL STORAGE HELPERS
// ---------------------------------------------------------------------

const LOCAL_KEY = 'chrp_inspections';

const safeGetLocalStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.warn('LocalStorage set failed:', e);
  }
};

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const generateShortId = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ---------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------

export const authService = {
  signUp: async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },
  
  signIn: async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  getCurrentUser: async (): Promise<User | null> => {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
};

// ---------------------------------------------------------------------
// SAVE REPORT
// ---------------------------------------------------------------------

export const saveReportToSupabase = async (
  inspection: InspectionProfile
): Promise<{ uuid: string; shortId: string }> => {
  const uuid = inspection.savedReportId || generateUUID();
  const shortId = inspection.shortId || generateShortId();

  // Get current user if logged in
  let userId = inspection.userId;
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  }

  const payload: InspectionProfile = {
    ...inspection,
    savedReportId: uuid,
    shortId: shortId,
    userId: userId
  };

  // 1) Always back up to localStorage (Safety net)
  try {
    const existing = safeGetLocalStorage(LOCAL_KEY);
    const map = existing ? JSON.parse(existing) : {};
    map[uuid] = { id: uuid, data: payload, created_at: new Date().toISOString() };
    safeSetLocalStorage(LOCAL_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Local backup failed:', e);
  }

  // 2) Try Supabase (if configured)
  if (!supabase) {
    console.log("Supabase not configured, saved locally.");
    return { uuid, shortId };
  }

  try {
    const dbPayload: any = {
        id: uuid,
        short_id: shortId,
        data: payload,
        created_at: new Date().toISOString(),
    };

    if (userId) {
        dbPayload.user_id = userId;
    }

    const { data, error } = await supabase
      .from('inspections')
      .upsert(dbPayload, { onConflict: 'id' })
      .select('id, short_id')
      .single();

    if (error) {
      // Expanded error logging to see the actual issue in Console
      console.error('Supabase error details:', JSON.stringify(error, null, 2));

      if (error.code === '42501') {
        alert("Warning: Permission denied. If you are not logged in, you can only save new reports. Log in to update existing ones. (Report saved locally)");
        return { uuid, shortId };
      }
      
      if (error.code === '42P01') {
        alert("Warning: Table 'inspections' does not exist. Please run SQL setup. Report saved locally.");
        return { uuid, shortId };
      }

      if (error.code === 'PGRST204') {
        alert("Warning: Schema mismatch (missing column). Please run SQL setup. Report saved locally.");
        return { uuid, shortId };
      }

      throw new Error(`Supabase Error ${error.code}: ${error.message}`);
    }

    return { uuid: data?.id || uuid, shortId: data?.short_id || shortId };
  } catch (err: any) {
    console.error('Save execution failed:', err);
    throw new Error(err?.message || 'Failed to save inspection to cloud.');
  }
};

// ---------------------------------------------------------------------
// LOAD REPORT
// ---------------------------------------------------------------------

export const loadReportFromSupabase = async (
  idOrShortId: string
): Promise<InspectionProfile | null> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrShortId);

  // 1) Try Supabase
  if (supabase) {
    try {
      let query = supabase.from('inspections').select('data, id, short_id, user_id');
      
      if (isUuid) {
        query = query.eq('id', idOrShortId);
      } else {
        query = query.eq('short_id', idOrShortId);
      }

      const { data, error } = await query.single();

      if (error) {
         console.warn("Supabase load error:", JSON.stringify(error, null, 2));
      }

      if (!error && data && data.data) {
        const profile = data.data as InspectionProfile;
        profile.savedReportId = data.id;
        profile.shortId = data.short_id;
        profile.userId = data.user_id;
        return profile;
      }
    } catch (err) {
      console.warn('Supabase load exception:', err);
    }
  }

  // 2) Fallback: localStorage
  try {
    console.log("Falling back to local storage for load...");
    const existing = safeGetLocalStorage(LOCAL_KEY);
    if (!existing) return null;

    const map = JSON.parse(existing);
    
    // If UUID, direct lookup
    if (isUuid && map[idOrShortId]) {
      const record = map[idOrShortId];
      const stored = (record.data || record.report_data) as InspectionProfile;
      stored.savedReportId = idOrShortId;
      return stored;
    }

    // If Short ID, iterate to find
    if (!isUuid) {
      const found = Object.values(map).find((record: any) => {
        const p = record.data as InspectionProfile;
        return p?.shortId === idOrShortId;
      }) as any;
      
      if (found && found.data) {
        return found.data as InspectionProfile;
      }
    }

    return null;
  } catch (e) {
    console.error('LocalStorage load error:', e);
    return null;
  }
};
