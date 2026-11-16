<template>
  <div class="space-y-4" aria-hidden="true">
    <div v-for="n in 3" :key="n" class="animate-pulse rounded-lg border border-slate-200 bg-white p-4 motion-reduce:animate-none">
      <div class="h-5 w-1/2 rounded bg-slate-200"></div>
      <div class="mt-2 h-4 w-1/3 rounded bg-slate-200"></div>
      <div class="mt-4 h-10 w-48 rounded bg-slate-200"></div>
    </div>
  </div>
</template>
