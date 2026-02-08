---
name: webpack
description: |
  Webpack module bundler. Covers configuration, loaders, plugins, optimization.
  Use when working with Webpack-based projects or migrating from Webpack.

  USE WHEN: user mentions "Webpack", "webpack.config", "webpack loaders", "webpack plugins", asks about "Webpack configuration", "bundle optimization"

  DO NOT USE FOR: Vite projects (use vite skill), esbuild (use esbuild skill), new projects (prefer Vite), Parcel
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Webpack - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `webpack` for comprehensive documentation.

## When NOT to Use This Skill

- **New projects** - Prefer Vite for better DX and speed
- **Simple bundling** - Use esbuild for faster builds
- **Vite/Parcel projects** - They have simpler configuration
- **Library builds** - Rollup or esbuild are better suited

## When to Use This Skill
- Legacy projects with Webpack
- Complex build configurations
- Migration from Webpack to Vite
- Fine-tuning bundle optimization

## Basic Configuration

```javascript
// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production', // 'development' | 'production'
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  ],
};
```

## Loaders

```javascript
module.exports = {
  module: {
    rules: [
      // JavaScript/TypeScript
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react',
              '@babel/preset-typescript',
            ],
          },
        },
      },

      // CSS
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },

      // CSS Modules
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[name]__[local]--[hash:base64:5]',
              },
            },
          },
        ],
      },

      // SASS/SCSS
      {
        test: /\.s[ac]ss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },

      // Images
      {
        test: /\.(png|jpg|gif|svg)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024, // 8KB inline
          },
        },
      },

      // Fonts
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
      },
    ],
  },
};
```

## Plugins

```javascript
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),

    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css',
    }),

    new CopyWebpackPlugin({
      patterns: [{ from: 'public', to: '' }],
    }),

    new Dotenv({
      systemvars: true,
    }),

    // Only in analyze mode
    process.env.ANALYZE && new BundleAnalyzerPlugin(),
  ].filter(Boolean),
};
```

## Code Splitting

```javascript
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 10,
        },
      },
    },
    runtimeChunk: 'single',
  },
};
```

### Dynamic Imports

```javascript
// Lazy loading
const AdminPanel = React.lazy(() => import('./AdminPanel'));

// Named chunks
const Dashboard = React.lazy(() =>
  import(/* webpackChunkName: "dashboard" */ './Dashboard')
);

// Prefetch (load during idle)
import(/* webpackPrefetch: true */ './HeavyComponent');

// Preload (load in parallel)
import(/* webpackPreload: true */ './CriticalComponent');
```

## Resolve Configuration

```javascript
module.exports = {
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
    fallback: {
      // Node.js polyfills for browser
      path: require.resolve('path-browserify'),
      crypto: require.resolve('crypto-browserify'),
    },
  },
};
```

## Dev Server

```javascript
module.exports = {
  devServer: {
    port: 3000,
    hot: true,
    open: true,
    historyApiFallback: true,  // SPA routing
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        pathRewrite: { '^/api': '' },
      },
    },
    static: {
      directory: path.join(__dirname, 'public'),
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },
};
```

## Production Optimization

```javascript
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: 'all',
      maxSize: 244000, // 244KB max chunk
    },
  },
  plugins: [
    new CompressionPlugin({
      algorithm: 'gzip',
      test: /\.(js|css|html|svg)$/,
    }),
  ],
  performance: {
    maxEntrypointSize: 250000,
    maxAssetSize: 250000,
    hints: 'warning',
  },
};
```

## Environment-based Config

```javascript
// webpack.config.js
module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    mode: argv.mode,
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    output: {
      filename: isProd ? '[name].[contenthash].js' : '[name].js',
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
          ],
        },
      ],
    },
  };
};
```

### Multiple Configs

```javascript
// webpack.common.js
module.exports = { /* shared config */ };

// webpack.dev.js
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-cheap-module-source-map',
});

// webpack.prod.js
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',
});
```

## TypeScript Configuration

```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

## Migration to Vite

```javascript
// Webpack → Vite mapping
// webpack.config.js         → vite.config.ts
// entry                     → Automatic (index.html)
// output                    → build.outDir
// module.rules              → Plugins (most automatic)
// resolve.alias             → resolve.alias
// devServer.proxy           → server.proxy
// DefinePlugin              → define
// HtmlWebpackPlugin         → Built-in
// MiniCssExtractPlugin      → Built-in
// splitChunks               → build.rollupOptions.output.manualChunks
```

## Debugging

```bash
# Verbose output
webpack --stats verbose

# Debug config
webpack --config-name main --debug

# Analyze bundle
npx webpack-bundle-analyzer dist/stats.json
```

## Anti-Patterns to Avoid

- Do not use `file-loader`/`url-loader` (use asset modules)
- Do not forget `contenthash` for cache busting
- Do not overuse aliases (complicates debugging)
- Do not ignore bundle size warnings

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using file-loader/url-loader | Deprecated | Use asset modules (type: 'asset') |
| No contenthash in filenames | Cache busting fails | Use [contenthash] in output |
| Not splitting vendor code | Large bundles | Configure splitChunks |
| Missing source maps in prod | Hard to debug | Enable source-map in production |
| Synchronous imports for routes | Large initial bundle | Use dynamic import() for routes |
| No bundle analysis | Unknown bundle composition | Use webpack-bundle-analyzer |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Slow builds | No caching | Enable cache: { type: 'filesystem' } |
| Large bundle size | No code splitting | Configure optimization.splitChunks |
| Memory errors | Large project | Increase Node memory: --max-old-space-size=4096 |
| HMR not working | Incorrect config | Check hot: true and WebSocket settings |
| Module not found | Wrong resolve paths | Check resolve.modules and resolve.extensions |
| CSS not extracted | Missing plugin | Use MiniCssExtractPlugin |

## Common Issues

| Issue | Solution |
|-------|----------|
| Slow builds | Use `cache: { type: 'filesystem' }` |
| Large bundles | Enable splitChunks, tree shaking |
| Memory issues | Use `--max-old-space-size=4096` |
| HMR not working | Check hot: true, WebSocket proxy |

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Initial bundle | < 200KB gzip |
| Build time (prod) | < 60s |
| Build time (dev) | < 10s |
| Chunks | < 10 |

## Checklist

- [ ] Production mode configured
- [ ] Source maps enabled
- [ ] Code splitting with splitChunks
- [ ] CSS extraction (MiniCssExtractPlugin)
- [ ] Assets optimization
- [ ] Compression (gzip/brotli)
- [ ] Bundle analysis
- [ ] Cache configuration

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `webpack`
> - [Webpack Docs](https://webpack.js.org/)
