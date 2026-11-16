<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { ApiError, getBooking } from '../lib/api';
import { formatDayTime, formatDuration, formatPrice, formatTime } from '../lib/format';

const route = useRoute();
const id = computed(() => String(route.params.id));

const query = useQuery({
  queryKey: computed(() => ['booking', id.value] as const),
  queryFn: () => getBooking(id.value),
  staleTime: 60_000,
  // A missing booking will not appear by retrying.
  retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
});

const booking = computed(() => query.data.value);
const notFound = computed(() => query.error.value instanceof ApiError && query.error.value.status === 404);
const reference = computed(() => booking.value?.id.slice(0, 8).toUpperCase() ?? '');

// The search the user came from, kept by the booking dialog as the `back` query parameter.
const backTo = computed(() => {
  const back = route.query.back;
  return typeof back === 'string' && back !== '' ? `/?${back}` : '/';
});
</script>

<template>
  <p v-if="query.isPending.value" class="text-slate-600" role="status">Loading your booking…</p>

  <div v-else-if="notFound" role="alert">
    <h1 class="text-xl font-semibold text-slate-900">Booking not found</h1>
    <p class="mt-2 text-slate-600">We couldn’t find that booking. The link may be wrong.</p>
    <RouterLink :to="backTo" class="mt-4 inline-block font-medium text-slate-900 underline underline-offset-2">
      Find a time
    </RouterLink>
  </div>

  <div v-else-if="query.isError.value" role="alert">
    <p class="text-red-700">We couldn’t load your booking.</p>
    <button
      type="button"
      class="mt-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
      @click="query.refetch()"
    >
      Retry
    </button>
  </div>

  <div v-else-if="booking">
    <h1 class="text-xl font-semibold text-slate-900">Your booking is confirmed</h1>
    <p class="mt-1 text-slate-600">Reference <span class="font-mono font-semibold text-slate-900">{{ reference }}</span></p>

    <dl class="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <dt class="text-slate-600">Name</dt>
      <dd class="font-medium">{{ booking.customerName }}</dd>
      <dt class="text-slate-600">Venue</dt>
      <dd class="font-medium">{{ booking.venue.name }}</dd>
      <dt class="text-slate-600">Service</dt>
      <dd class="font-medium">{{ booking.service.name }}</dd>
      <dt class="text-slate-600">Staff</dt>
      <dd class="font-medium">{{ booking.staff.name }}</dd>
      <dt class="text-slate-600">When</dt>
      <dd class="font-medium">{{ formatDayTime(booking.start) }}–{{ formatTime(booking.end) }}</dd>
      <dt class="text-slate-600">Duration</dt>
      <dd class="font-medium">{{ formatDuration(booking.service.durationMinutes) }}</dd>
      <dt class="text-slate-600">Price</dt>
      <dd class="font-medium">{{ formatPrice(booking.service.priceSek) }}</dd>
    </dl>

    <RouterLink
      :to="backTo"
      class="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
    >
      Book another time
    </RouterLink>
  </div>
</template>
