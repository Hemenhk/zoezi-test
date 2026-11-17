<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { CircleAlert, CircleCheck, SearchX } from '@lucide/vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ApiError, getBooking } from '../lib/api';
import { formatDayTime, formatDuration, formatPrice, formatTime } from '../lib/format';
import { downloadIcs } from '../lib/ics';

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
const notFound = computed(
  () => query.error.value instanceof ApiError && query.error.value.status === 404,
);
const reference = computed(() => booking.value?.id.slice(0, 8).toUpperCase() ?? '');

// The search the user came from, kept by the booking dialog as the `back` query parameter.
const backTo = computed(() => {
  const back = route.query.back;
  return typeof back === 'string' && back !== '' ? `/?${back}` : '/';
});

const details = computed(() => {
  const b = booking.value;
  if (!b) return [];
  return [
    { label: 'Name', value: b.customerName },
    { label: 'Venue', value: b.venue.name },
    { label: 'Service', value: b.service.name },
    { label: 'Staff', value: b.staff.name },
    { label: 'When', value: `${formatDayTime(b.start)}–${formatTime(b.end)}` },
    { label: 'Duration', value: formatDuration(b.service.durationMinutes) },
    { label: 'Price', value: formatPrice(b.service.priceSek) },
  ];
});

function addToCalendar() {
  if (booking.value) downloadIcs(booking.value, reference.value);
}
</script>

<template>
  <p
    v-if="query.isPending.value"
    class="text-muted-foreground"
    role="status"
  >
    Loading your booking…
  </p>

  <Empty
    v-else-if="notFound"
    class="border"
  >
    <EmptyHeader>
      <EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia>
      <EmptyTitle>Booking not found</EmptyTitle>
      <EmptyDescription>We couldn’t find that booking. The link may be wrong.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button
        as-child
        size="lg"
      >
        <RouterLink :to="backTo">Find a time</RouterLink>
      </Button>
    </EmptyContent>
  </Empty>

  <Alert
    v-else-if="query.isError.value"
    variant="destructive"
  >
    <CircleAlert aria-hidden="true" />
    <AlertTitle>We couldn’t load your booking.</AlertTitle>
    <AlertDescription>
      <Button
        type="button"
        variant="outline"
        size="lg"
        class="mt-2"
        @click="query.refetch()"
        >Retry</Button
      >
    </AlertDescription>
  </Alert>

  <Card
    v-else-if="booking"
    class="mx-auto w-full max-w-md"
  >
    <CardHeader class="items-center text-center">
      <CircleCheck
        class="size-10 text-foreground"
        aria-hidden="true"
      />
      <CardTitle
        as="h1"
        class="text-xl"
        >You're booked</CardTitle
      >
      <p class="text-sm text-muted-foreground">
        Reference <span class="font-mono font-semibold text-foreground">{{ reference }}</span>
      </p>
    </CardHeader>
    <CardContent class="flex flex-col gap-5">
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm break-words">
        <template
          v-for="row in details"
          :key="row.label"
        >
          <dt class="text-muted-foreground">{{ row.label }}</dt>
          <dd class="font-medium text-foreground">{{ row.value }}</dd>
        </template>
      </dl>
      <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          type="button"
          variant="outline"
          class="px-6"
          size="lg"
          @click="addToCalendar"
          >Add to calendar</Button
        >
        <Button
          as-child
          size="lg"
          class="px-6"
        >
          <RouterLink :to="backTo">Book another time</RouterLink>
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
