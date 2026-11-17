<script setup lang="ts">
import { CircleAlert } from '@lucide/vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

defineProps<{ message: string }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <Alert variant="destructive">
    <CircleAlert aria-hidden="true" />
    <AlertTitle>We couldn’t run the search.</AlertTitle>
    <AlertDescription class="break-words">
      <p>{{ message }}</p>
      <Button type="button" variant="outline" size="lg" class="mt-3" @click="emit('retry')">Retry</Button>
    </AlertDescription>
  </Alert>
</template>
