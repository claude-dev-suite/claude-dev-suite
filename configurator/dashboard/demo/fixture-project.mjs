// SPDX-License-Identifier: MIT
/**
 * The project the demo is recorded against.
 *
 * Deliberately a monorepo with two different toolchains: a React/Vite frontend
 * and a Spring Boot backend, plus Postgres in compose. Detection then has
 * something real to say, and the subproject scan is visible for free — which is
 * the single most legible moment in the whole wizard and the one the README GIF
 * is built around.
 *
 * Nothing here is written to the repository. It lives outside the tree and is
 * recreated from scratch on every run, so the recording is deterministic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};

const json = (o) => JSON.stringify(o, null, 2) + '\n';

/**
 * Where the fixture lives.
 *
 * Deliberately NOT `os.tmpdir()`: on Windows that resolves under
 * `C:\Users\<name>\AppData\Local\Temp`, and the wizard renders the path it was
 * given, so the maintainer's username would be burned into the README GIF. The
 * v1.16.0 privacy sweep removed exactly that class of leak from tracked files;
 * a generated asset must not put it back.
 *
 * `C:\Users\Public` on Windows and `/tmp` elsewhere are writable without
 * elevation and contain no personal identifier.
 */
function demoRoot() {
  const base = process.platform === 'win32' ? 'C:\\Users\\Public' : '/tmp';
  return path.join(base, 'dev-suite-demo');
}

export function createDemoProject(targetDir) {
  const dir = targetDir ?? path.join(demoRoot(), 'storefront');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // ── root: an npm workspace, so the monorepo detector has a marker ──────
  write(
    path.join(dir, 'package.json'),
    json({
      name: 'storefront',
      private: true,
      workspaces: ['web'],
    })
  );

  // ── web: React 19 + Vite + Tailwind + TanStack Query + Vitest ──────────
  write(
    path.join(dir, 'web', 'package.json'),
    json({
      name: '@storefront/web',
      version: '1.4.0',
      type: 'module',
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@tanstack/react-query': '^5.62.0',
        'react-router-dom': '^7.1.0',
      },
      devDependencies: {
        vite: '^7.0.0',
        typescript: '^5.7.0',
        tailwindcss: '^4.0.0',
        vitest: '^5.0.0',
        '@playwright/test': '^1.62.0',
      },
    })
  );
  write(
    path.join(dir, 'web', 'src', 'App.tsx'),
    `export function App() {\n  return <main className="p-8">Storefront</main>;\n}\n`
  );
  write(path.join(dir, 'web', 'vite.config.ts'), `export default { plugins: [] };\n`);
  write(path.join(dir, 'web', 'tsconfig.json'), json({ compilerOptions: { strict: true } }));

  // ── api: Spring Boot + JPA + Postgres ─────────────────────────────────
  write(
    path.join(dir, 'api', 'pom.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.1</version>
  </parent>
  <groupId>com.storefront</groupId>
  <artifactId>api</artifactId>
  <version>1.4.0</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
  </dependencies>
</project>
`
  );
  write(
    path.join(dir, 'api', 'src', 'main', 'java', 'com', 'storefront', 'OrderController.java'),
    `package com.storefront;\n\n@RestController\npublic class OrderController {\n}\n`
  );

  // ── infra ──────────────────────────────────────────────────────────────
  write(
    path.join(dir, 'docker-compose.yml'),
    `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: storefront
  api:
    build: ./api
  web:
    build: ./web
`
  );
  write(path.join(dir, 'api', 'Dockerfile'), `FROM eclipse-temurin:21-jre\n`);
  write(
    path.join(dir, '.github', 'workflows', 'ci.yml'),
    `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
  );
  write(path.join(dir, 'README.md'), `# Storefront\n\nA monorepo.\n`);

  // git, so the detector reports a provider rather than "none".
  // execFileSync with an argument array — no shell, nothing interpolated.
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'demo@example.com');
  git('config', 'user.name', 'Demo');
  git('remote', 'add', 'origin', 'https://github.com/example/storefront.git');
  git('add', '-A');
  git('commit', '-m', 'initial');

  return dir;
}

// `file://${argv[1]}` does not round-trip on Windows (drive letters, backslashes),
// so compare against a properly encoded file URL instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(createDemoProject());
}
