// SPDX-License-Identifier: MIT
/**
 * Infrastructure and DevOps documentation
 * Includes: Docker, Docker Compose, Kubernetes, GitHub Actions, Messaging systems
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
};
