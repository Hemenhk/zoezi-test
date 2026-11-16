<script setup lang="ts">
defineProps<{ canWiden: boolean; canNext7: boolean }>();
const emit = defineEmits<{ widen: []; next7: [] }>();

const button =
  'min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50';
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <p class="font-medium text-slate-900">No matching services found.</p>
    <p class="mt-1 text-sm text-slate-600">Try a wider area or different dates.</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button v-if="canWiden" type="button" :class="button" @click="emit('widen')">Widen to 50 km</button>
      <button v-if="canNext7" type="button" :class="button" @click="emit('next7')">Try the next 7 days</button>
    </div>
  </div>
</template>
