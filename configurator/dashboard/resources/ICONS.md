# Build Icons

Place the following icon files in this directory before building:

| Platform | File | Size | Format |
|----------|------|------|--------|
| Linux | `icon.png` | 512x512 | PNG |
| Windows | `icon.ico` | Multi-size | ICO |
| macOS | `icon.icns` | Multi-size | ICNS |

## Quick Generation (ImageMagick)

```bash
# From a 512x512 source PNG
convert icon-source.png -resize 512x512 icon.png

# Windows ICO (multiple sizes)
convert icon-source.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# macOS ICNS
mkdir icon.iconset
for size in 16 32 64 128 256 512; do
  convert icon-source.png -resize ${size}x${size} icon.iconset/icon_${size}x${size}.png
  convert icon-source.png -resize $((size*2))x$((size*2)) icon.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

## Online Tools

- [CloudConvert](https://cloudconvert.com/) - PNG to ICO/ICNS
- [iConvert Icons](https://iconverticons.com/) - Multi-platform conversion
