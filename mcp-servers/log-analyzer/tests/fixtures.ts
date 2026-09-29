// SPDX-License-Identifier: MIT
/**
 * Log fixtures, written to a temp directory by the tests. Kept as TS strings
 * (with explicit \t) so tabs in stack traces survive editors and git.
 */

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';

export const SPRING_BOOT = [
  '2024-12-13 10:30:45.123  INFO 12345 --- [main] c.e.demo.Application : Started Application in 2.5 seconds',
  '2024-12-13 10:30:46.001 ERROR 12345 --- [nio-8080-exec-1] o.a.c.c.C.[.[.[/].[dispatcherServlet] : Servlet.service() threw exception',
  'java.lang.IllegalStateException: Failed to load order 42',
  '\tat com.example.demo.OrderService.load(OrderService.java:88)',
  '\tat com.example.demo.OrderController.get(OrderController.java:31)',
  '\tat java.base/java.lang.Thread.run(Thread.java:833)',
  'Caused by: java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30000ms.',
  '\tat com.zaxxer.hikari.pool.HikariPool.createTimeoutException(HikariPool.java:696)',
  '\tat com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:181)',
  '\t... 12 more',
  'Caused by: java.net.ConnectException: Connection refused',
  '\tat java.base/sun.nio.ch.Net.connect0(Native Method)',
  '\t... 20 more',
  '2024-12-13 10:30:47.500  WARN 12345 --- [nio-8080-exec-2] c.e.demo.OrderController : Slow request path=/orders/43 durationMs=1200',
  '2024-12-13 10:31:46.001 ERROR 12345 --- [nio-8080-exec-3] o.a.c.c.C.[.[.[/].[dispatcherServlet] : Servlet.service() threw exception',
  'java.lang.IllegalStateException: Failed to load order 77',
  '\tat com.example.demo.OrderService.load(OrderService.java:88)',
  '\tat com.example.demo.OrderController.get(OrderController.java:31)',
  'Caused by: java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30001ms.',
  '\tat com.zaxxer.hikari.pool.HikariPool.createTimeoutException(HikariPool.java:696)',
  'Caused by: java.net.ConnectException: Connection refused',
  '\tat java.base/sun.nio.ch.Net.connect0(Native Method)',
].join('\n') + '\n';

export const PYTHON = [
  '2024-12-13 10:30:45,123 - app.main - INFO - Starting worker',
  '2024-12-13 10:30:46,456 - app.jobs - ERROR - Job failed',
  'Traceback (most recent call last):',
  '  File "/app/jobs.py", line 12, in run',
  '    parse(payload)',
  '  File "/app/jobs.py", line 30, in parse',
  '    return int(value)',
  "ValueError: invalid literal for int() with base 10: 'abc'",
  '',
  'During handling of the above exception, another exception occurred:',
  '',
  'Traceback (most recent call last):',
  '  File "/app/jobs.py", line 14, in run',
  '    raise JobError("bad payload")',
  'app.errors.JobError: bad payload',
  '2024-12-13 10:30:47,000 - app.main - WARNING - Retrying',
].join('\n') + '\n';

export const NODE = [
  '{"level":50,"time":1702463446000,"pid":1,"hostname":"h","msg":"request failed","err":{"type":"TypeError","message":"Cannot read properties of undefined (reading \'id\')","stack":"TypeError: Cannot read properties of undefined (reading \'id\')\\n    at getUser (/app/src/users.js:10:15)\\n    at /app/src/routes.js:22:5"},"reqId":"req-1"}',
  '{"level":30,"time":1702463447000,"pid":1,"hostname":"h","msg":"ok","reqId":"req-2"}',
].join('\n') + '\n';

export const GO_PANIC = [
  'time=2024-12-13T10:30:45Z level=INFO msg="server started" port=8080',
  'panic: runtime error: index out of range [5] with length 3',
  '',
  'goroutine 1 [running]:',
  'main.handler(0xc000010000)',
  '\t/app/main.go:42 +0x1d',
  'main.main()',
  '\t/app/main.go:12 +0x25',
  'exit status 2',
  'time=2024-12-13T10:30:50Z level=INFO msg="restarted"',
].join('\n') + '\n';

export const DOTNET = [
  'info: Microsoft.Hosting.Lifetime[14]',
  '      Now listening on: http://localhost:5000',
  'fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]',
  '      An unhandled exception has occurred while executing the request.',
  '      System.InvalidOperationException: Order failed ---> System.ArgumentNullException: Value cannot be null. (Parameter \'id\')',
  '         at Shop.Orders.Validate(String id) in /src/Orders.cs:line 20',
  '         --- End of inner exception stack trace ---',
  '         at Shop.Orders.Place(Order o) in /src/Orders.cs:line 42',
  '         at Program.<>c.<<Main>$>b__0_0() in /src/Program.cs:line 10',
].join('\n') + '\n';

export const NGINX = [
  '10.0.0.1 - - [13/Dec/2024:10:30:45 +0000] "GET /api/users/1 HTTP/1.1" 200 512 "-" "curl/8.0" 0.120',
  '10.0.0.2 - - [13/Dec/2024:10:30:46 +0000] "GET /api/users/2 HTTP/1.1" 200 512 "-" "curl/8.0" 0.080',
  '10.0.0.1 - - [13/Dec/2024:10:31:47 +0000] "POST /api/orders HTTP/1.1" 500 128 "-" "Mozilla/5.0" 1.500',
  '10.0.0.3 - - [13/Dec/2024:10:32:48 +0000] "GET /api/users/3?x=1 HTTP/1.1" 404 0 "-" "curl/8.0" 0.010',
  '10.0.0.1 - - [13/Dec/2024:10:33:49 +0000] "POST /api/orders HTTP/1.1" 201 64 "-" "Mozilla/5.0" 0.300',
].join('\n') + '\n';

export const LOGFMT = [
  'time="2024-12-13T10:30:45Z" level=info msg="request done" status=200 duration=12ms trace_id=4bf92f3577b34da6a3ce929d0e0e4736 span_id=00f067aa0ba902b7',
  'time="2024-12-13T10:30:46Z" level=error msg="db down" err="dial tcp 10.0.0.5:5432: connect: connection refused" status=500 duration=250ms',
].join('\n') + '\n';

export function writeFixtures(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), 'log-analyzer-test-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

export function gz(text: string): Buffer {
  return gzipSync(Buffer.from(text, 'utf-8'));
}
