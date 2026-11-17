<script setup lang="ts">
// TEMPORARY (R0): token check page at /kit, not linked anywhere. Removed in R1.
import { shallowRef } from 'vue';
import { CalendarDate, type DateValue } from '@internationalized/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';

const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
const day = shallowRef<DateValue>(new CalendarDate(2026, 10, 22));
</script>

<template>
  <div class="flex flex-col gap-8">
    <h1 class="text-3xl font-semibold">Kit (temporary)</h1>

    <section class="flex flex-wrap gap-2" aria-label="Buttons">
      <Button v-for="v in variants" :key="v" :variant="v">{{ v }}</Button>
      <Button disabled>disabled</Button>
    </section>

    <section class="flex max-w-sm flex-col gap-2">
      <Label for="kit-input">Input</Label>
      <Input id="kit-input" placeholder="Jane Doe" />
      <Label for="kit-select">Select</Label>
      <Select default-value="10">
        <SelectTrigger id="kit-select" class="w-full"><SelectValue placeholder="Distance" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="5">5 km</SelectItem>
          <SelectItem value="10">10 km</SelectItem>
          <SelectItem value="25">25 km</SelectItem>
        </SelectContent>
      </Select>
    </section>

    <Card class="max-w-md">
      <CardHeader>
        <CardTitle>Klassisk massage</CardTitle>
        <CardDescription>Salongens Massage</CardDescription>
      </CardHeader>
      <CardContent class="flex gap-2">
        <Badge>default</Badge>
        <Badge variant="secondary">secondary</Badge>
        <Badge variant="outline">outline</Badge>
        <Badge variant="destructive">destructive</Badge>
      </CardContent>
    </Card>

    <Tabs default-value="a" class="max-w-md">
      <TabsList>
        <TabsTrigger value="a">Fri 23</TabsTrigger>
        <TabsTrigger value="b">Sat 24</TabsTrigger>
        <TabsTrigger value="c" disabled>Sun 25</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Times for Friday</TabsContent>
      <TabsContent value="b">Times for Saturday</TabsContent>
    </Tabs>

    <Calendar v-model="day" class="w-fit rounded-lg border" />
  </div>
</template>
