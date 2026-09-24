import 'server-only';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { Store } from './types';

let store: Store | null = null;

/** Supabase when its keys are set, otherwise the practice (memory) store. */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? new SupabaseStore(url, key) : new MemoryStore();
  return store;
}
