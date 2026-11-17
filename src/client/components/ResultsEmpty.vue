<script setup lang="ts">
import { SearchX } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

defineProps<{ canWiden: boolean; canNext7: boolean }>();
const emit = defineEmits<{ widen: []; next7: [] }>();
</script>

<template>
  <Empty class="border">
    <EmptyHeader>
      <EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia>
      <EmptyTitle>No matching services found.</EmptyTitle>
      <EmptyDescription>Try a wider area or different dates.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="canWiden || canNext7" class="flex-row flex-wrap justify-center">
      <Button v-if="canWiden" type="button" variant="outline" size="lg" @click="emit('widen')">Widen to 50 km</Button>
      <Button v-if="canNext7" type="button" variant="outline" size="lg" @click="emit('next7')">Try the next 7 days</Button>
    </EmptyContent>
  </Empty>
</template>
