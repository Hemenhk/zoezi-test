import type { InjectionKey, Ref } from 'vue';
import type { DateValue } from '@internationalized/date';

/**
 * The calendar's "today", provided by the search form from `meta.now`. Reka UI marks "today" from
 * the browser's clock, which CLAUDE.md forbids, so the range calendar's cell trigger reads this instead.
 */
export const VENUE_TODAY: InjectionKey<Ref<DateValue | undefined>> = Symbol('venue-today');
