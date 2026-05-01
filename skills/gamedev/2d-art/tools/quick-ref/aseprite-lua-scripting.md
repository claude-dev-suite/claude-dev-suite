# Aseprite Lua scripting reference

Aseprite has a full Lua API for automation, custom tools, and batch
operations. Scripts go in `Aseprite/scripts/` (location varies by OS:
File → Scripts → Open Scripts Folder).

## API basics

```lua
-- Access active sprite
local sprite = app.activeSprite
if not sprite then
    app.alert("No sprite open")
    return
end

-- Iterate frames
for f = 1, #sprite.frames do
    app.activeFrame = f
    -- do something on each frame
end

-- Iterate layers
for _, layer in ipairs(sprite.layers) do
    print(layer.name)
end
```

## Common operations

### Export each frame as separate PNG
```lua
local sprite = app.activeSprite
local dir = app.fs.filePath(sprite.filename) .. "/export/"
for i = 1, #sprite.frames do
    app.activeFrame = i
    app.command.SaveCopyAs {
        ['filename'] = dir .. string.format("frame_%03d.png", i),
    }
end
```

### Export each tag as separate sprite sheet
```lua
local sprite = app.activeSprite
for _, tag in ipairs(sprite.tags) do
    app.command.ExportSpriteSheet {
        type = SpriteSheetType.HORIZONTAL,
        textureFilename = tag.name .. ".png",
        dataFilename = tag.name .. ".json",
        dataFormat = SpriteSheetDataFormat.JSON_HASH,
        tagName = tag.name,
    }
end
```

### Replace color across all frames
```lua
local sprite = app.activeSprite
local oldColor = Color { r=255, g=0, b=0, a=255 }
local newColor = Color { r=0, g=255, b=0, a=255 }

for f = 1, #sprite.frames do
    app.activeFrame = f
    for _, layer in ipairs(sprite.layers) do
        if layer.isImage then
            local cel = layer:cel(f)
            if cel then
                local img = cel.image:clone()
                for it in img:pixels() do
                    if it() == oldColor.rgbaPixel then
                        it(newColor.rgbaPixel)
                    end
                end
                cel.image = img
            end
        end
    end
end
```

### Generate palette swap variants
```lua
-- For an indexed-mode sprite, swap palette and re-export
local sprite = app.activeSprite
local variants = {
    "red.gpl",
    "blue.gpl",
    "green.gpl",
}

for _, palette_file in ipairs(variants) do
    -- Load palette
    local pal = Palette { fromFile = palette_file }
    sprite:setPalette(pal)
    -- Export
    app.command.SaveCopyAs {
        filename = "out_" .. palette_file:gsub(".gpl", ".png"),
    }
end
```

## Custom tools (dialog UI)

```lua
local dlg = Dialog("Custom Tool")
dlg:label { id = "info", label = "Info:", text = "This is a tool." }
   :slider { id = "size", label = "Size:", min = 1, max = 20, value = 5 }
   :color { id = "color", label = "Color:", color = Color(255, 0, 0) }
   :button { id = "apply", text = "Apply" }
   :button { id = "cancel", text = "Cancel" }
   :show { wait = true }

local data = dlg.data
if data.apply then
    local size = data.size
    local color = data.color
    -- Use these in your operation
end
```

## File system operations

```lua
local path = app.fs.filePath(app.activeSprite.filename)
local files = app.fs.listFiles(path)
for _, f in ipairs(files) do
    if app.fs.fileExtension(f) == "ase" then
        app.open(path .. "/" .. f)
        -- ... operations on this file ...
    end
end
```

## CLI integration

You can run scripts from the command line:
```bash
aseprite -b -script my-script.lua [-script-param key=value]
```

`-b` = batch mode (no GUI). Useful for automation.

## Useful scripts to start with

(Available in the Aseprite community / GitHub):

- **AutoTile / Wang generator**: generates 16-tile or 47-tile autotile
  from a base tile.
- **Sprite sheet by row**: arrange frames in rows/columns of N.
- **Palette extractor**: get the unique colors from a sprite.
- **Pixel-perfect outline generator**: add outline of color X around
  every non-transparent pixel.
- **Onion skin renderer**: bake onion-skinned image for documentation.
- **Frame timing batch editor**: set all frames to N ms.

## API reference

[github.com/aseprite/api](https://github.com/aseprite/api) — official
LuaJIT API docs.

Common modules:
- `app.*` — application-level (active sprite, frame, etc.).
- `app.command.*` — invoke menu commands programmatically.
- `app.fs.*` — file system.
- `Color {}`, `Point {}`, `Size {}`, `Rectangle {}` — value constructors.
- `Image:pixels()` — iterate pixels.
- `Sprite:newCel(layer, frame, image)` — create cel.
- `Layer:cel(frame)` — get cel.

## Performance tips

- **Batch image operations** by cloning cel.image, modifying, then
  re-assigning to cel. Don't modify pixel-by-pixel directly on the
  cel image (slow + UI updates).
- **Suppress UI updates** during long ops: `app.refresh()` only at the
  end.
- **Use local variables**: Lua local access is faster than table
  lookups.

## Common bugs

- **Modifying cel.image directly during iteration**: clone first.
- **Forgetting to call app.refresh()**: changes don't show in UI until
  you do.
- **Path separators**: use `/` cross-platform; Aseprite normalizes.
- **Color comparison**: `color1 == color2` doesn't always work; compare
  `.rgbaPixel`.

## See also

- [aseprite-shortcuts.md](aseprite-shortcuts.md)
- [ldtk-vs-tiled.md](ldtk-vs-tiled.md)
- Aseprite community Discord scripting channel.
