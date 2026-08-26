// SPDX-License-Identifier: MIT
/**
 * Industrial automation / DCS documentation index
 *
 * Covers distributed control systems (ABB Freelance, Siemens SIMATIC PCS 7,
 * Emerson DeltaV, Honeywell Experion PKS), the IEC 61131 programmable-
 * controller standards, ISA instrumentation/alarm/batch standards, and the
 * bulk-engineering workflow that generates controller configuration from
 * engineering data.
 *
 * Two things are unusual about this domain and shape the entries below:
 *
 * 1. **The standards are paid.** IEC and ISA publish no free full text, so the
 *    `url` is the official landing/abstract page for the standard. That is the
 *    correct upstream — not a mirror, and deliberately not one of the PDF
 *    copies floating around, which are unlicensed.
 * 2. **Some articles have no upstream at all.** The ABB `.dmf`/`.prt` record
 *    layouts are undocumented proprietary internals, `python-generation` is an
 *    in-house workflow, and `dcs-platforms/overview` is a four-way vendor
 *    comparison no vendor publishes. Those entries omit `url` rather than
 *    point at a loosely-related product page: they are served from the KB or
 *    not at all.
 */

import type { DocsRecord } from "./types.js";

export const INDUSTRIAL_TECHNOLOGIES = [
  "abb-freelance",
  "dcs-platforms",
  "iec61131",
  "isa-standards",
  "bulk-engineering",
] as const;

export const industrialDocs: DocsRecord = {
  "abb-freelance": {
    overview: {
      local: "abb-freelance/overview.md",
      url: "https://new.abb.com/control-systems/essential-automation/freelance",
    },
    // No url: ABB has never published the .dmf/.prt record layouts. They are
    // written and read only by Control Builder F, and the KB articles are
    // reverse-engineered field knowledge.
    "dmf-format": {
      local: "abb-freelance/dmf-format.md",
    },
    "prt-format": {
      local: "abb-freelance/prt-format.md",
    },
  },

  "dcs-platforms": {
    // No url: an author-written ABB/Siemens/Emerson/Honeywell comparison. No
    // vendor publishes a neutral four-way comparison, and picking one vendor's
    // page would misrepresent the article.
    overview: {
      local: "dcs-platforms/overview.md",
    },
    siemens: {
      local: "dcs-platforms/siemens.md",
      url: "https://www.siemens.com/global/en/products/automation/process-control/simatic-pcs-7.html",
    },
    // Covers DeltaV and Experion PKS roughly equally; DeltaV is the closer fit
    // for the article's first half.
    "emerson-honeywell": {
      local: "dcs-platforms/emerson-honeywell.md",
      url: "https://www.emerson.com/en-us/automation/deltav",
    },
  },

  // data-types and languages both document parts of the single IEC 61131-3
  // standard, so they share its landing page.
  iec61131: {
    "data-types": {
      local: "iec61131/data-types.md",
      url: "https://webstore.iec.ch/publication/4552",
    },
    languages: {
      local: "iec61131/languages.md",
      url: "https://webstore.iec.ch/publication/4552",
    },
    "plcopen-xml": {
      local: "iec61131/plcopen-xml.md",
      url: "https://www.plcopen.org/standards/logic/iec-61131-10/",
    },
  },

  "isa-standards": {
    "isa-5-1": {
      local: "isa-standards/isa-5-1.md",
      url: "https://www.isa.org/products/ansi-isa-5-1-2024-instrumentation-and-control-symb",
    },
    "isa-18-101": {
      local: "isa-standards/isa-18-101.md",
      url: "https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa18",
    },
    "isa-88-95": {
      local: "isa-standards/isa-88-95.md",
      url: "https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa88",
    },
  },

  "bulk-engineering": {
    "namur-ne150": {
      local: "bulk-engineering/namur-ne150.md",
      url: "https://www.namur.net/en/publications/news-archive/ne-150-is-newly-published.html",
    },
    // No url: in-house generation workflow (template conventions, chunking
    // heuristics, validation). The libraries it uses have docs; the workflow
    // itself has no upstream owner.
    "python-generation": {
      local: "bulk-engineering/python-generation.md",
    },
  },
};
