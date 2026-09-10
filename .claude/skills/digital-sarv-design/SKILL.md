---
name: digital-sarv-design
description: Design system and UI rules for the Digital Sarv (دیجیتال سرو) web app — Persian RTL, Vazirmatn, role color themes, gradient icon badges, pill controls, Persian numerals. Use whenever building or changing any screen or component in apps/web (landing, customer app, courier app, admin panel) so it matches the Claude Design prototype in design/digital-sarv.dc.html.
---

# Digital Sarv design system

The prototype (`design/digital-sarv.dc.html`) is the reference. Everything is inline-styled there; this skill distills it into tokens and recipes. When unsure, grep the prototype for the screen's Persian label and copy its values.

## Foundations

- **Direction**: RTL. `<html dir="rtl" lang="fa">`. Logical utilities only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Chevrons that mean "forward/next" point **left** (`<` shape, lucide `ChevronLeft`); "back" points right.
- **Font**: Vazirmatn 400/500/700/800/900 (`@fontsource/vazirmatn`). Headings weight 900, letter-spacing -0.02em. Labels 800, body 400–600.
- **Numbers**: always Persian digits in UI (`fa(n)` → `toLocaleString('fa-IR')`), money as `money(n)` → `"۲۸٬۰۰۰ تومان"`. Phones/codes/hex shown `dir="ltr"`.
- **Radius**: pills (`rounded-full`) for every button, input, chip and tag. Cards 20–22px (`rounded-[22px]`), big panels 26–30px, icon buttons 13px, badges ≈ 0.34 × size.
- **Shadows**: colored glows under primary buttons: `0 10px 22px rgba(47,109,246,0.4)` (use the role accent). Cards are flat: white + `1px solid #dfe5f2`.
- **Icons**: lucide-react, stroke 2.3–2.6, rounded caps. Inside gradient badges use white.

## Palette (CSS variables in `src/index.css`)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0f1320` | text |
| `--night` | `#07090f` | top bar, dark cards, totals panels, admin sidebar, table header |
| `--night-2` | `#1c2233` | hover on night, active tab bg |
| `--muted` | `#4a5268` / `#6b7488` | secondary / tertiary text |
| `--line` | `#dfe5f2` | card borders; `#eef2fb` inner dividers; `#cfd8ec` input borders |
| `--shell` | `#eef2fb` | page background (customer/landing) |
| blue | `#2f6df6` / dark `#1b45b8` / soft `#e3ecff` | customer + landing accent |
| green | `#1fa968` / `#14764a` / `#d7f4e6` (ink `#0d5334`) | courier accent, success, switches ON |
| violet | `#7c5cf5` / `#4c31b8` / `#ebe5ff` | admin accent, campaign |
| cyan | `#0fa9bd` / `#0b7686` / `#d6f4f8` (ink `#0b5a66`) | documents |
| amber | `#ef9d0c` / `#a86a05` / `#fdeecd` (ink `#5c4306`) | cartridge, membership |
| pink | `#ea5399` / `#a82c69` / `#ffe1ef` (ink `#7c1f4d`) | delete, mismatch, profile |

**Role themes** (`data-role` on the surface root sets `--accent`, `--accent-dark`, `--accent-soft`, `--accent-soft-ink`, `--shell`, `--glow`):
landing/customer = blue, shell `#eef2fb` · courier = green, shell `#ecf6f0` · admin = violet, shell `#f2effc`.

## Recipes

- **GradientBadge** `(tone, size)`: `linear-gradient(160deg, light 0%, base 55%, dark 100%)`, radius `round(size*0.34)`, shadow `0 size*.18 size*.42 glow, inset 0 1.5px 0 rgba(255,255,255,.55)`, white icon. Tones: blue `#7ea6ff,#2f6df6,#1b45b8` · cyan `#7be0ec,#0fa9bd,#0b7686` · violet `#b9a4ff,#7c5cf5,#4c31b8` · amber `#ffd27a,#ef9d0c,#a86a05` · green `#79e0b0,#1fa968,#14764a` · pink `#ffa8cf,#ea5399,#a82c69` · ink `#5b6480,#1c2233,#07090f`.
- **Logo**: the owner's cypress mark (serrated سرو tree + trunk + two arcs), source `design/v2/assets/logo-source.png`, vector in `src/components/brand/logo-path.ts` / `public/icons/logo.svg`, brand green **#008951**. In UI: `<TreeIcon>` (filled, `currentColor`, `size` = height, aspect 122:212) — white inside the green GradientBadge tile (`<Logo>`), green on light backgrounds. App icons/favicons: green mark on white. Never redraw or substitute the mark with a generic tree icon.
- **Primary button**: `rounded-full bg-[--accent] text-white font-extrabold py-[17px] text-[16.5px] shadow-[0_10px_22px_var(--glow)] hover:bg-[--accent-dark]` full-width on mobile screens.
- **Soft button**: `bg-[--accent-soft] text-[--accent-soft-ink]`. **Outline**: white + `1.5px #dfe5f2`, hover `#e3ecff`.
- **Chip (option)**: pill, `11px 16px`, 13px/700. Selected → accent bg, white text, glow. Unselected → white, `#3a4257`, border `#cfd8ec`.
- **Switch**: 52×30 pill, ON `#1fa968`, OFF `#c3cadd`, 24px white knob. (RTL: knob sits at the start when off.)
- **Stepper**: soft-colored 44px squares (radius 15) with − / + and a centered 900-weight number, inside a white pill row.
- **Totals panel**: `bg-[--night] text-white rounded-[22px] p-4`; small labels `#9aa2b8`; amount 900 weight 22px.
- **Info banner**: soft background, soft-ink text, 13px/600-700, radius 22.
- **Status tag**: pill 11–11.5px/800 with tone soft bg + tone ink.
- **Admin table**: white card radius 26, header row `bg-[--night]` text `#c9bcff` 12.5px/800, rows `border-t #eef2fb`, 13.5px.
- **KPI tile**: tone soft bg, tone ink text, label 12.5 opacity .8, value 24/900, delta 11.5/800.
- **Toast**: black pill at bottom center (`sonner` styled: `#07090f`, white, 14px/700, radius 999).
- **App shell** (customer / courier — v2 design): full-screen PWA. Page backdrop `#0f1320` (customer) / `#07120c` (courier); centred column `w-full max-w-[520px] h-dvh overflow-hidden` on the role shell colour; top spacer `calc(env(safe-area-inset-top) + 14px)`; bottom tab bar `bg-[--night]` with padding-bottom `calc(env(safe-area-inset-bottom) + 16px)`, active tab `#1c2233` + light accent icon (`#7ea6ff` customer, `#79e0b0` courier). No iPhone frame, no side panel.
- **Production column** (admin): tinted card per tone (`soft` bg, `ink` text), radius 22, header label + white/72% count pill, items as white/72% rounded-14 chips 12px.
- **CMS section card**: on → white + `#dfe5f2` border, badge = accent soft; off → `#e7ebf5` bg, badge `#d7dce8` / `#6b7488`. **Notification channel chip**: پیامک = blue soft/ink, پوش = violet soft/ink.
- Delivery app brand name is **«سرو پیک»**; customer app «دیجیتال سرو»; admin «دیجیتال سرو | ادمین».

## Copy

Use the prototype's Persian strings verbatim (titles, button labels, notes, toasts). Toast after every mutation ("تغییرات ذخیره شد", "… حذف شد").

## Don't

- No left/right physical utilities, no Latin digits in Persian text, no default shadcn neutral look (grey borders, square-ish radius), no new colors outside the palette, no Organic `_ds` fonts (Caprasimo/Figtree).
