<!--
  製品のロゴ。アプリの上部バーと同じ、重なった3枚の層の印と「mado ML Tracking」（madoは通常の太さ、
  ML Trackingは太字）。上の層は強調色の線（product-mark-accent）、下の2枚は文字色の線
  （product-mark-base）で、線の太さと色はデザインシステムのdocs.cssが決める。
-->
<template>
  <span class="product-logo">
    <svg class="product-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="product-mark-base" d="M3 12.25L12 16.75L21 12.25" />
      <path class="product-mark-base" d="M3 16.75L12 21.25L21 16.75" />
      <path class="product-mark-accent" d="M12 2.75L21 7.25L12 11.75L3 7.25Z" />
    </svg>
    <span><span class="product-prefix">mado</span> <strong>ML Tracking</strong></span>
  </span>
</template>
