<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { useForm } from 'vee-validate';
import { createBookingSchema, type BookingDto, type CreateBookingInput, type SlotDto } from '@shared/schemas';
import { ApiError, createBooking } from '../lib/api';
import { formatDayTime, formatDuration, formatPrice, formatTime, localDateOf } from '../lib/format';
import type { SlotSelection } from './SlotPicker.vue';

const props = defineProps<{ selection: SlotSelection }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();

const dialogEl = ref<HTMLDialogElement | null>(null);
const nameEl = ref<HTMLInputElement | null>(null);
// The slot button that opened the dialog, so focus can go back to it on close.
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

// The slot can change inside the dialog (SLOT_TAKEN alternatives); the rest of the selection cannot.
const slot = ref<SlotDto>(props.selection.slot);
const staffId = ref<number | null>(props.selection.staffId);
const { result } = props.selection;

const staffLabel = computed(
  () => result.staff.find((s) => s.id === staffId.value)?.name ?? 'First available',
);

// --- Form: the shared customerName rule ---

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: createBookingSchema.pick({ customerName: true }),
  initialValues: { customerName: '' },
});
const [customerName, customerNameAttrs] = defineField('customerName');

// --- Idempotency key: new for each opening of the dialog (this component is created per opening) ---
// The server answers 422 if a key is reused with a different body, so the key is replaced when the
// body changes (a different slot or name). A retry of the identical body keeps the same key.

let idempotencyKey = crypto.randomUUID();
let keyBody = '';

function keyFor(body: CreateBookingInput): string {
  const signature = JSON.stringify(body);
  if (keyBody !== '' && keyBody !== signature) idempotencyKey = crypto.randomUUID();
  keyBody = signature;
  return idempotencyKey;
}

// --- Booking ---

const mutation = useMutation<BookingDto, ApiError, { body: CreateBookingInput; key: string }>({
  mutationFn: ({ body, key }) => createBooking(body, key),
  onSuccess: async (booking) => {
    queryClient.setQueryData(['booking', booking.id], booking);
    void queryClient.invalidateQueries({ queryKey: ['search'] });
    // Remember the search so the confirmation page can link back to it.
    const back = new URLSearchParams();
    for (const [k, v] of Object.entries(route.query)) {
      for (const item of Array.isArray(v) ? v : [v]) if (typeof item === 'string') back.append(k, item);
    }
    await router.push({ path: `/bookings/${encodeURIComponent(booking.id)}`, query: back.size ? { back: back.toString() } : {} });
  },
  onError: (error) => {
    // The list behind the dialog is stale after a conflict, so refresh it.
    if (error.code === 'SLOT_TAKEN') void queryClient.invalidateQueries({ queryKey: ['search'] });
  },
});

// A double-click can run this twice before `isPending` flips (validation is async), so guard with a flag.
let submitting = false;

const onSubmit = handleSubmit(async (values) => {
  if (submitting || mutation.isPending.value) return;
  submitting = true;
  try {
    const body: CreateBookingInput = {
      serviceId: result.service.id,
      staffId: staffId.value,
      start: slot.value.start,
      customerName: values.customerName,
    };
    await mutation.mutateAsync({ body, key: keyFor(body) });
  } catch {
    // Shown from mutation.error.
  } finally {
    submitting = false;
  }
});

const error = computed(() => mutation.error.value);
const taken = computed(() => error.value?.code === 'SLOT_TAKEN');
const unbookable = computed(() => error.value?.code === 'SLOT_IN_PAST' || error.value?.code === 'SLOT_INVALID');
const alternatives = computed(() => error.value?.alternatives ?? []);

function altLabel(alt: SlotDto): string {
  return localDateOf(alt.start) === localDateOf(slot.value.start) ? formatTime(alt.start) : formatDayTime(alt.start);
}

function pickAlternative(alt: SlotDto) {
  slot.value = alt;
  // Keep the chosen staff member if they can take the new time, otherwise first available.
  if (staffId.value !== null && !alt.staffIds.includes(staffId.value)) staffId.value = null;
  mutation.reset();
  void nextTick(() => nameEl.value?.focus());
}

// --- Dialog lifecycle ---

onMounted(async () => {
  dialogEl.value?.showModal();
  await nextTick();
  nameEl.value?.focus();
});

function close() {
  dialogEl.value?.close();
}

// Fires for Esc, the Back button and close(): return focus to the slot button, then tell the page.
function onClosed() {
  if (opener?.isConnected) opener.focus();
  emit('close');
}
</script>

<template>
  <dialog
    ref="dialogEl"
    aria-labelledby="booking-title"
    class="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    @close="onClosed"
  >
    <form class="p-5" novalidate @submit.prevent="onSubmit">
      <h2 id="booking-title" class="text-lg font-semibold">Confirm your booking</h2>

      <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm break-words">
        <dt class="text-slate-600">Venue</dt>
        <dd class="font-medium">{{ result.venue.name }}</dd>
        <dt class="text-slate-600">Service</dt>
        <dd class="font-medium">{{ result.service.name }}</dd>
        <dt class="text-slate-600">Staff</dt>
        <dd class="font-medium">{{ staffLabel }}</dd>
        <dt class="text-slate-600">When</dt>
        <dd class="font-medium">{{ formatDayTime(slot.start) }}</dd>
        <dt class="text-slate-600">Duration</dt>
        <dd class="font-medium">{{ formatDuration(result.service.durationMinutes) }}</dd>
        <dt class="text-slate-600">Price</dt>
        <dd class="font-medium">{{ formatPrice(result.service.priceSek) }}</dd>
      </dl>

      <div class="mt-4">
        <label for="customer-name" class="block text-sm font-medium text-slate-800">Your name</label>
        <input
          id="customer-name"
          ref="nameEl"
          v-model="customerName"
          v-bind="customerNameAttrs"
          type="text"
          autocomplete="name"
          :aria-invalid="errors.customerName ? 'true' : 'false'"
          :aria-describedby="errors.customerName ? 'customer-name-error' : undefined"
          class="mt-1 w-full min-h-11 rounded-md border border-slate-300 px-3 py-2 text-base aria-invalid:border-red-600"
        />
        <p v-if="errors.customerName" id="customer-name-error" role="alert" class="mt-1 text-sm text-red-700">
          {{ errors.customerName }}
        </p>
      </div>

      <div v-if="error" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
        <template v-if="taken">
          <p class="font-medium">Sorry, {{ formatTime(slot.start) }} was just taken.</p>
          <template v-if="alternatives.length > 0">
            <p class="mt-1">Other times you can book:</p>
            <ul class="mt-2 flex flex-wrap gap-2">
              <li v-for="alt in alternatives" :key="alt.start">
                <button
                  type="button"
                  class="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:border-slate-900"
                  @click="pickAlternative(alt)"
                >
                  {{ altLabel(alt) }}
                </button>
              </li>
            </ul>
          </template>
          <p v-else class="mt-1">There are no nearby times left. Go back to pick another.</p>
        </template>
        <p v-else>{{ error.message }}</p>
      </div>

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          @click="close"
        >
          {{ taken || unbookable ? 'Back to times' : 'Cancel' }}
        </button>
        <button
          v-if="!unbookable && !(taken && alternatives.length === 0)"
          type="submit"
          :disabled="mutation.isPending.value"
          class="min-h-11 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {{ mutation.isPending.value ? 'Booking…' : error && !taken ? 'Try again' : 'Confirm' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
