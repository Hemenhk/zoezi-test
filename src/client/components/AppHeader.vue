<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <!-- Light header: the Anviil screenshots show no dark brand surface, so --brand is not used here. -->
  <header class="border-b border-border bg-background">
    <div class="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
      <RouterLink to="/" class="inline-flex min-h-11 items-center font-heading text-lg font-semibold text-foreground">
        Book a time
      </RouterLink>
    </div>
  </header>
</template>
