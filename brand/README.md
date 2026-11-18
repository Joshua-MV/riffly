# Riffly brand kit

Everything Riffly looks like, in one place: the logo, the colours and the type.

The app reads its colours from `frontend/src/theme/tokens.ts`. The colour files here are
generated from that file, so the two always match. To change a colour, edit `tokens.ts`, then run:

```
npm.cmd run brand
```

A test fails if the files here fall out of step with the app.

## Logo: "Ringing Lamp"

An amber pilot lamp with a guitar string ringing across it. Where the string crosses the lamp it
turns dark, so it reads as passing in front of the light.

| File | Use |
| --- | --- |
| `logo/riffly-icon.svg` | The app icon, 32 px and up (store listings, Start menu, splash) |
| `logo/riffly-icon-small.svg` | 24 px and below: the string rings once and the bezel drops away so it stays crisp |
| `logo/riffly-icon-512.png` | Ready-made 512 px PNG |
| `logo/riffly.ico` | Windows icon (small design at 16 and 24 px, full design above) |
| `logo/android-foreground.svg`, `android-background.svg` | Android adaptive icon layers |
| `logo/android-monochrome.svg` | Android themed (one-colour) icon |
| `logo/splash.svg` | Launch screen |

**Wordmark:** "rıffly" in Newsreader italic, with the amber lamp as the dot of the i. In the app
it's drawn by `frontend/src/components/layout/Logo.tsx` (`Wordmark`, `LogoMark`, `Logo`).

**Rules**
- Keep the lamp amber and the tile charcoal. Don't recolour, outline or add effects.
- Leave clear space around the mark of at least a quarter of its width.
- Only the launch screen animates the logo (the string rings once and settles).

## Colours: "The Practice Room"

Materials from the amp corner of a rehearsal room: charcoal tolex, ivory piping, olive and
terracotta grille cloth, and one amber pilot lamp.

| Brand colour | Hex | Meaning |
| --- | --- | --- |
| Studio Charcoal | `#252622` | The background |
| Warm Ivory | `#F2EEE4` | Text, strings |
| Vintage Amber | `#C58A45` | "Now": the current chord, beat, active string, the main button |
| Muted Olive | `#65745B` | In tune, done |
| Terracotta | `#A65D48` | Off pitch, errors |
| Stone Grey | `#77766F` | Quiet details |

**Rules**
- Amber always means "now" and is never decoration.
- Depth comes from tone steps between surfaces, not shadows.
- Screens use the named tokens (surface, text, accent…), never raw hex values.

The full dark and light theme tokens are in `colors.json` (for tools) and `colors.css` (CSS
variables, light theme under `[data-theme='light']`).

## Type

| Role | Font | Where |
| --- | --- | --- |
| Display titles | Newsreader 400 (and italic for the wordmark) | Screen titles like "Tuner" |
| Chords and headings | Geist 600 | Big chord names, headings |
| Body | Geist 400 / 500 | Everything you read |
| Labels and readouts | Geist Mono 400 / 500 | Engraved small-caps labels, Hz and cents readouts |

All three fonts are free (SIL Open Font License) and ship with the app.
