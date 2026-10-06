# Twill brand assets

The approved identity is a hovering hummingbird in **indigo `#6d5ce8`**. `twill-mark.svg` is the canonical vector; `twill-mark.png` is its transparent 512 × 512 export. Both preserve the approved silhouette. The manifest records the approved image checksum and tracing settings.

The documentation navigation, homepage, favicon, extension icon and package READMEs use this identity. The public README image is `https://twill.evecalm.com/logo.png`.

For readable text, the light theme uses `#6250d7`; the dark theme uses `#b5a8ff`. Primary buttons retain the brand indigo with white text and a darker hover state. Marketplace uses a dark violet banner, `#211b36`.

To refresh exports after editing the canonical vector, use Inkscape and ImageMagick:

```sh
inkscape assets/brand/twill-mark.svg --export-type=png --export-filename=assets/brand/twill-mark.png --export-width=512 --export-height=512
cp assets/brand/twill-mark.svg apps/docs/public/logo.svg
cp assets/brand/twill-mark.svg apps/docs/public/favicon.svg
cp assets/brand/twill-mark.png apps/docs/public/logo.png
cp assets/brand/twill-mark.png editors/vscode/assets/icon.png
magick assets/brand/twill-mark.png -resize 32x32 PNG32:apps/docs/public/favicon.png
magick assets/brand/twill-mark.png -resize 144x144 -background '#f4f2ff' -gravity center -extent 180x180 -alpha remove PNG24:apps/docs/public/apple-touch-icon.png
```

These tools are only needed to regenerate checked-in artwork; building and installing Twill does not require them.
