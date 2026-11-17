<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { Field as VeeField, useForm } from 'vee-validate';
import { CircleAlert } from '@lucide/vue';
import {
  createBookingSchema,
  type BookingDto,
  type CreateBookingInput,
  type SlotDto,
} from '@shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, createBooking } from '../lib/api';
import { formatDayTime, formatDuration, formatPrice, formatTime, localDateOf } from '../lib/format';
import type { SlotSelection } from './SlotPicker.vue';

// The summary, the form and all of its states. BookingDialog.vue only decides whether this sits in a Dialog or a Drawer.
// This component is created once per opening, which is what scopes the idempotency key.
const props = defineProps<{ selection: SlotSelection }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();

const NAME_ID = 'customer-name';

// The slot can change here (SLOT_TAKEN alternatives); the rest of the selection cannot.
const slot = ref<SlotDto>(props.selection.slot);
const staffId = ref<number | null>(props.selection.staffId);
const { result } = props.selection;

const staffLabel = computed(
  () => result.staff.find((s) => s.id === staffId.value)?.name ?? 'First available',
);

// --- Form: the shared customerName rule ---

const { handleSubmit } = useForm({
  validationSchema: createBookingSchema.pick({ customerName: true }),
  initialValues: { customerName: '' },
});

// --- Idempotency key: new for each opening (this component is created per opening) ---
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
      for (const item of Array.isArray(v) ? v : [v])
        if (typeof item === 'string') back.append(k, item);
    }
    await router.push({
      path: `/bookings/${encodeURIComponent(booking.id)}`,
      query: back.size ? { back: back.toString() } : {},
    });
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
const unbookable = computed(
  () => error.value?.code === 'SLOT_IN_PAST' || error.value?.code === 'SLOT_INVALID',
);
const alternatives = computed(() => error.value?.alternatives ?? []);
const canConfirm = computed(
  () => !unbookable.value && !(taken.value && alternatives.value.length === 0),
);

function altLabel(alt: SlotDto): string {
  return localDateOf(alt.start) === localDateOf(slot.value.start)
    ? formatTime(alt.start)
    : formatDayTime(alt.start);
}

function pickAlternative(alt: SlotDto) {
  slot.value = alt;
  // Keep the chosen staff member if they can take the new time, otherwise first available.
  if (staffId.value !== null && !alt.staffIds.includes(staffId.value)) staffId.value = null;
  mutation.reset();
  // The alternative button that had focus is gone now; move focus to the name field, inside the same trap.
  void nextTick(() => document.getElementById(NAME_ID)?.focus());
}

const summary = computed(() => [
  { label: 'Venue', value: result.venue.name },
  { label: 'Service', value: result.service.name },
  { label: 'Staff', value: staffLabel.value },
  { label: 'When', value: formatDayTime(slot.value.start) },
  { label: 'Duration', value: formatDuration(result.service.durationMinutes) },
  { label: 'Price', value: formatPrice(result.service.priceSek) },
]);
</script>

<template>
  <form
    class="flex flex-col gap-4"
    novalidate
    @submit.prevent="onSubmit"
  >
    <dl
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border border-border p-3 text-sm break-words"
    >
      <template
        v-for="row in summary"
        :key="row.label"
      >
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="font-medium text-foreground">{{ row.value }}</dd>
      </template>
    </dl>

    <VeeField
      v-slot="{ field, errors }"
      name="customerName"
    >
      <Field :data-invalid="errors.length > 0">
        <FieldLabel :for="NAME_ID">Your name</FieldLabel>
        <Input
          v-bind="field"
          :id="NAME_ID"
          type="text"
          autocomplete="name"
          :aria-invalid="errors.length > 0"
          :aria-describedby="errors.length > 0 ? `${NAME_ID}-error` : undefined"
        />
        <FieldError
          v-if="errors.length > 0"
          :id="`${NAME_ID}-error`"
          :errors="errors"
        />
      </Field>
    </VeeField>

    <Alert
      v-if="error && taken"
      aria-live="polite"
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Sorry, {{ formatTime(slot.start) }} was just taken.</AlertTitle>
      <AlertDescription>
        <template v-if="alternatives.length > 0">
          <p>Other times you can book:</p>
          <ul class="mt-2 flex flex-wrap gap-2">
            <li
              v-for="alt in alternatives"
              :key="alt.start"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-11 px-3 md:h-8"
                @click="pickAlternative(alt)"
              >
                {{ altLabel(alt) }}
              </Button>
            </li>
          </ul>
        </template>
        <p v-else>There are no nearby times left. Go back to pick another.</p>
      </AlertDescription>
    </Alert>
    <Alert
      v-else-if="error"
      variant="destructive"
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle>We couldn’t book that time.</AlertTitle>
      <AlertDescription class="break-words">{{ error.message }}</AlertDescription>
    </Alert>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="outline"
        size="lg"
        class="px-6"
        @click="emit('close')"
      >
        {{ taken || unbookable ? 'Back to times' : 'Cancel' }}
      </Button>
      <Button
        v-if="canConfirm"
        type="submit"
        size="lg"
        class="px-6"
        :disabled="mutation.isPending.value"
      >
        <Spinner
          v-if="mutation.isPending.value"
          aria-hidden="true"
        />
        {{ mutation.isPending.value ? 'Booking…' : error && !taken ? 'Try again' : 'Confirm' }}
      </Button>
    </div>
  </form>
</template>
