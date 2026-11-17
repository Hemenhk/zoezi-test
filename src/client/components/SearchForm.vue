<script setup lang="ts">
import { computed, nextTick, provide, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date';
import { CalendarIcon, LocateFixedIcon } from '@lucide/vue';
import { searchQuerySchema, type MetaResponse } from '@shared/schemas';
import { addDays, formatDayMonth } from '../lib/format';
import { suggest } from '../lib/suggest';
import { findPreset, LOCATION_PRESETS } from '../lib/locations';
import { VENUE_TODAY } from '../lib/venue-today';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RangeCalendar } from '@/components/ui/range-calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';

export interface SearchFormValues {
  q: string;
  lat: number;
  lng: number;
  from: string;
  to: string;
  radiusKm: number;
}

const props = defineProps<{
  meta: MetaResponse;
  initial: SearchFormValues;
  /** Validate straight away, used when the URL held search parameters that are not valid. */
  validateOnMount: boolean;
}>();

const emit = defineEmits<{
  /** The submitted search equals the one in the URL, so the page should refetch. */
  unchanged: [];
  /** A valid search was submitted (the URL changed, or `unchanged` was emitted). */
  submitted: [];
}>();

const router = useRouter();

// The form schema is the shared search schema, so the client and server cannot disagree.
const { errors, defineField, handleSubmit, resetForm, setFieldValue, validate, values } = useForm<SearchFormValues>({
  validationSchema: searchQuerySchema,
  initialValues: props.initial,
  validateOnMount: props.validateOnMount,
});

const [q, qAttrs] = defineField('q');
const [from] = defineField('from');
const [to] = defineField('to');
const [radiusKm] = defineField('radiusKm');

// Back/forward and reload change the URL; the form follows it.
watch(
  () => JSON.stringify(props.initial),
  () => {
    resetForm({ values: props.initial });
    if (props.validateOnMount) void validate();
  },
);

// --- What: free text with suggestions ---

// The list only hints; the field is a plain text input and whatever is typed stays the value.
const suggestions = computed(() => suggest(props.meta.serviceNames, q.value ?? ''));
const listOpen = ref(false);
const active = ref(-1); // -1: nothing highlighted, the text itself is "selected"
const showList = computed(() => listOpen.value && suggestions.value.length > 0);
const optionId = (i: number) => `q-option-${i}`;

function closeList() {
  listOpen.value = false;
  active.value = -1;
}

function pickSuggestion(name: string) {
  setFieldValue('q', name);
  closeList();
}

function onQInput() {
  listOpen.value = true;
  active.value = -1;
}

function onQKeydown(e: KeyboardEvent) {
  const n = suggestions.value.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (n === 0) return;
    e.preventDefault();
    listOpen.value = true;
    if (e.key === 'ArrowDown') active.value = active.value + 1 >= n ? n - 1 : active.value + 1;
    else active.value = active.value === -1 ? n - 1 : active.value - 1;
  } else if (e.key === 'Enter') {
    if (showList.value && active.value >= 0) {
      e.preventDefault(); // fill the highlighted suggestion instead of submitting
      const name = suggestions.value[active.value];
      if (name) pickSuggestion(name);
    } else {
      closeList(); // nothing highlighted: the form submits the typed text as it is
    }
  } else if (e.key === 'Escape' && showList.value) {
    e.stopPropagation(); // close the list only, not a surrounding sheet
    closeList();
  } else if (e.key === 'Tab') {
    closeList();
  }
}

function onQBlur() {
  closeList();
  qAttrs.value.onBlur();
}

watch(active, async (i) => {
  if (i < 0) return;
  await nextTick();
  document.getElementById(optionId(i))?.scrollIntoView({ block: 'nearest' });
});

/** Used by the landing page's suggestion buttons: fill the service and move on to the next field. */
async function pickService(name: string) {
  setFieldValue('q', name);
  await nextTick();
  document.getElementById('preset')?.focus();
}
defineExpose({ pickService });

// --- When (all from meta.now, never the browser clock) ---

const today = computed(() => props.meta.now.slice(0, 10));
const todayCal = computed<DateValue>(() => parseDate(today.value));
provide(VENUE_TODAY, todayCal);

const datesOpen = ref(false);

function toCalendarDate(date: string | undefined): DateValue | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  try {
    return parseDate(date);
  } catch {
    return undefined;
  }
}

// shallowRef, not ref: @internationalized/date classes have private fields.
const range = shallowRef<{ start: DateValue | undefined; end: DateValue | undefined }>({
  start: toCalendarDate(from.value),
  end: toCalendarDate(to.value),
});
watch([from, to], ([f, t]) => {
  range.value = { start: toCalendarDate(f), end: toCalendarDate(t) };
});

// While a range is being picked, days after start + (maxRangeDays - 1) are disabled.
const pendingStart = shallowRef<DateValue | undefined>(undefined);
watch(datesOpen, () => {
  pendingStart.value = undefined;
});

function isDateDisabled(date: DateValue): boolean {
  if (date.compare(todayCal.value) < 0) return true;
  const start = pendingStart.value;
  return !!start && date.compare(start.add({ days: props.meta.maxRangeDays - 1 })) > 0;
}

function onRangeUpdate(next: { start: DateValue | undefined; end: DateValue | undefined }) {
  if (!next.start || !next.end) return; // still picking the end day
  const a = new CalendarDate(next.start.year, next.start.month, next.start.day);
  const b = new CalendarDate(next.end.year, next.end.month, next.end.day);
  setFieldValue('from', a.toString());
  setFieldValue('to', b.toString());
  pendingStart.value = undefined;
  datesOpen.value = false;
}

const dateRangeLabel = computed(() => {
  const f = toCalendarDate(from.value);
  const t = toCalendarDate(to.value);
  return f && t ? `${formatDayMonth(f.toString())} – ${formatDayMonth(t.toString())}` : 'Choose dates';
});

const DATE_CHIPS = [
  { label: 'Today', days: 1 },
  { label: 'Next 3 days', days: 3 },
  { label: 'Next 7 days', days: 7 },
  { label: 'Next 14 days', days: 14 },
] as const;

function applyChip(days: number) {
  setFieldValue('from', today.value);
  setFieldValue('to', addDays(today.value, days - 1));
  datesOpen.value = false;
}

function chipActive(days: number): boolean {
  return values.from === today.value && values.to === addDays(today.value, days - 1);
}

// --- Where ---

const geoState = ref<'idle' | 'locating'>('idle');
const geoMessage = ref('');
const usingGeolocation = ref(false);

const activePreset = computed(() => findPreset(values.lat, values.lng));
// The select value is a preset key, or "custom" while a geolocation fix is in use.
const presetValue = computed(() => activePreset.value?.key ?? 'custom');

function onPresetChange(key: unknown) {
  const preset = LOCATION_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  setFieldValue('lat', preset.lat);
  setFieldValue('lng', preset.lng);
  usingGeolocation.value = false;
  geoMessage.value = '';
}

function useMyLocation() {
  geoMessage.value = '';
  if (!('geolocation' in navigator)) {
    geoMessage.value = 'Your browser can’t share its location. Pick a place from the list instead.';
    return;
  }
  geoState.value = 'locating';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // Rounded to about 100 m: that is plenty for "near me" and puts less precise data in the URL.
      setFieldValue('lat', Math.round(pos.coords.latitude * 1000) / 1000);
      setFieldValue('lng', Math.round(pos.coords.longitude * 1000) / 1000);
      usingGeolocation.value = true;
      geoState.value = 'idle';
    },
    (err) => {
      geoState.value = 'idle';
      geoMessage.value =
        err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Pick a place from the list instead.'
          : 'Your location isn’t available right now. Pick a place from the list instead.';
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  );
}

// --- Distance ---

// Bounds and default come from the shared schema, not from numbers in this file.
const radiusSchema = searchQuerySchema.shape.radiusKm;
const RADIUS_MIN = radiusSchema.unwrap().minValue ?? 1;
const RADIUS_MAX = radiusSchema.unwrap().maxValue ?? RADIUS_MIN;
const radiusSlider = computed<number[]>({
  get: () => [Number(radiusKm.value ?? radiusSchema.def.defaultValue)],
  set: (v) => {
    if (v[0] !== undefined) radiusKm.value = v[0];
  },
});

// --- Submit: the URL is the single source of truth for the search ---

const onSubmit = handleSubmit((out) => {
  const query = {
    q: out.q,
    lat: String(out.lat),
    lng: String(out.lng),
    from: out.from,
    to: out.to,
    radiusKm: String(out.radiusKm),
  };
  const current = router.currentRoute.value.query;
  const same = Object.entries(query).every(([k, v]) => current[k] === v);
  if (same) {
    // The URL would not change, so tell the page to refetch and the button never feels dead.
    emit('unchanged');
  } else {
    void router.push({ path: '/', query });
  }
  emit('submitted');
});

const dateErrors = computed(() => [errors.value.from, errors.value.to]);
</script>

<template>
  <form class="flex flex-col gap-5" novalidate @submit.prevent="onSubmit">
    <Field :data-invalid="!!errors.q">
      <FieldLabel for="q">What</FieldLabel>
      <div class="relative">
        <Input
          id="q"
          v-model="q"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-controls="q-listbox"
          :aria-expanded="showList"
          :aria-activedescendant="showList && active >= 0 ? optionId(active) : undefined"
          :aria-invalid="!!errors.q"
          :aria-describedby="errors.q ? 'q-error' : undefined"
          placeholder="e.g. massage"
          class="text-base md:text-sm"
          @focus="listOpen = true"
          @click="listOpen = true"
          @input="onQInput"
          @keydown="onQKeydown"
          @blur="onQBlur"
        />
        <ul
          v-show="showList"
          id="q-listbox"
          role="listbox"
          aria-label="Suggestions"
          class="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground"
        >
          <li
            v-for="(name, i) in suggestions"
            :id="optionId(i)"
            :key="name"
            role="option"
            :aria-selected="i === active"
            class="flex min-h-11 cursor-pointer items-center rounded-md px-2 text-sm md:min-h-9"
            :class="i === active ? 'bg-accent text-accent-foreground' : ''"
            @mousedown.prevent
            @click="pickSuggestion(name)"
          >
            {{ name }}
          </li>
        </ul>
      </div>
      <FieldError v-if="errors.q" id="q-error" :errors="[errors.q]" />
    </Field>

    <Field :data-invalid="!!(errors.lat || errors.lng)">
      <FieldLabel for="preset">Where</FieldLabel>
      <Select :model-value="presetValue" @update:model-value="onPresetChange">
        <SelectTrigger
          id="preset"
          class="w-full"
          :aria-invalid="!!(errors.lat || errors.lng)"
          :aria-describedby="errors.lat || errors.lng ? 'location-error' : undefined"
        >
          <SelectValue placeholder="Choose a place" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-if="!activePreset" value="custom">Your location</SelectItem>
          <SelectItem v-for="p in LOCATION_PRESETS" :key="p.key" :value="p.key">{{ p.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" class="h-11 md:h-10" :disabled="geoState === 'locating'" @click="useMyLocation">
        <Spinner v-if="geoState === 'locating'" />
        <LocateFixedIcon v-else aria-hidden="true" />
        {{ geoState === 'locating' ? 'Locating…' : 'Use my location' }}
      </Button>
      <p v-if="usingGeolocation && !activePreset" class="text-sm text-muted-foreground">
        Searching near your location (rounded to about 100 m).
      </p>
      <p v-if="geoMessage" role="alert" class="text-sm text-destructive">{{ geoMessage }}</p>
      <FieldError v-if="errors.lat || errors.lng" id="location-error" :errors="['Choose a place from the list.']" />
    </Field>

    <Field :data-invalid="!!(errors.from || errors.to)">
      <FieldLabel for="dates">When</FieldLabel>
      <Popover v-model:open="datesOpen">
        <PopoverTrigger as-child>
          <Button
            id="dates"
            type="button"
            variant="outline"
            class="h-11 w-full justify-start font-normal md:h-10"
            :aria-invalid="!!(errors.from || errors.to)"
            :aria-describedby="errors.from || errors.to ? 'dates-error' : undefined"
          >
            <CalendarIcon aria-hidden="true" />
            {{ dateRangeLabel }}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-auto max-w-[calc(100vw-2rem)] p-0">
          <div class="flex flex-wrap gap-2 border-b border-border p-3">
            <Button
              v-for="chip in DATE_CHIPS"
              :key="chip.label"
              type="button"
              size="sm"
              class="h-11 md:h-10"
              :variant="chipActive(chip.days) ? 'default' : 'outline'"
              :aria-pressed="chipActive(chip.days)"
              @click="applyChip(chip.days)"
            >
              {{ chip.label }}
            </Button>
          </div>
          <RangeCalendar
            :model-value="range"
            :default-placeholder="todayCal"
            :min-value="todayCal"
            :is-date-disabled="isDateDisabled"
            :week-starts-on="1"
            locale="en-GB"
            @update:model-value="onRangeUpdate"
            @update:start-value="(v: DateValue | undefined) => (pendingStart = v)"
          />
          <p class="px-3 pb-3 text-sm text-muted-foreground">At most {{ meta.maxRangeDays }} days.</p>
        </PopoverContent>
      </Popover>
      <FieldError v-if="errors.from || errors.to" id="dates-error" :errors="dateErrors" />
    </Field>

    <Field :data-invalid="!!errors.radiusKm">
      <div class="flex items-baseline justify-between gap-3">
        <FieldLabel id="radius-label">Distance</FieldLabel>
        <span class="text-sm text-foreground" aria-hidden="true">Within {{ radiusSlider[0] }} km</span>
      </div>
      <Slider
        v-model="radiusSlider"
        :min="RADIUS_MIN"
        :max="RADIUS_MAX"
        :step="1"
        thumb-labelledby="radius-label"
        :thumb-value-text="`Within ${radiusSlider[0]} km`"
        :aria-invalid="!!errors.radiusKm"
        :aria-describedby="errors.radiusKm ? 'radius-error' : undefined"
      />
      <div class="flex justify-between text-sm text-muted-foreground" aria-hidden="true">
        <span>{{ RADIUS_MIN }} km</span>
        <span>{{ RADIUS_MAX }} km</span>
      </div>
      <FieldError v-if="errors.radiusKm" id="radius-error" :errors="[errors.radiusKm]" />
    </Field>

    <Button type="submit" size="lg" class="w-full">Search</Button>
  </form>
</template>
