<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { searchQuerySchema, type SearchResult } from '@shared/schemas';
import SearchForm, { type SearchFormValues } from '../components/SearchForm.vue';
import { fetchMeta, fetchSearch } from '../lib/api';
import BookingDialog from '../components/BookingDialog.vue';
import ResultCard from '../components/ResultCard.vue';
import ResultSkeleton from '../components/ResultSkeleton.vue';
import ResultsEmpty from '../components/ResultsEmpty.vue';
import ResultsError from '../components/ResultsError.vue';
import type { SlotSelection } from '../components/SlotPicker.vue';
import { addDays, epochOf } from '../lib/format';
import { DEFAULT_PRESET, findPreset } from '../lib/locations';

const route = useRoute();
const router = useRouter();

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

// --- Results ---

type SortKey = 'distance' | 'earliest' | 'price';
const sortKey = ref<SortKey>('distance');

const sortedResults = computed(() => {
  const results = [...(searchQuery.data.value?.results ?? [])];
  const byDistance = (a: SearchResult, b: SearchResult) =>
    a.distanceMeters - b.distanceMeters || a.service.id - b.service.id;
  if (sortKey.value === 'price') {
    return results.sort((a, b) => a.service.priceSek - b.service.priceSek || byDistance(a, b));
  }
  if (sortKey.value === 'earliest') {
    // Compare instants, not strings. Results with no free time go last.
    const at = (r: SearchResult) => (r.nextAvailable ? epochOf(r.nextAvailable.start) : Infinity);
    return results.sort((a, b) => {
      const d = at(a) - at(b);
      return d === 0 || Number.isNaN(d) ? byDistance(a, b) : d;
    });
  }
  return results.sort(byDistance);
});

// What was searched, from the query the server applied (after clamping).
const headline = computed(() => {
  const data = searchQuery.data.value;
  if (!data) return '';
  const { q, radiusKm, lat, lng } = data.query;
  const n = data.results.length;
  const place = findPreset(lat, lng)?.name ?? 'your location';
  return `${n} ${n === 1 ? 'result' : 'results'} for ‘${q}’ within ${radiusKm} km of ${place}`;
});

const announcement = computed(() => {
  if (!params.value || searchQuery.isError.value) return '';
  if (searchQuery.isPending.value) return 'Loading results…';
  if (searchQuery.isPlaceholderData.value) return 'Updating results…';
  return headline.value;
});

const today = computed(() => meta.value?.now.slice(0, 10) ?? '');
const canWiden = computed(() => (params.value?.radiusKm ?? 50) < 50);
const canNext7 = computed(
  () => !!params.value && (params.value.from !== today.value || params.value.to !== addDays(today.value, 6)),
);

function updateQuery(changes: Record<string, string>) {
  void router.push({ path: '/', query: { ...route.query, ...changes } });
}

// The booking dialog exists only while a slot is selected, so each opening is a fresh dialog.
const selection = ref<SlotSelection | null>(null);

function onSelect(next: SlotSelection) {
  selection.value = next;
}
</script>

<template>
  <h1 class="text-xl font-semibold text-slate-900">Find and book a service</h1>

  <p v-if="metaQuery.isPending.value" class="mt-4 text-slate-600" role="status">Loading the search form…</p>

  <div v-else-if="metaQuery.isError.value || !meta || !initial" class="mt-4" role="alert">
    <p class="text-red-700">We couldn’t load the search form.</p>
    <button
      type="button"
      class="mt-2 min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
      @click="metaQuery.refetch()"
    >
      Retry
    </button>
  </div>

  <template v-else>
    <!-- Always in the page, so changes to its text are announced (a live region added together with its text often is not). -->
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</p>

    <SearchForm class="mt-4" :meta="meta" :initial="initial" :validate-on-mount="urlInvalid"
      @unchanged="searchQuery.refetch()"
    />

    <p v-if="!hasSearch" class="mt-6 text-slate-600">Try “massage” near Medborgarplatsen.</p>

    <section v-else-if="params" class="mt-6" aria-label="Search results">
      <ResultSkeleton v-if="searchQuery.isPending.value" />

      <ResultsError
        v-else-if="searchQuery.isError.value && !searchQuery.data.value"
        :message="searchQuery.error.value?.message ?? 'Please try again.'"
        @retry="searchQuery.refetch()"
      />

      <template v-else-if="searchQuery.data.value">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="font-medium text-slate-900">{{ headline }}</p>
          <div v-if="sortedResults.length > 1">
            <label for="sort" class="mr-2 text-sm font-medium text-slate-800">Sort by</label>
            <select id="sort" v-model="sortKey" class="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="distance">Distance</option>
              <option value="earliest">Earliest available</option>
              <option value="price">Price</option>
            </select>
          </div>
        </div>

        <p v-if="searchQuery.isError.value" role="alert" class="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-red-700">
          We couldn’t refresh these results.
          <button type="button" class="inline-flex min-h-11 items-center font-medium underline" @click="searchQuery.refetch()">Retry</button>
        </p>

        <ResultsEmpty
          v-if="sortedResults.length === 0"
          class="mt-4"
          :can-widen="canWiden"
          :can-next7="canNext7"
          @widen="updateQuery({ radiusKm: '50' })"
          @next7="updateQuery({ from: today, to: addDays(today, 6) })"
        />
        <ul v-else class="mt-4 space-y-4" :aria-busy="searchQuery.isPlaceholderData.value" :class="searchQuery.isPlaceholderData.value && 'opacity-60'">
          <li v-for="r in sortedResults" :key="r.service.id">
            <ResultCard :result="r" @select="onSelect" />
          </li>
        </ul>
      </template>
    </section>
  </template>

  <BookingDialog v-if="selection" :selection="selection" @close="selection = null" />
</template>
