---
name: unity-testing
description: |
  Unity Test Framework — EditMode + PlayMode tests, [UnityTest] coroutines,
  Test Runner, mocking patterns, Unity.PerformanceTesting package.

  USE WHEN: writing/debugging tests, setting up CI test runs, performance
  regression tests, asserting scene state, mocking time/input.

  DO NOT USE FOR: runtime in-game telemetry (use `unity-performance` for
  profiling); end-to-end automation (use editor tooling + custom harness).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Test Framework

## Test types

| Mode | What | Speed |
|---|---|---|
| **EditMode** | Pure C# logic, no scene | Fast (~ms) |
| **PlayMode** | Runs in play mode, can Instantiate, FixedUpdate ticks | Slow (seconds) |

Default to EditMode; reserve PlayMode for things that genuinely need the engine loop.

## Asmdef setup

```
Assets/Tests/EditMode.asmdef     (Test Assemblies + Editor-only references)
Assets/Tests/PlayMode.asmdef     (Test Assemblies + runtime + editor)
```

Add **Test Assemblies** flag in asmdef Inspector.

## EditMode test

```csharp
using NUnit.Framework;

public class HealthTests {
    [Test] public void TakeDamage_ReducesHealth() {
        var h = new Health(100);
        h.TakeDamage(30);
        Assert.AreEqual(70, h.Current);
    }

    [TestCase(100, 200, 0)]
    [TestCase(100, 50, 50)]
    public void Damage_ClampsAtZero(int max, int dmg, int expected) {
        var h = new Health(max);
        h.TakeDamage(dmg);
        Assert.AreEqual(expected, h.Current);
    }
}
```

## PlayMode test (`[UnityTest]`)

```csharp
using UnityEngine.TestTools;
using System.Collections;
using UnityEngine;

public class JumpTests {
    [UnityTest] public IEnumerator Jump_LeavesGroundForOneSecond() {
        var go = new GameObject("Player", typeof(Rigidbody), typeof(PlayerJump));
        go.transform.position = Vector3.up;
        var jump = go.GetComponent<PlayerJump>();
        jump.DoJump();
        yield return new WaitForSeconds(1f);
        Assert.IsTrue(go.transform.position.y > 1f);
        Object.Destroy(go);
    }
}
```

`yield return null` → next frame; `WaitForSeconds`, `WaitForFixedUpdate`, `WaitUntil(() => …)`.

## Mocking time / input

- **Time**: inject an `ITime` abstraction that wraps `Time.deltaTime`; in tests pass a fake.
- **Input**: don't read `_action.ReadValue` directly in test target — pass values via method, or use `InputTestFixture` for low-level input simulation.

## Performance tests (`Unity.PerformanceTesting` package)

```csharp
[Test, Performance]
public void Pathfinder_PerfBaseline() {
    Measure.Method(() => Pathfinder.FindPath(start, end, grid))
           .WarmupCount(10)
           .MeasurementCount(50)
           .Run();
}
```

Reports captured to `PerformanceTests` folder; CI baselines via Performance Test Reporter.

## CI integration

```bash
Unity -batchmode -projectPath . \
  -runTests -testPlatform EditMode \
  -testResults Tests/edit-results.xml \
  -logFile - || exit 1

Unity -batchmode -projectPath . \
  -runTests -testPlatform PlayMode \
  -testResults Tests/play-results.xml \
  -logFile - || exit 1
```

Convert `*.xml` (NUnit format) to JUnit for GitHub/GitLab reports.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Tests sharing state via static fields | `[SetUp]` resets, or `[TearDown]` cleans |
| Real time-based assertions (`Thread.Sleep`) | Use `yield return new WaitForSeconds` in PlayMode |
| Loading actual scenes in EditMode | Refactor logic out of MonoBehaviour into POCOs you can unit test |
| One mega test method | Split into focused `[Test]` methods + `[TestCase]` data |

## Production checklist

- [ ] Test asmdefs flagged Test Assemblies
- [ ] EditMode covers all POCO logic
- [ ] PlayMode reserved for engine-dependent behaviour
- [ ] Performance baselines tracked in CI
- [ ] Tests run in CI on every PR
- [ ] Random seeds reproducible (fix `Random.InitState(seed)` in `[SetUp]`)
