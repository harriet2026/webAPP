# Country flag sprite

`flags-4x3.png` is generated from the 4x3 SVG assets in `lipis/flag-icons` 7.3.2.
The 26 × 26 sprite is ordered by ISO alpha-2 code: first letter selects the row,
second letter selects the column. Every SVG must be rendered into an exact 48 × 36
pixel cell before composition; composing the SVGs at their native rendered sizes
allows them to overflow their cells and breaks the CSS background positions.

Source SVGs are MIT licensed; the license text is retained in
`LICENSE.flag-icons`.
