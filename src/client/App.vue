<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <AppHeader />
  <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <RouterView />
  </main>
</template>
