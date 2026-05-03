---
name: googletest
description: |
  Google Test (GTest) and Google Mock for C++ unit testing. Covers test fixtures,
  parameterized tests, typed tests, death tests, matchers, mocks (EXPECT_CALL),
  and CMake integration via gtest_discover_tests.

  USE WHEN: user mentions "Google Test", "GTest", "gmock", "EXPECT_EQ", "TEST_F",
  "INSTANTIATE_TEST_SUITE_P", "EXPECT_CALL", "MOCK_METHOD", "C++ unit test"

  DO NOT USE FOR: Catch2 (different framework), doctest, Boost.Test, CppUnit
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Google Test - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `googletest`.

## Basic test

```cpp
#include <gtest/gtest.h>
#include "calc.hpp"

TEST(CalcTest, AddsTwoPositiveNumbers) {
    EXPECT_EQ(add(2, 3), 5);
}

TEST(CalcTest, ThrowsOnDivByZero) {
    EXPECT_THROW(divide(1, 0), std::invalid_argument);
}
```

`EXPECT_*` continues on failure; `ASSERT_*` aborts the current test.

## Assertions cheat sheet

| Macro | Use |
|-------|-----|
| `EXPECT_EQ(a, b)` / `_NE` / `_LT` / `_LE` / `_GT` / `_GE` | Comparison |
| `EXPECT_TRUE(x)` / `_FALSE` | Boolean |
| `EXPECT_FLOAT_EQ` / `EXPECT_DOUBLE_EQ` / `EXPECT_NEAR(a, b, eps)` | Floating-point |
| `EXPECT_STREQ` / `_STRNE` / `_STRCASEEQ` | C-strings |
| `EXPECT_THROW(stmt, ExType)` / `_NO_THROW` / `_ANY_THROW` | Exceptions |
| `EXPECT_DEATH(stmt, regex)` | Process exits with diagnostic |
| `EXPECT_THAT(value, matcher)` | gmock matchers (see below) |

## Fixtures

```cpp
class DatabaseTest : public ::testing::Test {
protected:
    Database db_;

    void SetUp() override   { db_.connect("memory"); }
    void TearDown() override { db_.disconnect(); }
};

TEST_F(DatabaseTest, InsertsRow) {
    EXPECT_TRUE(db_.insert({"alice"}));
    EXPECT_EQ(db_.count(), 1);
}
```

For one-time setup across all tests in a suite, use `static void SetUpTestSuite()` / `TearDownTestSuite()`.

## Parameterized tests

```cpp
class IsPrimeTest : public ::testing::TestWithParam<int> {};

TEST_P(IsPrimeTest, RecognizesPrimes) {
    EXPECT_TRUE(is_prime(GetParam()));
}

INSTANTIATE_TEST_SUITE_P(
    SmallPrimes,
    IsPrimeTest,
    ::testing::Values(2, 3, 5, 7, 11, 13)
);
```

Other generators: `Range(1, 10)`, `ValuesIn(container)`, `Combine(...)`, `Bool()`.

## Typed tests (test the same logic across types)

```cpp
template <typename T>
class StackTest : public ::testing::Test {
protected:
    Stack<T> stack_;
};

using StackTypes = ::testing::Types<int, std::string, std::vector<int>>;
TYPED_TEST_SUITE(StackTest, StackTypes);

TYPED_TEST(StackTest, PushIncreasesSize) {
    this->stack_.push(TypeParam{});
    EXPECT_EQ(this->stack_.size(), 1u);
}
```

## gmock matchers (with EXPECT_THAT)

```cpp
#include <gmock/gmock.h>
using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Field;
using ::testing::Ge;
using ::testing::HasSubstr;
using ::testing::Pointee;

EXPECT_THAT(name, HasSubstr("alice"));
EXPECT_THAT(numbers, ElementsAre(1, 2, 3));
EXPECT_THAT(user, AllOf(Field(&User::age, Ge(18)),
                        Field(&User::name, HasSubstr("bob"))));
EXPECT_THAT(ptr, Pointee(Ge(0)));
```

## gmock - mocking interfaces

```cpp
class IRepo {
public:
    virtual ~IRepo() = default;
    virtual std::optional<User> find(int id) const = 0;
    virtual void save(const User&) = 0;
};

class MockRepo : public IRepo {
public:
    MOCK_METHOD(std::optional<User>, find, (int id), (const, override));
    MOCK_METHOD(void, save, (const User&), (override));
};

TEST(ServiceTest, ReturnsUserWhenFound) {
    MockRepo repo;
    EXPECT_CALL(repo, find(42))
        .Times(1)
        .WillOnce(::testing::Return(User{42, "alice"}));

    Service svc{repo};
    auto u = svc.get(42);

    ASSERT_TRUE(u.has_value());
    EXPECT_EQ(u->name, "alice");
}
```

`EXPECT_CALL` matchers: `_` (anything), `Eq(v)`, `Ge(v)`, `NotNull()`, `Truly(pred)`.
Cardinality: `.Times(N)`, `.Times(AtLeast(1))`, `.Times(AnyNumber())`.
Actions: `Return(v)`, `Throw(ex)`, `Invoke(callable)`, `DoAll(SetArgPointee<0>(v), Return(true))`.

## Death tests

```cpp
TEST(SafeDeath, AbortsOnNull) {
    EXPECT_DEATH({ deref(nullptr); }, "null pointer");
}
```

Death tests fork the process; keep them small. Use `::testing::FLAGS_gtest_death_test_style = "threadsafe";` if multithreaded.

## CMake integration

```cmake
include(FetchContent)
FetchContent_Declare(googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.15.2
    GIT_SHALLOW TRUE
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)   # MSVC
FetchContent_MakeAvailable(googletest)

enable_testing()
add_executable(unit_tests tests/calc_test.cpp tests/db_test.cpp)
target_link_libraries(unit_tests PRIVATE mylib GTest::gtest_main GTest::gmock)

include(GoogleTest)
gtest_discover_tests(unit_tests)
```

Run:
```bash
ctest --output-on-failure
ctest -R '^CalcTest\.' --output-on-failure       # filter by regex
./build/unit_tests --gtest_filter='*Add*'        # binary directly
./build/unit_tests --gtest_repeat=100 --gtest_shuffle
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Logic in `SetUp` shared across tests | One leaky test poisons others | Construct fresh state per test |
| `TEST` instead of `TEST_F` when fixture exists | No setup hook | Use `TEST_F(FixtureName, Case)` |
| `EXPECT_TRUE(a == b)` | Loses both values in diagnostic | `EXPECT_EQ(a, b)` |
| Floating-point `EXPECT_EQ` | Spurious failures | `EXPECT_NEAR(a, b, eps)` or `EXPECT_DOUBLE_EQ` |
| `EXPECT_CALL` after the fact | gmock requires calls before exercising the mock | Set expectations before calling SUT |
| Strict mocks everywhere | Brittle to harmless extra calls | Use `NiceMock` by default; `StrictMock` when surface is small |
| `MOCK_METHOD` on non-virtual functions | Won't be intercepted | Mock through a virtual interface (or use a template seam) |
