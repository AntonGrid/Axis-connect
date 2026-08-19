#!/usr/bin/env bash
# Генерация PWA-иконок из public/logo.svg через ImageMagick.
# Все размеры для manifest + apple-touch + maskable.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public

for size in 72 96 128 144 152 192 384 512; do
  convert -background none -density 96 public/logo.svg -resize "${size}x${size}" "public/icon-${size}.png"
done
# maskable-иконка: тёмный фон уже на всю площадь SVG (safe zone = центр 80%).
cp public/icon-512.png public/icon-maskable-512.png
convert -background none -density 96 public/logo.svg -resize 180x180 public/apple-touch-icon.png

echo "[icons] generated: 72/96/128/144/152/192/384/512 + maskable-512 + apple-touch"
