<script setup lang="ts">
defineProps<{ message: string }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4">
    <p class="font-medium text-red-800">We couldn’t run the search.</p>
    <p class="mt-1 text-sm text-red-800 break-words">{{ message }}</p>
    <button
      type="button"
      class="mt-3 min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
      @click="emit('retry')"
    >
      Retry
    </button>
  </div>
</template>
