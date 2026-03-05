---
name: charting
description: |
  Chart and data visualization libraries. Recharts, Chart.js, D3.js, Victory,
  Nivo, ECharts. Common chart types, responsive design, and real-time updates.

  USE WHEN: user mentions "chart", "graph", "data visualization", "Recharts",
  "Chart.js", "D3", "ECharts", "Victory", "bar chart", "line chart", "dashboard"

  DO NOT USE FOR: PDF report generation - use `pdf-generation`;
  data export - use `data-export`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Charting & Data Visualization

## Recharts (React — recommended)

```tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

const data = [
  { month: 'Jan', revenue: 4000, users: 240 },
  { month: 'Feb', revenue: 3000, users: 198 },
  { month: 'Mar', revenue: 5000, users: 300 },
];

function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
        <Line type="monotone" dataKey="users" stroke="#82ca9d" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Bar Chart
function SalesChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="revenue" fill="#8884d8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

## Chart.js (framework-agnostic)

```typescript
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// With React wrapper
import { Line, Bar, Doughnut } from 'react-chartjs-2';

function SalesChart() {
  return (
    <Line
      data={{
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
          label: 'Revenue',
          data: [4000, 3000, 5000],
          borderColor: '#8884d8',
          tension: 0.3,
        }],
      }}
      options={{
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } },
      }}
    />
  );
}
```

## D3.js (low-level, maximum control)

```typescript
import * as d3 from 'd3';

function createBarChart(container: HTMLElement, data: { label: string; value: number }[]) {
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 600 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(data.map((d) => d.label)).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value)!]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
  svg.append('g').call(d3.axisLeft(y));

  svg.selectAll('rect').data(data).join('rect')
    .attr('x', (d) => x(d.label)!)
    .attr('y', (d) => y(d.value))
    .attr('width', x.bandwidth())
    .attr('height', (d) => height - y(d.value))
    .attr('fill', '#8884d8')
    .attr('rx', 4);
}
```

## Library Selection

| Library | Best For | Learning Curve |
|---------|----------|---------------|
| Recharts | React dashboards | Low |
| Chart.js | Simple charts, any framework | Low |
| D3.js | Custom/complex visualizations | High |
| ECharts | Large datasets, maps | Medium |
| Nivo | React, rich chart types | Low |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Not using ResponsiveContainer | Always wrap charts for responsive sizing |
| Re-rendering entire chart on data change | Use chart update methods, not re-mount |
| Too many data points without aggregation | Aggregate/sample data before charting |
| No loading state for async data | Show skeleton/spinner while loading |
| Fixed pixel dimensions | Use relative sizing (%, viewBox) |

## Production Checklist

- [ ] Responsive container wrapping all charts
- [ ] Loading and empty states handled
- [ ] Accessible: color contrast, ARIA labels
- [ ] Data aggregation for large datasets
- [ ] Consistent color palette across charts
- [ ] Tooltip formatting for readability
