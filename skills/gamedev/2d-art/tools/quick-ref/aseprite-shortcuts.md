# Aseprite shortcuts cheat sheet

## Tools (single-key)

```
B   Pencil
E   Eraser
G   Bucket fill
M   Marquee (rectangular select)
T   Text
H   Hand (pan)
Z   Zoom
I   Eyedropper / color picker
W   Magic wand (fill select)
L   Line (drag from anchor)
U   Rectangle outline
O   Ellipse / circle
J   Jumble / shuffle (stipple)
K   Slice tool (define hitbox / region)
N   Spray
F   Brightness/contrast adjust (rare)
```

## Painting

```
[ / ]               Decrease / increase brush size
Shift + click       Line from last click position
X                   Swap fg / bg color
D                   Reset fg = black, bg = white
Alt + drag (any tool) Eyedropper temporarily
Ctrl + drag         Move marquee selection (cut)
Ctrl + Alt + drag   Copy + move (clone)
```

## Selection

```
Ctrl + A    Select all
Ctrl + D    Deselect
Ctrl + I    Invert selection
Shift +     Add to selection (drag with marquee)
Alt +       Subtract from selection
Ctrl + T    Transform (free-form rotate / scale)
```

## Frames + animation

```
Alt + ,     Previous frame
Alt + .     Next frame
Alt + N     New frame
Alt + B     Duplicate frame
Alt + Backspace   Delete frame
Enter       Play / pause animation
F           Onion skin toggle
```

In timeline:
```
Click frame number     Move to that frame
Click duration ("100")  Edit duration in ms
Right-click frame       Frame properties (looping, tag association)
```

## Layers

```
Shift + N         New layer
Ctrl + Shift + L  Lock layer
Visibility eye    Toggle layer visibility
Alt + click eye   Solo layer (hide others)
Ctrl + Drag      Reorder layers
```

## Tags (animation regions)

```
Right-click tags row → New Tag
  - Range: F1-F8
  - Direction: Forward / Reverse / Ping-Pong / Ping-Pong Reverse
  - Repeat: 0 (infinite) or N times
```

Tags export to JSON sidecar; engines read them as named animation clips.

## Onion skin

```
F                  Toggle onion skin on/off
View → Onion Skin: 
  Show next       (frame after)
  Show previous   (frame before)
  Range           (how many frames in each direction)
  Opacity         (transparency of onion frames)
```

Critical for verifying loop continuity (F8 → F1 should flow).

## Sprite sheets export

```
File → Export Sprite Sheet
Layout:
  Type: Horizontal / Vertical / Rows / Columns / By Tag
  Border padding (inside-each-frame)
  Inner padding (between-frames)
  Trim: empty cells
JSON Data: yes (Aseprite format / Array)
  Hash / Array (Aseprite Importer needs Hash)
```

## Indexed mode (for palette swaps)

```
Sprite → Color Mode → Indexed
Now palette is fixed; replace any color by editing palette
```

Edit palette: View → Color Window → adjust values, save palette `.gpl`.

## Tilemap mode (since v1.3)

```
Layer right-click → New → Tilemap layer
Edit tileset: tilemap layer → Show tileset window
Paint tile: pick from tileset window, click in canvas
```

Tileset is reusable across layers / projects.

## Batch operations via CLI

```bash
# Export PNG from .ase
aseprite -b sprite.ase --save-as sprite.png

# Export sprite sheet + JSON
aseprite -b sprite.ase \
  --sheet sheet.png \
  --data sheet.json \
  --format json-array \
  --filename-format '{tag}_{frame}'

# Multi-file batch
aseprite -b *.ase --save-as ./png/{title}.png

# Specific tag only
aseprite -b sprite.ase --tag "walk" --save-as walk.png
```

## Lua scripting

```
File → Scripts → Open Scripts Folder
```
Place `.lua` files here. Restart Aseprite. They appear in the menu.

## Useful scripts

- **Layer Generators**: split sprite into layers automatically.
- **Auto-tile generators**: generate Wang/blob tilesets from base.
- **Palette generators**: extract palette from image.
- **Sprite sheets with custom layouts**.

Browse [github.com/aseprite/api](https://github.com/aseprite/api) and
the Aseprite Discord scripts channel for community scripts.
