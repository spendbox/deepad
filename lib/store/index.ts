import 'server-only';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { Store } from './types';

let store: Store | null = null;

/**
 * The live site always uses Supabase. A developer's own computer can run
 * without it, using a throwaway in-memory store.
 */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = new SupabaseStore(url, key);
  } else if (process.env.NODE_ENV !== 'production' || process.env.DASHPAD_ALLOW_MEMORY_STORE === '1') {
    store = new MemoryStore();
  } else {
    throw new Error('Supabase is not connected: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  }
  return store;
}
