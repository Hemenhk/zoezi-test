<script setup lang="ts">
import type { SearchResult } from '@shared/schemas';
import { formatDayTime, formatDistance, formatDuration, formatPrice } from '../lib/format';
import SlotPicker, { type SlotSelection } from './SlotPicker.vue';

const props = defineProps<{ result: SearchResult }>();
const emit = defineEmits<{ select: [selection: SlotSelection] }>();

function bookNext() {
  const slot = props.result.nextAvailable;
  if (slot) emit('select', { result: props.result, slot, staffId: null });
}
</script>

<template>
  <article
    class="rounded-lg border p-4"
    :class="result.nextAvailable ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 text-slate-600'"
  >
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div>
        <h3 class="text-base font-semibold" :class="result.nextAvailable ? 'text-slate-900' : 'text-slate-700'">
          {{ result.venue.name }}
        </h3>
        <p class="text-sm">{{ result.service.name }}</p>
      </div>
      <p class="text-sm">
        {{ formatDistance(result.distanceMeters) }}
      </p>
    </div>
    <p class="mt-1 text-sm">
      {{ formatDuration(result.service.durationMinutes) }} · <span class="font-medium">{{ formatPrice(result.service.priceSek) }}</span>
    </p>

    <template v-if="result.nextAvailable">
      <button
        type="button"
        class="mt-3 w-full rounded-md bg-slate-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-slate-800 sm:w-auto"
        @click="bookNext"
      >
        Next: {{ formatDayTime(result.nextAvailable.start) }}
      </button>
      <div class="mt-4 border-t border-slate-200 pt-3">
        <SlotPicker :result="result" @select="emit('select', $event)" />
      </div>
    </template>
    <p v-else class="mt-3 text-sm font-medium">No free times in these dates</p>
  </article>
</template>
