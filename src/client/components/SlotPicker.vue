<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { SearchResult, SlotDto } from '@shared/schemas';
import { formatDayMonth, formatTime, formatWeekday, localHour } from '../lib/format';

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

// Roving tabindex: only the active tab is in the tab order; arrows move between enabled days.
const tabEls = ref<HTMLButtonElement[]>([]);

async function onTabKey(event: KeyboardEvent, index: number) {
  const enabled = days.value.map((d, i) => (d.enabled ? i : -1)).filter((i) => i >= 0);
  const pos = enabled.indexOf(index);
  let target: number | undefined;
  if (event.key === 'ArrowRight') target = enabled[(pos + 1) % enabled.length];
  else if (event.key === 'ArrowLeft') target = enabled[(pos - 1 + enabled.length) % enabled.length];
  else if (event.key === 'Home') target = enabled[0];
  else if (event.key === 'End') target = enabled[enabled.length - 1];
  if (target === undefined) return;
  event.preventDefault();
  const day = days.value[target];
  if (!day) return;
  chosenDate.value = day.date;
  await nextTick();
  tabEls.value[target]?.focus();
}

const chip =
  'rounded-full border px-3 py-1.5 text-sm font-medium aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white border-slate-300 bg-white text-slate-800 hover:bg-slate-50';
</script>

<template>
  <div>
    <div v-if="result.staff.length > 0" class="flex flex-wrap items-center gap-2" role="group" :aria-labelledby="`${uid}-staff`">
      <span :id="`${uid}-staff`" class="text-sm font-medium text-slate-700">Staff</span>
      <button type="button" :class="chip" :aria-pressed="staffId === null" @click="staffId = null">Any</button>
      <button
        v-for="s in result.staff"
        :key="s.id"
        type="button"
        :class="chip"
        :aria-pressed="staffId === s.id"
        @click="staffId = s.id"
      >
        {{ s.name }}
      </button>
    </div>

    <div class="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
      <div role="tablist" aria-label="Day" class="flex gap-2">
        <button
          v-for="(d, i) in days"
          :id="`${uid}-tab-${d.date}`"
          :key="d.date"
          :ref="(el) => { if (el) tabEls[i] = el as HTMLButtonElement; }"
          type="button"
          role="tab"
          :disabled="!d.enabled"
          :aria-selected="d.date === activeDate"
          :aria-controls="`${uid}-panel`"
          :tabindex="d.date === activeDate ? 0 : -1"
          class="min-w-20 shrink-0 rounded-md border px-3 py-1.5 text-center text-sm disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 aria-selected:border-slate-900 aria-selected:bg-slate-900 aria-selected:text-white border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          @click="chosenDate = d.date"
          @keydown="onTabKey($event, i)"
        >
          <span class="block font-medium">{{ formatWeekday(d.date) }}</span>
          <span class="block">{{ formatDayMonth(d.date) }}</span>
          <span v-if="!d.enabled" class="block text-xs">Closed / full</span>
        </button>
      </div>
    </div>

    <div
      :id="`${uid}-panel`"
      role="tabpanel"
      tabindex="0"
      :aria-labelledby="activeDate ? `${uid}-tab-${activeDate}` : undefined"
      class="mt-3 space-y-3"
    >
      <p v-if="!activeDate" class="text-sm text-slate-600">No free times for this choice in these dates.</p>
      <section v-for="g in groups" :key="g.key" :aria-label="g.label">
        <h4 class="text-sm font-medium text-slate-700">{{ g.label }}</h4>
        <ul class="mt-1 flex flex-wrap gap-2">
          <li v-for="slot in g.shown" :key="slot.start">
            <button
              type="button"
              class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-slate-900 hover:bg-slate-50"
              @click="emit('select', { result, slot, staffId })"
            >
              {{ formatTime(slot.start) }}
            </button>
          </li>
        </ul>
        <button
          v-if="!g.open && g.hidden > 0"
          type="button"
          class="mt-2 text-sm font-medium text-slate-800 underline underline-offset-2"
          @click="showAll(g.key)"
        >
          Show all ({{ g.all.length }})
        </button>
      </section>
    </div>
  </div>
</template>
