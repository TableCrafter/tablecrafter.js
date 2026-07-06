# Changelog


## [2.1.0] - 2026-07-06

### Features

- Events API: on() / off() / once() emitter with 8 typed events (#324)
- Virtual scrolling wired into the render loop; bounded DOM for large datasets (#326)
- Formulas: comparison operators, IF, CONCAT, LENGTH, UPPER, LOWER, string literals (#114, #346)
- i18n: RTL layout, i18n.formats for locale-aware number/date, distinct aggregation, locale packs (#97, #327)
- Plugin lifecycle hooks wired: beforeLoad/afterLoad, destroy (#94, #345)
- Inline SVG heatmap cell type (#129)
- Context menu keyboard navigation (#107)
- aria-label parity for visual-only conditional formatting cues (#101)
- TableCrafter.bootstrap() declarative auto-init and getBrowserSupport() probe (#130, #134)
- snapshotHTML() deterministic DOM serialiser for testing (#133)
- Export peer deps declared: xlsx, jspdf, jspdf-autotable as optional (#325)
- CDN metadata: unpkg, jsdelivr, exports map, files (#127)
- Experimental: v3 headless architecture preview under subpath exports (tablecrafter/core, /sorting, /filtering, /render/dom and 22 more; see docs/RFC-v3.md)

