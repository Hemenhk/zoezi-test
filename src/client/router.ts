import { createRouter, createWebHistory } from 'vue-router';
import SearchPage from './pages/SearchPage.vue';
import BookingConfirmationPage from './pages/BookingConfirmationPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: SearchPage },
    { path: '/bookings/:id', component: BookingConfirmationPage },
  ],
});
