<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { searchQuerySchema, type MetaResponse } from '@shared/schemas';
import { addDays } from '../lib/format';
import { findPreset, LOCATION_PRESETS } from '../lib/locations';

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

const emit = defineEmits<{ unchanged: [] }>();

const router = useRouter();

// The form schema is the shared search schema, so the client and server cannot disagree.
const { errors, defineField, handleSubmit, resetForm, setFieldValue, validate, values } = useForm<SearchFormValues>({
  validationSchema: searchQuerySchema,
  initialValues: props.initial,
  validateOnMount: props.validateOnMount,
});

const [q, qAttrs] = defineField('q');
const [from, fromAttrs] = defineField('from');
const [to, toAttrs] = defineField('to');
const [radiusKm, radiusAttrs] = defineField('radiusKm');

// Back/forward and reload change the URL; the form follows it.
watch(
  () => JSON.stringify(props.initial),
  () => {
    resetForm({ values: props.initial });
    if (props.validateOnMount) void validate();
  },
);

// --- Dates (all from meta.now, never the browser clock) ---

const today = computed(() => props.meta.now.slice(0, 10));
const toMin = computed(() => (from.value && from.value > today.value ? from.value : today.value));
const toMax = computed(() => (from.value ? addDays(from.value, props.meta.maxRangeDays - 1) : undefined));

const DATE_CHIPS = [
  { label: 'Today', days: 1 },
  { label: 'Next 3 days', days: 3 },
  { label: 'Next 7 days', days: 7 },
  { label: 'Next 14 days', days: 14 },
] as const;

function applyChip(days: number) {
  setFieldValue('from', today.value);
  setFieldValue('to', addDays(today.value, days - 1));
}

function chipActive(days: number): boolean {
  return values.from === today.value && values.to === addDays(today.value, days - 1);
}

// --- Location ---

const geoState = ref<'idle' | 'locating'>('idle');
const geoMessage = ref('');
const usingGeolocation = ref(false);

const activePreset = computed(() => findPreset(values.lat, values.lng));
const locationName = computed(() => activePreset.value?.name ?? 'Your location');
// The select value is a preset key, or "custom" while a geolocation fix is in use.
const presetValue = computed(() => activePreset.value?.key ?? 'custom');

function onPresetChange(event: Event) {
  const preset = LOCATION_PRESETS.find((p) => p.key === (event.target as HTMLSelectElement).value);
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

// --- Radius ---

const radiusOptions = computed(() =>
  [...new Set([5, 10, 25, 50, Number(values.radiusKm)].filter((n) => Number.isFinite(n)))].sort((a, b) => a - b),
);

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
    return;
  }
  void router.push({ path: '/', query });
});

const field = 'mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-600';
const label = 'block text-sm font-medium text-slate-800';
const errorText = 'mt-1 text-sm text-red-700';
const hintText = 'mt-1 text-sm text-slate-600';
const button =
  'min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-600';
</script>

<template>
  <form class="space-y-5 rounded-lg border border-slate-200 bg-white p-4" novalidate @submit.prevent="onSubmit">
    <div>
      <label for="q" :class="label">Service</label>
      <input
        id="q"
        v-model="q"
        v-bind="qAttrs"
        type="text"
        list="service-names"
        autocomplete="off"
        placeholder="e.g. massage"
        :class="field"
        :aria-invalid="!!errors.q"
        :aria-describedby="errors.q ? 'q-error' : undefined"
      />
      <datalist id="service-names">
        <option v-for="name in meta.serviceNames" :key="name" :value="name" />
      </datalist>
      <p v-if="errors.q" id="q-error" role="alert" :class="errorText">{{ errors.q }}</p>
    </div>

    <fieldset
      class="min-w-0"
      :aria-invalid="!!(errors.lat || errors.lng)"
      :aria-describedby="errors.lat || errors.lng ? 'location-error' : 'location-active'"
    >
      <legend :class="label">Location</legend>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <button type="button" :class="button" :disabled="geoState === 'locating'" @click="useMyLocation">
          {{ geoState === 'locating' ? 'Locating…' : 'Use my location' }}
        </button>
        <label class="text-sm text-slate-600" for="preset">or choose a place</label>
        <select id="preset" :class="[field, 'mt-0 w-auto']" :value="presetValue" @change="onPresetChange">
          <option v-if="!activePreset" value="custom">Your location</option>
          <option v-for="p in LOCATION_PRESETS" :key="p.key" :value="p.key">{{ p.name }}</option>
        </select>
      </div>
      <p id="location-active" :class="hintText">
        Searching near <strong>{{ locationName }}</strong
        ><template v-if="usingGeolocation && !activePreset"> (rounded to about 100 m)</template>.
      </p>
      <p v-if="geoMessage" role="alert" :class="errorText">{{ geoMessage }}</p>
      <p v-if="errors.lat || errors.lng" id="location-error" role="alert" :class="errorText">
        Choose a place from the list.
      </p>
    </fieldset>

    <fieldset class="min-w-0">
      <legend :class="label">Dates</legend>
      <div class="mt-1 flex flex-wrap gap-2">
        <button
          v-for="chip in DATE_CHIPS"
          :key="chip.label"
          type="button"
          :class="[button, chipActive(chip.days) && 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800']"
          :aria-pressed="chipActive(chip.days)"
          @click="applyChip(chip.days)"
        >
          {{ chip.label }}
        </button>
      </div>
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="min-w-0">
          <label for="from" :class="label">From</label>
          <input
            id="from"
            v-model="from"
            v-bind="fromAttrs"
            type="date"
            :min="today"
            :class="field"
            :aria-invalid="!!errors.from"
            :aria-describedby="errors.from ? 'from-error' : undefined"
          />
          <p v-if="errors.from" id="from-error" role="alert" :class="errorText">{{ errors.from }}</p>
        </div>
        <div class="min-w-0">
          <label for="to" :class="label">To</label>
          <input
            id="to"
            v-model="to"
            v-bind="toAttrs"
            type="date"
            :min="toMin"
            :max="toMax"
            :class="field"
            :aria-invalid="!!errors.to"
            :aria-describedby="errors.to ? 'to-error' : 'to-hint'"
          />
          <p v-if="errors.to" id="to-error" role="alert" :class="errorText">{{ errors.to }}</p>
          <p v-else id="to-hint" :class="hintText">At most {{ meta.maxRangeDays }} days.</p>
        </div>
      </div>
    </fieldset>

    <div>
      <label for="radius" :class="label">Distance</label>
      <select
        id="radius"
        v-model="radiusKm"
        v-bind="radiusAttrs"
        :class="[field, 'sm:w-48']"
        :aria-invalid="!!errors.radiusKm"
        :aria-describedby="errors.radiusKm ? 'radius-error' : undefined"
      >
        <option v-for="km in radiusOptions" :key="km" :value="km">Within {{ km }} km</option>
      </select>
      <p v-if="errors.radiusKm" id="radius-error" role="alert" :class="errorText">{{ errors.radiusKm }}</p>
    </div>

    <button
      type="submit"
      class="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 sm:w-auto"
    >
      Search
    </button>
  </form>
</template>
