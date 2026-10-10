import { sb } from './supabase.js';

// Dropdown lists that live in the database, so a new team or research area appears in the forms
// without a code change. A field names its list with optionsFrom: 'teams' | 'research_areas' | 'mentee_programs'.
// Row-level security lets any signed-in user read these tables.
export async function loadLookups() {
  const [t, r, m] = await Promise.all([
    sb.from('teams').select('id,name').order('sort_order').order('name'),
    sb.from('research_areas').select('name,slug').order('sort_order'),
    sb.from('mentee_programs').select('name').order('sort_order'),
  ]);
  return {
    teams: (t.data || []).map((x) => ({ value: x.id, label: x.name })),
    research_areas: (r.data || []).map((x) => ({ value: x.slug, label: x.name })),
    mentee_programs: (m.data || []).map((x) => x.name),
    failed: !!(t.error || r.error || m.error),
  };
}

// Fills each optionsFrom field with its list. A field keeps its own fallback options when the database returns nothing.
export function resolveOptions(fields, lookups) {
  return fields.map((f) => {
    if (!f.optionsFrom) return f;
    const list = lookups[f.optionsFrom];
    return list && list.length ? { ...f, options: list } : { ...f, options: f.options || [] };
  });
}
