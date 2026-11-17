<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
</script>

<template>
  <div class="flex flex-col gap-4" aria-hidden="true">
    <Card v-for="n in 3" :key="n">
      <CardHeader>
        <Skeleton class="h-5 w-1/2 motion-reduce:animate-none" />
        <Skeleton class="mt-1 h-4 w-1/3 motion-reduce:animate-none" />
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <Skeleton class="h-5 w-20 rounded-full motion-reduce:animate-none" />
        <Skeleton class="h-11 w-48 rounded-full motion-reduce:animate-none" />
      </CardContent>
    </Card>
  </div>
</template>
