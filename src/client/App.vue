<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-4xl items-center px-4 py-3">
      <RouterLink to="/" class="text-lg font-semibold text-slate-900">Booking</RouterLink>
    </div>
  </header>
  <main class="mx-auto max-w-4xl px-4 py-6">
    <RouterView />
  </main>
</template>
