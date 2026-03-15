# Astro Content Collections

> **Knowledge Base:** Read `knowledge/astro/content.md` for complete documentation.

## Define Collections

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content', // Markdown/MDX
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    author: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    image: z.string().optional(),
  }),
});

const authors = defineCollection({
  type: 'data', // JSON/YAML
  schema: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string(),
  }),
});

export const collections = { blog, authors };
```

## Directory Structure

```
src/content/
├── config.ts           # Collection definitions
├── blog/
│   ├── first-post.md
│   ├── second-post.mdx
│   └── drafts/
│       └── wip.md
└── authors/
    ├── john.json
    └── jane.yaml
```

## Content File Format

```md
---
# src/content/blog/hello-world.md
title: "Hello World"
description: "My first blog post"
pubDate: 2024-01-15
author: "john"
tags: ["astro", "tutorial"]
---

# Hello World

This is my first blog post!
```

## Query Collections

```astro
---
// src/pages/blog/index.astro
import { getCollection } from 'astro:content';

// Get all non-draft posts
const posts = await getCollection('blog', ({ data }) => !data.draft);

// Sort by date
const sortedPosts = posts.sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---

<ul>
  {sortedPosts.map(post => (
    <li>
      <a href={`/blog/${post.slug}`}>{post.data.title}</a>
      <time>{post.data.pubDate.toLocaleDateString()}</time>
    </li>
  ))}
</ul>
```

## Get Single Entry

```astro
---
// src/pages/blog/[slug].astro
import { getCollection, getEntry } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content, headings } = await post.render();
---

<article>
  <h1>{post.data.title}</h1>
  <time>{post.data.pubDate.toLocaleDateString()}</time>
  <Content />
</article>
```

## Reference Other Collections

```ts
// src/content/config.ts
import { defineCollection, z, reference } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: reference('authors'), // Reference to authors collection
    relatedPosts: z.array(reference('blog')).default([]),
  }),
});
```

```astro
---
// Resolve the reference
const post = await getEntry('blog', 'hello-world');
const author = await getEntry(post.data.author);
---

<p>Written by {author.data.name}</p>
```

## With Images

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: ({ image }) => z.object({
    title: z.string(),
    cover: image(), // Validates image exists
  }),
});
```

```astro
---
import { Image } from 'astro:assets';

const { post } = Astro.props;
---

<Image src={post.data.cover} alt={post.data.title} />
```

**Official docs:** https://docs.astro.build/en/guides/content-collections/
