<script setup lang="ts">
import { ref } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import BookingContent from './BookingContent.vue';
import type { SlotSelection } from './SlotPicker.vue';

defineProps<{ selection: SlotSelection }>();
const emit = defineEmits<{ close: [] }>();

// Read once when the booking opens. Following the media query live would remount the content
// (and lose the typed name and any request in flight) if the window is resized or rotated.
const isDesktop = ref(useMediaQuery('(min-width: 768px)').value);
const open = ref(true);

function onOpenChange(value: boolean) {
  open.value = value;
  // The page unmounts this component; Reka UI returns focus to the slot button that opened it.
  if (!value) emit('close');
}

// Reka UI moves focus to the first tabbable element, which would be the close button. Put it on the name field instead.
function focusName(event: Event) {
  event.preventDefault();
  document.getElementById('customer-name')?.focus();
}
</script>

<template>
  <Dialog v-if="isDesktop" :open="open" @update:open="onOpenChange">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" @open-auto-focus="focusName">
      <DialogHeader>
        <DialogTitle>Confirm your booking</DialogTitle>
        <DialogDescription class="sr-only">Check the details and enter your name to book this time.</DialogDescription>
      </DialogHeader>
      <BookingContent :selection="selection" @close="onOpenChange(false)" />
    </DialogContent>
  </Dialog>

  <Drawer v-else :open="open" @update:open="onOpenChange">
    <DrawerContent @open-auto-focus="focusName">
      <DrawerHeader>
        <DrawerTitle>Confirm your booking</DrawerTitle>
        <DrawerDescription class="sr-only">Check the details and enter your name to book this time.</DrawerDescription>
      </DrawerHeader>
      <div class="overflow-y-auto px-4 pb-4">
        <BookingContent :selection="selection" @close="onOpenChange(false)" />
      </div>
    </DrawerContent>
  </Drawer>
</template>
