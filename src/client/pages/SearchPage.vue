<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { searchQuerySchema } from '@shared/schemas';
import SearchForm, { type SearchFormValues } from '../components/SearchForm.vue';
import { fetchMeta, fetchSearch } from '../lib/api';
import { addDays } from '../lib/format';
import { DEFAULT_PRESET } from '../lib/locations';

const route = useRoute();

const metaQuery = useQuery({ queryKey: ['meta'], queryFn: fetchMeta, staleTime: 60_000 });
const meta = computed(() => metaQuery.data.value);

function first(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  const raw = first(value);
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// The URL query is the source of truth for the search. A search "has run" when it holds any
// search parameter, and it is only sent to the server when the shared schema accepts it.
const hasSearch = computed(() => ['q', 'lat', 'lng', 'from', 'to', 'radiusKm'].some((k) => k in route.query));
const parsed = computed(() => searchQuerySchema.safeParse(route.query));
const params = computed(() => (parsed.value.success ? parsed.value.data : undefined));
const urlInvalid = computed(() => hasSearch.value && !parsed.value.success);

// Form values from the URL, with defaults from the server's clock (meta.now), not the browser's.
const initial = computed<SearchFormValues | undefined>(() => {
  const m = meta.value;
  if (!m) return undefined;
  const today = m.now.slice(0, 10);
  const q = route.query;
  return {
    q: first(q.q) ?? '',
    lat: numberOr(q.lat, DEFAULT_PRESET.lat),
    lng: numberOr(q.lng, DEFAULT_PRESET.lng),
    from: first(q.from) ?? today,
    to: first(q.to) ?? addDays(today, 6),
    radiusKm: numberOr(q.radiusKm, m.defaultRadiusKm),
  };
});

// keepPreviousData: the old results stay on screen while a changed search loads.
const searchQuery = useQuery({
  queryKey: computed(() => ['search', params.value] as const),
  queryFn: () => {
    const p = params.value;
    if (!p) throw new Error('Search parameters are not valid');
    return fetchSearch(p);
  },
  enabled: computed(() => params.value !== undefined),
  placeholderData: keepPreviousData,
});
</script>

<template>
  <h1 class="text-xl font-semibold text-slate-900">Find and book a service</h1>

  <p v-if="metaQuery.isPending.value" class="mt-4 text-slate-600" role="status">Loading…</p>

  <div v-else-if="metaQuery.isError.value || !meta || !initial" class="mt-4" role="alert">
    <p class="text-red-700">We couldn’t load the search form.</p>
    <button
      type="button"
      class="mt-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
      @click="metaQuery.refetch()"
    >
      Retry
    </button>
  </div>

  <template v-else>
    <SearchForm class="mt-4" :meta="meta" :initial="initial" :validate-on-mount="urlInvalid" />

    <p v-if="!hasSearch" class="mt-6 text-slate-600">Try “massage” near Medborgarplatsen.</p>

    <!-- Results arrive in task 3.2. Until then, a plain status line shows that the search ran. -->
    <div v-else-if="params" class="mt-6 text-slate-700" aria-live="polite">
      <p v-if="searchQuery.isError.value" role="alert" class="text-red-700">The search failed. Please try again.</p>
      <p v-else-if="searchQuery.data.value">
        {{ searchQuery.data.value.results.length }} results
      </p>
      <p v-else>Searching…</p>
    </div>
  </template>
</template>
