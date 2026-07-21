# Changelog


## [2.2.0](https://github.com/TableCrafter/tablecrafter.js/compare/v2.1.0...v2.2.0) (2026-07-21)


### Features

* **build:** add ./cells/* and ./cdn subpath exports per RFC (closes [#379](https://github.com/TableCrafter/tablecrafter.js/issues/379)) ([#381](https://github.com/TableCrafter/tablecrafter.js/issues/381)) ([c03465e](https://github.com/TableCrafter/tablecrafter.js/commit/c03465e2157fa05ebacbb09444a2645f3a4e9874))
* **editing:** bulk fill UI, bulk edit modal, edit diff badge (closes [#333](https://github.com/TableCrafter/tablecrafter.js/issues/333)) ([#389](https://github.com/TableCrafter/tablecrafter.js/issues/389)) ([3bbde33](https://github.com/TableCrafter/tablecrafter.js/commit/3bbde3327d8b745331e82dfec1c3b37ddb9ddc34))
* **editing:** undo/redo toast notification (closes [#332](https://github.com/TableCrafter/tablecrafter.js/issues/332)) ([#383](https://github.com/TableCrafter/tablecrafter.js/issues/383)) ([e28922f](https://github.com/TableCrafter/tablecrafter.js/commit/e28922f54d8e428244a806f160ce5a3af541ddf2))
* **filtering:** saved filter presets UI + URL pre-filtering (closes [#337](https://github.com/TableCrafter/tablecrafter.js/issues/337)) ([#386](https://github.com/TableCrafter/tablecrafter.js/issues/386)) ([e455e1d](https://github.com/TableCrafter/tablecrafter.js/commit/e455e1df953a343d30c4941afb93577f528e4b4e))
* **render:** per-column role gating + interactive column resize (closes [#338](https://github.com/TableCrafter/tablecrafter.js/issues/338)) ([#388](https://github.com/TableCrafter/tablecrafter.js/issues/388)) ([11712df](https://github.com/TableCrafter/tablecrafter.js/commit/11712df9ce3936fb06a05e7a1588acd0015f5cf9))
* **render:** real column pinning via sticky positioning (closes [#328](https://github.com/TableCrafter/tablecrafter.js/issues/328)) ([#384](https://github.com/TableCrafter/tablecrafter.js/issues/384)) ([48720ef](https://github.com/TableCrafter/tablecrafter.js/commit/48720efef1d9260c7c12ffcbed60746d61956cee))
* **render:** row UX batch — detail popup, row-link, auto-refresh, skeleton (closes [#335](https://github.com/TableCrafter/tablecrafter.js/issues/335)) ([#387](https://github.com/TableCrafter/tablecrafter.js/issues/387)) ([2bf0679](https://github.com/TableCrafter/tablecrafter.js/commit/2bf06796dc2899ec2202e3fe227b80202812db2d))
* **v3-render:** search highlighting and pagination controls ([#377](https://github.com/TableCrafter/tablecrafter.js/issues/377)) ([2fe128b](https://github.com/TableCrafter/tablecrafter.js/commit/2fe128be02ba3675e7b7581b79faae39ded36ae4))


### Bug Fixes

* **ci:** build-independent exports test + bump dom size budget ([#390](https://github.com/TableCrafter/tablecrafter.js/issues/390)) ([00215f2](https://github.com/TableCrafter/tablecrafter.js/commit/00215f2488dac95bffa94f39c811be7ca88c9936))

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
