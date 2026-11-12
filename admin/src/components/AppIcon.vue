<script setup>
defineProps({ name: String })
const paths = {
  reports: 'M4 4h16v12H8l-4 4V4Z M8 8h8 M8 12h5',
  cancellations: 'M8 4H4v4 M4 4l5 5 M16 20h4v-4 M20 20l-5-5 M20 4l-6 6 M4 20l6-6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  actions: 'M9 3H5v18h14V3h-4 M9 2h6v4H9V2Z M8 11h8 M8 16h5',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1',
  copy: 'M9 9h11v11H9V9Z M5 15H3V3h12v2',
  check: 'm5 12 4 4L19 6',
  exit: 'M9 3H4v18h5 M13 7l5 5-5 5 M8 12h12',
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  arrow: 'm9 5 7 7-7 7'
}
</script>
<template><svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.actions" /></svg></template>
