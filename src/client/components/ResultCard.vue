<script setup lang="ts">
import { Clock, MapPin } from '@lucide/vue';
import type { SearchResult } from '@shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDayTime, formatDistance, formatDuration, formatPrice, formatSlotLabel } from '../lib/format';
import SlotPicker, { type SlotSelection } from './SlotPicker.vue';

const props = defineProps<{ result: SearchResult }>();
const emit = defineEmits<{ select: [selection: SlotSelection] }>();

function bookNext() {
  const slot = props.result.nextAvailable;
  if (slot) emit('select', { result: props.result, slot, staffId: null });
}
</script>

<template>
  <!-- A muted card keeps foreground text: muted-foreground on muted is under 4.5:1. -->
  <Card :class="result.nextAvailable ? undefined : 'bg-muted'">
    <CardHeader>
      <CardTitle role="heading" aria-level="3" class="break-words">{{ result.service.name }}</CardTitle>
      <CardDescription :class="result.nextAvailable ? undefined : 'text-foreground'">{{ result.venue.name }}</CardDescription>
      <CardAction class="text-right">
        <p class="font-medium text-foreground">{{ formatPrice(result.service.priceSek) }}</p>
        <p :class="result.nextAvailable ? 'text-muted-foreground' : 'text-foreground'">
          {{ formatDuration(result.service.durationMinutes) }}
        </p>
      </CardAction>
    </CardHeader>

    <CardContent class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          <MapPin aria-hidden="true" />
          {{ formatDistance(result.distanceMeters) }}
        </Badge>
        <Badge v-if="!result.nextAvailable" variant="outline" class="text-foreground">Fully booked</Badge>
      </div>

      <template v-if="result.nextAvailable">
        <Button
          type="button"
          size="lg"
          class="w-full sm:w-auto sm:self-start"
          :aria-label="`Next available: ${formatSlotLabel(result.nextAvailable, result.service.name, result.staff, null)}`"
          @click="bookNext"
        >
          <Clock aria-hidden="true" />
          Next: {{ formatDayTime(result.nextAvailable.start) }}
        </Button>
        <Separator />
        <SlotPicker :result="result" @select="emit('select', $event)" />
      </template>
      <p v-else class="text-sm font-medium text-foreground">No free times in these dates.</p>
    </CardContent>
  </Card>
</template>
