<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class'], thumbLabelledby?: string, thumbValueText?: string }>()
const emits = defineEmits<SliderRootEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'thumbLabelledby', 'thumbValueText')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SliderRoot
    v-slot="{ modelValue }"
    data-slot="slider"
    :data-vertical="props.orientation === 'vertical' ? '' : undefined"
    :class="cn(
      'data-vertical:min-h-40 min-h-11 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
      props.class,
    )"
    v-bind="forwarded"
  >
    <SliderTrack
      data-slot="slider-track"
      :data-horizontal="props.orientation !== 'vertical' ? '' : undefined"
      :data-vertical="props.orientation === 'vertical' ? '' : undefined"
      class="bg-background border border-input rounded-full data-horizontal:h-2 data-vertical:w-1 relative grow overflow-hidden data-horizontal:w-full data-vertical:h-full"
    >
      <SliderRange
        data-slot="slider-range"
        :data-horizontal="props.orientation !== 'vertical' ? '' : undefined"
        :data-vertical="props.orientation === 'vertical' ? '' : undefined"
        class="bg-primary absolute select-none data-horizontal:h-full data-vertical:w-full"
      />
    </SliderTrack>

    <SliderThumb
      v-for="(_, key) in modelValue"
      :key="key"
      data-slot="slider-thumb"
      :aria-labelledby="props.thumbLabelledby"
      :aria-valuetext="props.thumbValueText"
      :data-vertical="props.orientation === 'vertical' ? '' : undefined"
      class="border-2 border-primary bg-background relative size-6 rounded-full transition-[color,box-shadow] after:absolute after:-inset-3 hover:ring-3 hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-hidden active:ring-3 active:ring-ring block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
