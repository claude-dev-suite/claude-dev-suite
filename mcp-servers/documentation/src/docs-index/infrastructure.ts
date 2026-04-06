// SPDX-License-Identifier: MIT
/**
 * Infrastructure and DevOps documentation
 * Includes: Docker, Docker Compose, Kubernetes, GitHub Actions, Messaging systems,
 * Nginx, SSL/TLS, Linux server administration, Firewall, DNS, systemd,
 * Caddy, Traefik, WireGuard, Monitoring, Backup, Performance, Hardening,
 * Email infrastructure, Zero-downtime deployment, Load balancing, WAF
 */

import type { DocsRecord } from "./types.js";

export const INFRASTRUCTURE_TECHNOLOGIES = [
  // Containers & Orchestration
  "docker",
  "docker-compose",
  "kubernetes",
  "github-actions",
  // Messaging
  "kafka",
  "rabbitmq",
  "activemq",
  "sqs",
  "redis-pubsub",
  "nats",
  "pulsar",
  "azure-service-bus",
  "google-pubsub",
  // Infrastructure patterns
  "terraform",
  "service-mesh",
  // Server administration & production ops
  "nginx",
  "caddy",
  "traefik",
  "ssl-tls",
  "linux-server",
  "firewall",
  "dns",
  "systemd",
  "wireguard",
  "server-monitoring",
  "backup-recovery",
  "server-performance",
  "server-hardening",
  "email-infrastructure",
  "zero-downtime-deploy",
  "load-balancer",
  "waf",
] as const;

export const infrastructureDocs: DocsRecord = {
  docker: {
    dockerfile: {
      local: "docker/dockerfile.md",
      url: "https://docs.docker.com/engine/reference/builder/",
    },
    compose: {
      local: "docker/compose.md",
      url: "https://docs.docker.com/compose/compose-file/",
    },
    "best-practices": {
      local: "docker/best-practices.md",
      url: "https://docs.docker.com/develop/develop-images/dockerfile_best-practices/",
    },
    production: {
      local: "docker/production.md",
      url: "https://docs.docker.com/config/containers/resource_constraints/",
    },
  },

  "docker-compose": {
    services: {
      local: "docker-compose/services.md",
      url: "https://docs.docker.com/compose/compose-file/05-services/",
    },
    commands: {
      local: "docker-compose/commands.md",
      url: "https://docs.docker.com/compose/reference/",
    },
  },

  kubernetes: {
    resources: {
      local: "kubernetes/resources.md",
      url: "https://kubernetes.io/docs/concepts/workloads/",
    },
    kubectl: {
      local: "kubernetes/kubectl.md",
      url: "https://kubernetes.io/docs/reference/kubectl/",
    },
    production: {
      local: "kubernetes/production.md",
      url: "https://kubernetes.io/docs/setup/production-environment/",
    },
  },

  "github-actions": {
    workflows: {
      local: "github-actions/workflows.md",
      url: "https://docs.github.com/en/actions/using-workflows",
    },
    actions: {
      local: "github-actions/actions.md",
      url: "https://docs.github.com/en/actions/creating-actions",
    },
    "ci-cd-patterns": {
      local: "github-actions/ci-cd-patterns.md",
      url: "https://docs.github.com/en/actions/deployment/about-deployments",
    },
  },

  // Messaging systems
  kafka: {
    basics: {
      local: "kafka/basics.md",
      url: "https://kafka.apache.org/documentation/",
    },
    producers: {
      local: "kafka/producers.md",
      url: "https://kafka.apache.org/documentation/#producerapi",
    },
    consumers: {
      local: "kafka/consumers.md",
      url: "https://kafka.apache.org/documentation/#consumerapi",
    },
    streams: {
      local: "kafka/streams.md",
      url: "https://kafka.apache.org/documentation/streams/",
    },
    connect: {
      local: "kafka/connect.md",
      url: "https://kafka.apache.org/documentation/#connect",
    },
    configuration: {
      local: "kafka/configuration.md",
      url: "https://kafka.apache.org/documentation/#configuration",
    },
    production: {
      local: "kafka/production.md",
      url: "https://kafka.apache.org/documentation/#operations",
    },
  },

  rabbitmq: {
    basics: {
      local: "rabbitmq/basics.md",
      url: "https://www.rabbitmq.com/tutorials/amqp-concepts.html",
    },
    exchanges: {
      local: "rabbitmq/exchanges.md",
      url: "https://www.rabbitmq.com/tutorials/tutorial-four-javascript.html",
    },
    production: {
      local: "rabbitmq/production.md",
      url: "https://www.rabbitmq.com/production-checklist.html",
    },
  },

  activemq: {
    basics: {
      local: "activemq/basics.md",
      url: "https://activemq.apache.org/components/artemis/documentation/",
    },
  },

  sqs: {
    basics: {
      local: "sqs/basics.md",
      url: "https://docs.aws.amazon.com/sqs/",
    },
  },

  "redis-pubsub": {
    basics: {
      local: "redis-pubsub/basics.md",
      url: "https://redis.io/docs/manual/pubsub/",
    },
  },

  nats: {
    basics: {
      local: "nats/basics.md",
      url: "https://docs.nats.io/",
    },
  },

  pulsar: {
    basics: {
      local: "pulsar/basics.md",
      url: "https://pulsar.apache.org/docs/",
    },
  },

  "azure-service-bus": {
    basics: {
      local: "azure-service-bus/basics.md",
      url: "https://docs.microsoft.com/azure/service-bus-messaging/",
    },
  },

  "google-pubsub": {
    basics: {
      local: "google-pubsub/basics.md",
      url: "https://cloud.google.com/pubsub/docs",
    },
  },

  // Infrastructure patterns
  terraform: {
    modules: {
      local: "terraform/modules.md",
      url: "https://developer.hashicorp.com/terraform/language/modules",
    },
    state: {
      local: "terraform/state.md",
      url: "https://developer.hashicorp.com/terraform/language/state",
    },
    workspaces: {
      local: "terraform/workspaces.md",
      url: "https://developer.hashicorp.com/terraform/language/state/workspaces",
    },
    providers: {
      local: "terraform/providers.md",
      url: "https://developer.hashicorp.com/terraform/language/providers",
    },
    "best-practices": {
      local: "terraform/best-practices.md",
      url: "https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices",
    },
  },

  // ─── Server Administration & Production Ops ───────────────────────────────

  nginx: {
    "complete-production-config": {
      local: "nginx/complete-production-config.md",
      url: "https://nginx.org/en/docs/",
    },
    "reverse-proxy-patterns": {
      local: "nginx/reverse-proxy-patterns.md",
      url: "https://nginx.org/en/docs/http/ngx_http_proxy_module.html",
    },
  },

  caddy: {
    caddyfile: {
      local: "caddy/caddyfile.md",
      url: "https://caddyserver.com/docs/caddyfile",
    },
    "automatic-https": {
      local: "caddy/automatic-https.md",
      url: "https://caddyserver.com/docs/automatic-https",
    },
  },

  traefik: {
    "docker-provider": {
      local: "traefik/docker-provider.md",
      url: "https://doc.traefik.io/traefik/providers/docker/",
    },
    middlewares: {
      local: "traefik/middlewares.md",
      url: "https://doc.traefik.io/traefik/middlewares/overview/",
    },
  },

  "ssl-tls": {
    "letsencrypt-complete-guide": {
      local: "ssl-tls/letsencrypt-complete-guide.md",
      url: "https://certbot.eff.org/docs/",
    },
    "tls-hardening": {
      local: "ssl-tls/tls-hardening.md",
      url: "https://ssl-config.mozilla.org/",
    },
  },

  "linux-server": {
    "initial-server-setup": {
      local: "linux/initial-server-setup.md",
      url: "https://ubuntu.com/server/docs",
    },
    "ssh-hardening": {
      local: "linux/ssh-hardening.md",
      url: "https://www.ssh.com/academy/ssh/sshd_config",
    },
    "systemd-complete-guide": {
      local: "linux/systemd-complete-guide.md",
      url: "https://systemd.io/",
    },
  },

  firewall: {
    "ufw-fail2ban-guide": {
      local: "firewall/ufw-fail2ban-guide.md",
      url: "https://help.ubuntu.com/community/UFW",
    },
  },

  dns: {
    "complete-dns-guide": {
      local: "dns/complete-dns-guide.md",
      url: "https://developers.cloudflare.com/dns/",
    },
  },

  systemd: {
    "unit-files": {
      local: "linux/systemd-complete-guide.md",
      url: "https://www.freedesktop.org/software/systemd/man/systemd.unit.html",
    },
  },

  wireguard: {
    "server-setup": {
      local: "wireguard/server-setup.md",
      url: "https://www.wireguard.com/quickstart/",
    },
  },

  "server-monitoring": {
    "prometheus-grafana-setup": {
      local: "monitoring/prometheus-grafana-setup.md",
      url: "https://prometheus.io/docs/",
    },
  },

  "backup-recovery": {
    "production-backup-strategy": {
      local: "backup/production-backup-strategy.md",
      url: "https://rclone.org/docs/",
    },
  },

  "server-performance": {
    "linux-performance-tuning": {
      local: "linux/performance-tuning.md",
      url: "https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt",
    },
  },

  "server-hardening": {
    "cis-benchmark": {
      local: "linux/server-hardening.md",
      url: "https://www.cisecurity.org/cis-benchmarks/",
    },
  },

  "email-infrastructure": {
    "dns-email-auth": {
      local: "email/email-infrastructure.md",
      url: "https://www.dmarcanalyzer.com/",
    },
  },

  "zero-downtime-deploy": {
    patterns: {
      local: "deployment/zero-downtime-patterns.md",
      url: "https://martinfowler.com/bliki/BlueGreenDeployment.html",
    },
  },

  "load-balancer": {
    nginx: {
      local: "nginx/reverse-proxy-patterns.md",
      url: "https://nginx.org/en/docs/http/ngx_http_upstream_module.html",
    },
    haproxy: {
      local: "load-balancer/haproxy.md",
      url: "https://www.haproxy.org/download/2.8/doc/configuration.txt",
    },
  },

  waf: {
    "modsecurity-crs": {
      local: "waf/modsecurity.md",
      url: "https://coreruleset.org/docs/",
    },
    "cloudflare-waf": {
      local: "waf/cloudflare-waf.md",
      url: "https://developers.cloudflare.com/waf/",
    },
  },

  "service-mesh": {
    istio: {
      local: "service-mesh/istio.md",
      url: "https://istio.io/latest/docs/",
    },
    linkerd: {
      local: "service-mesh/linkerd.md",
      url: "https://linkerd.io/2/overview/",
    },
    mtls: {
      local: "service-mesh/mtls.md",
      url: "https://istio.io/latest/docs/concepts/security/#mutual-tls-authentication",
    },
    "traffic-management": {
      local: "service-mesh/traffic-management.md",
      url: "https://istio.io/latest/docs/concepts/traffic-management/",
    },
  },
};
