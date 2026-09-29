// SPDX-License-Identifier: MIT
/**
 * Format coverage: every supported layout parses to the right fields, and
 * auto-detection picks it from the head with a confidence.
 */

import { describe, it, expect } from 'vitest';
import { entriesOf } from './helpers.js';
import { detectFormat, createParser } from '../src/parsers/index.js';
import { NGINX, LOGFMT } from './fixtures.js';

const one = async (line: string, format: Parameters<typeof entriesOf>[1] = 'auto') => {
  const { entries, summary } = await entriesOf(line + '\n', format);
  return { e: entries[0], format: summary.sources[0].format, all: entries };
};

describe('auto-detection', () => {
  const cases: Array<[string, string[]]> = [
    ['spring-boot', ['2024-12-13T10:30:45.123+01:00  INFO 1 --- [myapp] [           main] c.e.App : hi', '2024-12-13T10:30:46.123+01:00 ERROR 1 --- [myapp] [nio-1] c.e.App : boom']],
    ['nginx', NGINX.trim().split('\n')],
    ['logfmt', LOGFMT.trim().split('\n')],
    ['pino', ['{"level":30,"time":1702463446000,"pid":1,"hostname":"h","msg":"a"}']],
    ['zap', ['{"level":"info","ts":1702463446.1,"caller":"a/b.go:1","msg":"x"}']],
    ['zerolog', ['{"level":"info","time":"2024-12-13T10:30:45Z","message":"x"}']],
    ['logrus', ['{"level":"info","msg":"x","time":"2024-12-13T10:30:45Z"}']],
    ['serilog', ['{"@t":"2024-12-13T10:30:45.1Z","@mt":"Hello {Name}","Name":"Ada"}']],
    ['dotnet', ['{"EventId":0,"LogLevel":"Information","Category":"App","Message":"x"}']],
    ['otel', ['{"Timestamp":"2024-12-13T10:30:45Z","SeverityText":"INFO","Body":"x","TraceId":"4bf92f3577b34da6a3ce929d0e0e4736"}']],
    ['journald', ['{"__REALTIME_TIMESTAMP":"1702463445000000","PRIORITY":"3","MESSAGE":"x","_SYSTEMD_UNIT":"a.service"}']],
    ['syslog', ['<34>1 2024-12-13T10:30:45.1Z host app 1 ID1 - hello', '<13>Dec 13 10:30:45 host app[12]: world']],
    ['kubernetes', ['I1213 10:30:45.123456   12345 server.go:123] "Started" port=80']],
    ['python', ['WARNING:root:disk almost full', 'ERROR:app.db:connection lost']],
    ['zap', ['2024-12-13T10:30:45.000Z\tINFO\tsrv\tmain.go:12\tstarted\t{"port": 8080}']],
    ['dotnet', ['[10:30:45 INF] Starting up', '[10:30:46 ERR] Failed']],
    ['dotnet', ['2024-12-13 10:30:45.1234|INFO|App.Program|hi']],
    ['rails', ['I, [2024-12-13T10:30:45.123456 #123]  INFO -- : Started GET "/" for 1.2.3.4 at 2024-12-13 10:30:45 +0000']],
    ['clf', ['127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326']],
  ];
  for (const [format, lines] of cases) {
    it(`detects ${format}: ${lines[0].slice(0, 50)}`, () => {
      const d = detectFormat(lines);
      expect(d.format).toBe(format);
      expect(d.confidence).toBeGreaterThan(0.5);
    });
  }

  it('falls back to plain with a warning and low confidence for unknown text', () => {
    const d = detectFormat(['hello world', 'another line']);
    expect(d.format).toBe('plain');
    expect(d.warning).toMatch(/plain/);
  });

  it('warns when an explicit format matches nothing', () => {
    const d = detectFormat(['{"a":1}'], { format: 'nginx' });
    expect(d.detectedBy).toBe('explicit');
    expect(d.warning).toMatch(/matched none/);
  });
});

describe('field extraction', () => {
  it('Spring Boot 3 bracket groups: app, thread and trace/span', async () => {
    const { e } = await one('2024-12-13T10:30:45.123Z ERROR 7 --- [shop] [nio-8080-exec-1] [4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7] c.e.OrderController : failed');
    expect(e.thread).toBe('nio-8080-exec-1');
    expect(e.metadata?.application).toBe('shop');
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(e.spanId).toBe('00f067aa0ba902b7');
    expect(e.logger).toBe('c.e.OrderController');
  });

  it('Serilog CLEF renders the template and reads @x/@tr', async () => {
    const { e } = await one('{"@t":"2024-12-13T10:30:45.1Z","@mt":"Order {OrderId} failed","@l":"Error","OrderId":42,"@x":"System.Exception: boom\\n   at A.B() in /a.cs:line 3","@tr":"4bf92f3577b34da6a3ce929d0e0e4736"}');
    expect(e.message).toBe('Order 42 failed');
    expect(e.level).toBe('ERROR');
    expect(e.exception?.type).toBe('System.Exception');
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('ECS JSON: @timestamp, log.level, error.stack_trace, trace.id', async () => {
    const { e } = await one('{"@timestamp":"2024-12-13T10:30:45.000Z","log.level":"error","message":"x","error":{"type":"java.io.IOException","message":"disk","stack_trace":"java.io.IOException: disk\\n\\tat A.b(A.java:1)"},"trace":{"id":"4bf92f3577b34da6a3ce929d0e0e4736"}}');
    expect(e.level).toBe('ERROR');
    expect(e.exception?.type).toBe('java.io.IOException');
    expect(e.exception?.stackTrace).toEqual(['at A.b(A.java:1)']);
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('journald: byte-array MESSAGE, µs timestamp, PRIORITY', async () => {
    const msg = Array.from(Buffer.from('héllo'));
    const { e } = await one(JSON.stringify({ __REALTIME_TIMESTAMP: '1702463445000000', PRIORITY: '3', MESSAGE: msg, _SYSTEMD_UNIT: 'a.service' }));
    expect(e.message).toBe('héllo');
    expect(e.level).toBe('ERROR');
    expect(e.timestamp?.toISOString()).toBe('2023-12-13T10:30:45.000Z');
  });

  it('logfmt: heroku router line yields method/path/status/durationMs/request_id', async () => {
    const { e } = await one('at=info method=GET path="/users" host=a.herokuapp.com request_id=8601b555-6a76-4cd6-b3d2-7e19a5e3c3a0 fwd="1.2.3.4" dyno=web.1 connect=1ms service=18ms status=200 bytes=13 protocol=https', 'logfmt');
    expect(e.metadata).toMatchObject({ method: 'GET', path: '/users', status: 200, durationMs: 18, remoteAddr: '1.2.3.4' });
    expect(e.requestId).toBe('8601b555-6a76-4cd6-b3d2-7e19a5e3c3a0');
  });

  it('access log: nginx request_time, apache %D, CLF', async () => {
    const n = await one(NGINX.split('\n')[2], 'nginx');
    expect(n.e.metadata).toMatchObject({ method: 'POST', path: '/api/orders', status: 500, durationMs: 1500, userAgent: 'Mozilla/5.0' });
    expect(n.e.level).toBe('ERROR');
    const a = await one('1.2.3.4 - - [13/Dec/2024:10:30:45 +0100] "GET / HTTP/1.1" 200 5 "-" "ua" 2500', 'apache');
    expect(a.e.metadata?.durationMs).toBe(2.5);
    expect(a.e.timestamp?.toISOString()).toBe('2024-12-13T09:30:45.000Z');
    const c = await one('127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326', 'clf');
    expect(c.e.metadata).toMatchObject({ remoteUser: 'frank', status: 200, bytes: 2326 });
  });

  it('nginx error log context fields', async () => {
    const { e } = await one('2024/12/13 10:30:45 [error] 1234#5678: *91 connect() failed (111: Connection refused) while connecting to upstream, client: 1.2.3.4, server: api, request: "GET /x HTTP/1.1", upstream: "http://10.0.0.1:8080/x", host: "api"', 'nginx');
    expect(e.level).toBe('ERROR');
    expect(e.metadata).toMatchObject({ client: '1.2.3.4', server: 'api', method: 'GET', path: '/x', upstream: 'http://10.0.0.1:8080/x' });
  });

  it('RFC 5424 with several structured-data elements', async () => {
    const { e } = await one('<165>1 2024-12-13T10:30:45.003Z host app 1234 ID47 [exampleSDID@32473 iut="3" eventSource="App"][ctx@1 reqId="abc-123"] message text', 'syslog');
    expect(e.level).toBe('INFO');
    expect(e.message).toBe('message text');
    expect((e.metadata?.syslog as any).structuredData).toEqual({ 'exampleSDID@32473': { iut: '3', eventSource: 'App' }, 'ctx@1': { reqId: 'abc-123' } });
    expect(e.metadata?.eventSource).toBe('App');
  });

  it('RFC 5424 NILVALUE structured data', async () => {
    const { e } = await one('<11>1 2024-12-13T10:30:45Z host app - - - disk failure', 'syslog');
    expect(e.message).toBe('disk failure');
    expect(e.level).toBe('ERROR');
  });

  it('format custom without a pattern is an error, not zero entries', async () => {
    await expect(entriesOf('x\n', 'custom')).rejects.toThrow(/customPattern/);
  });

  it('custom regex parser maps groups to fields', () => {
    const p = createParser('custom', { customPattern: '^(?<ts>\\S+ \\S+) \\| (?<level>\\w+) \\| (?<service>\\w+) \\| (?<message>.*)$' });
    const e = p.parseLine('2024-12-13 10:30:45 | WARN | api | slow request', 1)!;
    expect(e.level).toBe('WARN');
    expect(e.message).toBe('slow request');
    expect(e.metadata?.service).toBe('api');
    expect(e.timestamp).not.toBeNull();
  });

  it('custom pattern without named groups is rejected', () => {
    expect(() => createParser('custom', { customPattern: '^(\\S+) (.*)$' })).toThrow(/named groups/);
  });

  it('MEL console puts the message on the next line; Serilog text; NLog', async () => {
    const { all } = await one('info: App.Worker[0]\n      Processing job 7', 'dotnet');
    expect(all[0].message).toBe('Processing job 7');
    expect(all[0].logger).toBe('App.Worker');
    const s = await one('2024-12-13 10:30:45.123 +00:00 [WRN] Low disk', 'dotnet');
    expect(s.e.level).toBe('WARN');
    expect(s.e.timestamp?.toISOString()).toBe('2024-12-13T10:30:45.123Z');
  });

  it('klog infers the year and flags it', async () => {
    const { e } = await one('E1213 10:30:45.123456   12345 controller.go:88] "Reconcile failed" err="timeout"', 'kubernetes');
    expect(e.level).toBe('ERROR');
    expect(e.message).toBe('Reconcile failed');
    expect(e.metadata?.timestampYearInferred).toBe(true);
    expect(e.metadata?.err).toBe('timeout');
  });
});
