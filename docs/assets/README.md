# Логотип BilimLens

`bilimlens-logo.png` — оригинальный файл, предоставленный владельцем проекта. Он сохранён без изменений.

Производные для приложения подготовлены из этого же изображения без перерисовки и изменения цветов:

- `public/brand/bilimlens-logo.png` — полная надпись со знаком, без лишних полей, 782×189 пикселей;
- `src/app/icon.png` — знак с лупой, книгой и столбцами на белом фоне, 256×256;
- `src/app/favicon.ico` — тот же знак в размерах 16×16, 32×32 и 48×48.

Для тёмной боковой панели полная версия размещается на белой подложке. В мобильной шапке используется компактный размер без подписи. Next.js подключает иконки через файловые соглашения App Router.

Воспроизведение файлов с помощью ImageMagick из корня репозитория:

```bash
magick docs/assets/bilimlens-logo.png -crop 1955x473+110+128 +repage -resize 782x public/brand/bilimlens-logo.png
magick docs/assets/bilimlens-logo.png -crop 472x472+110+128 +repage -background white -alpha remove -alpha off -resize 256x256 src/app/icon.png
magick src/app/icon.png -define icon:auto-resize=48,32,16 src/app/favicon.ico
```

Обложка `readme-cover.svg` содержит оригинальное изображение и подписи README. Она не является скриншотом приложения.
