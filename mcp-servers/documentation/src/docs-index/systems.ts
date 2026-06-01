// SPDX-License-Identifier: MIT
/**
 * Low-level / systems architecture documentation
 * Backs the `systems/` skill pack used by the architect agent.
 */

import type { DocsRecord } from "./types.js";

export const SYSTEMS_TECHNOLOGIES = [
  "os-kernel-architecture",
  "embedded-rtos",
  "systems-networking",
  "storage-engines",
  "distributed-consensus",
  "virtualization",
  "hardware-aware-design",
  "data-intensive",
  "security-architecture",
] as const;

export const systemsDocs: DocsRecord = {
  "os-kernel-architecture": {
    "kernel-structures": {
      local: "os-kernel-architecture/kernel-structures.md",
      url: "https://en.wikipedia.org/wiki/Microkernel",
    },
  },
  "embedded-rtos": {
    "real-time-scheduling": {
      local: "embedded-rtos/real-time-scheduling.md",
      url: "https://www.freertos.org/implementation/a00004.html",
    },
  },
  "systems-networking": {
    "kernel-bypass": {
      local: "systems-networking/kernel-bypass.md",
      url: "https://www.dpdk.org/about/",
    },
  },
  "storage-engines": {
    "btree-vs-lsm": {
      local: "storage-engines/btree-vs-lsm.md",
      url: "https://www.cs.umb.edu/~poneil/lsmtree.pdf",
    },
  },
  "distributed-consensus": {
    "consensus-protocols": {
      local: "distributed-consensus/consensus-protocols.md",
      url: "https://raft.github.io/raft.pdf",
    },
  },
  virtualization: {
    "isolation-models": {
      local: "virtualization/isolation-models.md",
      url: "https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md",
    },
  },
  "hardware-aware-design": {
    "memory-hierarchy": {
      local: "hardware-aware-design/memory-hierarchy.md",
      url: "https://www.akkadia.org/drepper/cpumemory.pdf",
    },
  },
  "data-intensive": {
    "warehouse-vs-lakehouse": {
      local: "data-intensive/warehouse-vs-lakehouse.md",
      url: "https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf",
    },
  },
  "security-architecture": {
    "threat-modeling": {
      local: "security-architecture/threat-modeling.md",
      url: "https://owasp.org/www-community/Threat_Modeling",
    },
  },
};
