<template>
  <a-layout class="option-style">
    <a-layout-content class="content-option-style">{{ props.name }}</a-layout-content>
    <a-layout-sider class="sider-option-style">{{ props.shortcut }}</a-layout-sider>
  </a-layout>
</template>

<script setup>
const props = defineProps({
  name: { type: String, required: true },
  shortcut: { type: String, required: true }
});
</script>

<style scoped>
.option-style {
  display: flex;
  align-items: center;
  background-color: #ffffff !important;
}

.content-option-style {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ffffff !important;
  text-align: center;
  width: 53px !important;
  max-width: 53px !important;
  min-width: 53px !important;
  //height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
  border-right: none;
}

.sider-option-style {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ffffff !important;
  text-align: center;
  width: 53px !important;
  max-width: 53px !important;
  min-width: 53px !important;
  //height: 53px !important;
  font: 13px sans-serif;
  border-bottom: none;
  border-right: none;
}
</style>
