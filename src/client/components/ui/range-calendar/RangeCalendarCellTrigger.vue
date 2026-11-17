<script lang="ts" setup>
import type { RangeCalendarCellTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { isSameDay } from '@internationalized/date'
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { RangeCalendarCellTrigger, useForwardProps } from 'reka-ui'
import { computed, inject } from 'vue'
import { buttonVariants } from '@/components/ui/button'
import { VENUE_TODAY } from '@/lib/venue-today'

const props = withDefaults(defineProps<RangeCalendarCellTriggerProps & { class?: HTMLAttributes['class'] }>(), {
  as: 'button',
})

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)

// Bug fix: Reka's data-today uses the browser clock. Mark the venue's "today" (meta.now) instead.
const venueToday = inject(VENUE_TODAY, undefined)
const isVenueToday = computed(() => !!venueToday?.value && isSameDay(props.day, venueToday.value))
</script>

<template>
  <RangeCalendarCellTrigger
    data-slot="range-calendar-trigger"
    :class="cn(
      buttonVariants({ variant: 'ghost' }),
      'h-11 w-11 p-0 md:h-8 md:w-8 font-normal data-[selected]:opacity-100',
      '[&[data-venue-today]:not([data-selected])]:bg-accent [&[data-venue-today]:not([data-selected])]:text-accent-foreground',
      // Selection Start
      'data-[selection-start]:bg-primary data-[selection-start]:text-primary-foreground data-[selection-start]:hover:bg-primary data-[selection-start]:hover:text-primary-foreground data-[selection-start]:focus:bg-primary data-[selection-start]:focus:text-primary-foreground',
      // Selection End
      'data-[selection-end]:bg-primary data-[selection-end]:text-primary-foreground data-[selection-end]:hover:bg-primary data-[selection-end]:hover:text-primary-foreground data-[selection-end]:focus:bg-primary data-[selection-end]:focus:text-primary-foreground',
      // Outside months
      'data-[outside-view]:text-muted-foreground',
      // Disabled
      'data-[disabled]:text-muted-foreground data-[disabled]:opacity-50',
      // Unavailable
      'data-[unavailable]:text-destructive-foreground data-[unavailable]:line-through',
      props.class,
    )"
    :data-venue-today="isVenueToday ? '' : undefined"
    v-bind="forwardedProps"
  >
    <slot />
  </RangeCalendarCellTrigger>
</template>
