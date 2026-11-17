import { createRouter, createWebHistory } from 'vue-router';
import SearchPage from './pages/SearchPage.vue';
import BookingConfirmationPage from './pages/BookingConfirmationPage.vue';
import KitPage from './pages/KitPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: SearchPage },
    { path: '/bookings/:id', component: BookingConfirmationPage },
    { path: '/kit', component: KitPage }, // temporary (R0), removed in R1
  ],
});
