<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { searchQuerySchema } from '@shared/schemas';
import SearchForm, { type SearchFormValues } from '../components/SearchForm.vue';
import { fetchMeta, fetchSearch } from '../lib/api';
import BookingDialog from '../components/BookingDialog.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import ResultCard from '../components/ResultCard.vue';
import ResultSkeleton from '../components/ResultSkeleton.vue';
import ResultsEmpty from '../components/ResultsEmpty.vue';
import ResultsError from '../components/ResultsError.vue';
import type { SlotSelection } from '../components/SlotPicker.vue';
import { addDays, formatDateRange } from '../lib/format';
import { sortResults, type SortDirection, type SortKey } from '../lib/sort';
import { ArrowDownIcon, ArrowUpIcon } from '@lucide/vue';
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
const hasSearch = computed(() =>
  ['q', 'lat', 'lng', 'from', 'to', 'radiusKm'].some((k) => k in route.query),
);
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

const sortKey = ref<SortKey>('distance');
const sortDir = ref<SortDirection>('asc');

const sortedResults = computed(() =>
  sortResults(searchQuery.data.value?.results ?? [], sortKey.value, sortDir.value),
);

const SORT_LABELS: Record<SortKey, Record<SortDirection, string>> = {
  distance: { asc: 'Sorted nearest first', desc: 'Sorted farthest first' },
  price: { asc: 'Cheapest first', desc: 'Most expensive first' },
  earliest: { asc: 'Soonest first', desc: 'Latest first' },
};
const sortLabel = computed(() => SORT_LABELS[sortKey.value][sortDir.value]);

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
  () =>
    !!params.value &&
    (params.value.from !== today.value || params.value.to !== addDays(today.value, 6)),
);

function updateQuery(changes: Record<string, string>) {
  void router.push({ path: '/', query: { ...route.query, ...changes } });
}

// The booking dialog exists only while a slot is selected, so each opening is a fresh dialog.
const selection = ref<SlotSelection | null>(null);

function onSelect(next: SlotSelection) {
  selection.value = next;
}

// --- Layout ---

// From lg up the form is a sticky column; below it, a summary bar opens the same form in a Sheet.
// Only one SearchForm is ever mounted, so its ids stay unique.
const isDesktop = useMediaQuery('(min-width: 1024px)');
const sheetOpen = ref(false);

// "massage · Medborgarplatsen · 23–29 Oct", from the search the URL holds.
const summary = computed(() => {
  const p = params.value;
  if (!p) return '';
  const place = findPreset(p.lat, p.lng)?.name ?? 'Your location';
  return `${p.q} · ${place} · ${formatDateRange(p.from, p.to)}`;
});

const searchForm = ref<InstanceType<typeof SearchForm> | null>(null);

function onSuggestion(name: string) {
  void searchForm.value?.pickService(name);
}

function setSort(value: unknown) {
  if (value === 'distance' || value === 'earliest' || value === 'price') sortKey.value = value;
}
</script>

<template>
  <p
    v-if="metaQuery.isPending.value"
    class="text-muted-foreground"
    role="status"
  >
    Loading the search form…
  </p>

  <div
    v-else-if="metaQuery.isError.value || !meta || !initial"
    role="alert"
  >
    <p class="text-destructive">We couldn’t load the search form.</p>
    <Button
      type="button"
      variant="outline"
      class="mt-2"
      @click="metaQuery.refetch()"
      >Retry</Button
    >
  </div>

  <template v-else>
    <!-- Always in the page, so changes to its text are announced (a live region added together with its text often is not). -->
    <p
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ announcement }}
    </p>

    <!-- Landing: no valid search in the URL. -->
    <Card
      v-if="!params"
      class="mx-auto mt-6 max-w-xl sm:mt-12"
    >
      <CardHeader class="text-center">
        <h1 class="text-2xl font-semibold text-foreground">Find and book a service near you</h1>
        <CardDescription
          >Search by service, pick a place and dates, and book a free time.</CardDescription
        >
      </CardHeader>
      <CardContent class="flex flex-col gap-6">
        <SearchForm
          ref="searchForm"
          :meta="meta"
          :initial="initial"
          :validate-on-mount="urlInvalid"
          @unchanged="searchQuery.refetch()"
        />
        <div v-if="meta.serviceNames.length > 0">
          <p class="mb-2 text-sm text-muted-foreground">Popular searches</p>
          <ul class="flex flex-wrap gap-2">
            <li
              v-for="name in meta.serviceNames"
              :key="name"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-11 md:h-8"
                @click="onSuggestion(name)"
                >{{ name }}</Button
              >
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>

    <!-- Results. -->
    <div
      v-else
      class="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-8"
    >
      <h1 class="sr-only">Find and book a service</h1>

      <aside
        v-if="isDesktop"
        class="sticky top-6"
        aria-label="Search"
      >
        <Card>
          <CardContent>
            <SearchForm
              :meta="meta"
              :initial="initial"
              :validate-on-mount="urlInvalid"
              @unchanged="searchQuery.refetch()"
            />
          </CardContent>
        </Card>
      </aside>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-3 rounded-full border border-border bg-card py-1 pr-1 pl-4"
      >
        <p class="min-w-0 truncate text-sm text-foreground">{{ summary }}</p>
        <Sheet v-model:open="sheetOpen">
          <SheetTrigger as-child>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-11 shrink-0 md:h-10 rounded-full"
              >Edit</Button
            >
          </SheetTrigger>
          <SheetContent
            side="right"
            class="w-full overflow-y-auto sm:max-w-sm"
          >
            <SheetHeader>
              <SheetTitle>Edit search</SheetTitle>
              <SheetDescription class="sr-only"
                >Change the service, place, dates or distance.</SheetDescription
              >
            </SheetHeader>
            <div class="px-4 pb-4">
              <SearchForm
                :meta="meta"
                :initial="initial"
                :validate-on-mount="urlInvalid"
                @unchanged="searchQuery.refetch()"
                @submitted="sheetOpen = false"
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <section
        aria-label="Search results"
        class="min-w-0 lg:max-w-3xl"
      >
        <ResultSkeleton v-if="searchQuery.isPending.value" />

        <ResultsError
          v-else-if="searchQuery.isError.value && !searchQuery.data.value"
          :message="searchQuery.error.value?.message ?? 'Please try again.'"
          @retry="searchQuery.refetch()"
        />

        <template v-else-if="searchQuery.data.value">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="font-medium text-foreground">{{ headline }}</p>
            <div
              v-if="sortedResults.length > 1"
              class="flex items-center gap-2"
            >
              <label
                for="sort"
                class="text-sm font-medium text-foreground"
                >Sort by</label
              >
              <Select
                :model-value="sortKey"
                @update:model-value="setSort"
              >
                <SelectTrigger
                  id="sort"
                  class="w-auto min-w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance">Distance</SelectItem>
                  <SelectItem value="earliest">Earliest available</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                class="h-11 w-11 rounded-full p-0 sm:w-auto sm:px-3 md:h-9"
                :aria-label="sortLabel"
                @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
              >
                <ArrowUpIcon
                  v-if="sortDir === 'asc'"
                  aria-hidden="true"
                />
                <ArrowDownIcon
                  v-else
                  aria-hidden="true"
                />
                <span
                  class="hidden text-sm sm:inline"
                  aria-hidden="true"
                  >{{ sortLabel }}</span
                >
              </Button>
            </div>
          </div>

          <p
            v-if="searchQuery.isError.value"
            role="alert"
            class="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-destructive"
          >
            We couldn’t refresh these results.
            <Button
              type="button"
              variant="link"
              class="px-0"
              @click="searchQuery.refetch()"
              >Retry</Button
            >
          </p>

          <ResultsEmpty
            v-if="sortedResults.length === 0"
            class="mt-4"
            :can-widen="canWiden"
            :can-next7="canNext7"
            @widen="updateQuery({ radiusKm: '50' })"
            @next7="updateQuery({ from: today, to: addDays(today, 6) })"
          />
          <ul
            v-else
            class="mt-4 flex flex-col gap-4"
            :aria-busy="searchQuery.isPlaceholderData.value"
            :class="searchQuery.isPlaceholderData.value && 'opacity-80'"
          >
            <li
              v-for="r in sortedResults"
              :key="r.service.id"
            >
              <ResultCard
                :result="r"
                @select="onSelect"
              />
            </li>
          </ul>
        </template>
      </section>
    </div>
  </template>

  <BookingDialog
    v-if="selection"
    :selection="selection"
    @close="selection = null"
  />
</template>
