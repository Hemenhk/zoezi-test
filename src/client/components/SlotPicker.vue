<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { SearchResult, SlotDto } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDayMonth, formatSlotLabel, formatTime, formatWeekday, localHour } from '../lib/format';

export interface SlotSelection {
  result: SearchResult;
  slot: SlotDto;
  /** null means "Any" staff member. */
  staffId: number | null;
}

const props = defineProps<{ result: SearchResult }>();
const emit = defineEmits<{ select: [selection: SlotSelection] }>();

const PER_GROUP = 8;
const uid = `picker-${props.result.service.id}`;

const staffId = ref<number | null>(null);
const chosenDate = ref<string | null>(null);
const expanded = ref<Record<string, boolean>>({});

function visibleSlots(slots: SlotDto[]): SlotDto[] {
  const id = staffId.value;
  return id === null ? slots : slots.filter((s) => s.staffIds.includes(id));
}

const days = computed(() =>
  props.result.days.map((d) => ({ date: d.date, slots: visibleSlots(d.slots) })).map((d) => ({ ...d, enabled: d.slots.length > 0 })),
);

// The chosen day, or the first day with times when it has none (for example after a staff filter).
const activeDate = computed(() => {
  const chosen = days.value.find((d) => d.date === chosenDate.value && d.enabled);
  return (chosen ?? days.value.find((d) => d.enabled))?.date ?? null;
});
const activeSlots = computed(() => days.value.find((d) => d.date === activeDate.value)?.slots ?? []);

const GROUPS = [
  { key: 'morning', label: 'Morning', test: (h: number) => h < 12 },
  { key: 'afternoon', label: 'Afternoon', test: (h: number) => h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', test: (h: number) => h >= 17 },
] as const;

const groups = computed(() =>
  GROUPS.map((g) => {
    const all = activeSlots.value.filter((s) => g.test(localHour(s.start)));
    const open = expanded.value[`${activeDate.value}|${staffId.value}|${g.key}`] === true;
    return { ...g, all, shown: open ? all : all.slice(0, PER_GROUP), open, hidden: Math.max(0, all.length - PER_GROUP) };
  }).filter((g) => g.all.length > 0),
);

function showAll(groupKey: string) {
  expanded.value = { ...expanded.value, [`${activeDate.value}|${staffId.value}|${groupKey}`]: true };
}

// Keep the selected day visible in the strip, however it changed (click, keys, or the automatic jump).
// No smooth behaviour, so reduced-motion users are unaffected.
const strip = ref<HTMLElement | null>(null);
watch(activeDate, async () => {
  await nextTick();
  strip.value?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

// ToggleGroup values are strings. "any" is the default, and clearing the group falls back to it.
const staffValue = computed(() => (staffId.value === null ? 'any' : String(staffId.value)));

function setStaff(value: unknown) {
  const id = typeof value === 'string' && value !== 'any' ? Number(value) : null;
  staffId.value = id !== null && props.result.staff.some((s) => s.id === id) ? id : null;
}

function setDay(value: unknown) {
  if (typeof value === 'string') chosenDate.value = value;
}

// 44 px tall on phones; the compact size from sm up.
const touch = 'h-11 sm:h-9';
</script>

<template>
  <Tabs :model-value="activeDate ?? ''" class="flex-col gap-3" @update:model-value="setDay">
    <!-- Below sm: one scrolling strip. From sm up the days wrap, so the viewport's inline table layout is made a block. -->
    <div ref="strip">
    <ScrollArea class="w-full sm:[&_[data-slot=scroll-area-viewport]>div]:block!">
      <TabsList variant="line" aria-label="Day" class="h-auto! w-max gap-2 p-1 sm:w-full sm:flex-wrap sm:justify-start">
        <TabsTrigger
          v-for="d in days"
          :key="d.date"
          :value="d.date"
          :disabled="!d.enabled"
          class="h-auto min-h-11 min-w-20 flex-none flex-col gap-0 rounded-md border-border px-3 py-1.5 after:hidden data-[state=active]:border-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground group-data-[variant=line]/tabs-list:data-[state=active]:bg-primary"
        >
          <span class="font-medium">{{ formatWeekday(d.date) }}</span>
          <span>{{ formatDayMonth(d.date) }}</span>
          <span v-if="!d.enabled" class="sr-only">, Closed / full</span>
        </TabsTrigger>
      </TabsList>
    </ScrollArea>
    </div>

    <div v-if="result.staff.length > 1" class="flex flex-col items-start gap-1.5">
      <span :id="`${uid}-staff`" class="text-sm font-medium text-foreground">Staff</span>
      <ToggleGroup
        type="single"
        variant="outline"
        :spacing="2"
        :model-value="staffValue"
        :aria-labelledby="`${uid}-staff`"
        class="flex-wrap"
        @update:model-value="setStaff"
      >
        <ToggleGroupItem
          value="any"
          :class="[touch, 'rounded-full px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground']"
        >
          Any
        </ToggleGroupItem>
        <ToggleGroupItem
          v-for="s in result.staff"
          :key="s.id"
          :value="String(s.id)"
          :class="[touch, 'rounded-full px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground']"
        >
          {{ s.name }}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>

    <p v-if="!activeDate" class="text-sm text-muted-foreground">No free times for this choice in these dates.</p>
    <TabsContent v-else :value="activeDate" class="flex flex-col gap-4">
      <section v-for="g in groups" :key="g.key" :aria-label="g.label">
        <h4 class="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ g.label }}</h4>
        <ul class="grid grid-cols-4 gap-2 sm:grid-cols-6">
          <li v-for="slot in g.shown" :key="slot.start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :aria-label="formatSlotLabel(slot, result.service.name, result.staff, staffId)"
              :class="[touch, 'w-full min-w-0 px-2 tabular-nums']"
              @click="emit('select', { result, slot, staffId })"
            >
              {{ formatTime(slot.start) }}
            </Button>
          </li>
        </ul>
        <Button v-if="!g.open && g.hidden > 0" type="button" variant="ghost" size="sm" :class="[touch, 'mt-1']" @click="showAll(g.key)">
          Show all ({{ g.all.length }})
        </Button>
      </section>
    </TabsContent>
  </Tabs>
</template>
