<template>
  <BasicLayout v-if="$route.name !== 'chart'" />
  <RouterView v-if="$route.name === 'chart'" />
</template>

<script setup lang="ts">
import BasicLayout from "../src/layouts/BasicLayout.vue";
</script>

<style></style>
