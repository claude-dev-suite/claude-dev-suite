---
name: cmake
description: |
  CMake build system for C/C++ projects. Modern CMake (3.20+) with targets, properties,
  presets (CMakePresets.json), FetchContent, find_package, generator expressions, install
  rules, vcpkg/Conan integration.

  USE WHEN: user mentions "CMake", "CMakeLists.txt", "CMakePresets", "find_package",
  "FetchContent", "target_link_libraries", "vcpkg", "Conan", "C++ build"

  DO NOT USE FOR: Make, autotools, Bazel, Meson, Visual Studio .vcxproj direct editing
allowed-tools: Read, Grep, Glob, Write, Edit
---
# CMake - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cmake`.

## Minimal modern CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.25)
project(myapp VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)   # for clang-tidy / IDEs

add_library(mylib
    src/api.cpp
    src/util.cpp
)

target_include_directories(mylib
    PUBLIC  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
            $<INSTALL_INTERFACE:include>
    PRIVATE src
)

target_compile_features(mylib PUBLIC cxx_std_20)

target_compile_options(mylib PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX /permissive->
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Wpedantic -Werror>
)

add_executable(myapp src/main.cpp)
target_link_libraries(myapp PRIVATE mylib)
```

## Targets, not variables

> **Rule**: Configure things on **targets** (`target_*` commands), not via global `add_*` / `include_directories` / `set(CMAKE_...)`. Modern CMake = target-centric.

| Avoid (legacy) | Use (modern) |
|----------------|--------------|
| `include_directories(...)` | `target_include_directories(tgt PUBLIC ...)` |
| `add_definitions(-DX)` | `target_compile_definitions(tgt PRIVATE X)` |
| `link_libraries(...)` | `target_link_libraries(tgt PRIVATE ...)` |
| `set(CMAKE_CXX_FLAGS "...")` | `target_compile_options(tgt PRIVATE ...)` |

## Visibility: PUBLIC / PRIVATE / INTERFACE

```cmake
target_link_libraries(mylib
    PUBLIC    fmt::fmt        # consumers also need fmt (in mylib's API)
    PRIVATE   spdlog::spdlog  # implementation only
    INTERFACE asio::asio      # header-only requirement, not used by mylib itself
)
```

## CMakePresets.json (CMake 3.19+)

```json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "binaryDir": "${sourceDir}/build/${presetName}",
      "generator": "Ninja",
      "cacheVariables": { "CMAKE_EXPORT_COMPILE_COMMANDS": "ON" }
    },
    {
      "name": "debug",
      "inherits": "base",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
    },
    {
      "name": "debug-asan",
      "inherits": "debug",
      "cacheVariables": {
        "CMAKE_CXX_FLAGS": "-fsanitize=address,undefined -fno-omit-frame-pointer",
        "CMAKE_EXE_LINKER_FLAGS": "-fsanitize=address,undefined"
      }
    },
    {
      "name": "release",
      "inherits": "base",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Release" }
    }
  ],
  "buildPresets":   [ { "name": "debug", "configurePreset": "debug" } ],
  "testPresets":    [ { "name": "debug", "configurePreset": "debug",
                         "output": { "outputOnFailure": true } } ]
}
```

Usage:
```bash
cmake --preset debug
cmake --build --preset debug
ctest --preset debug
```

## Dependencies

### find_package (system or vcpkg/Conan-installed)
```cmake
find_package(fmt 10 REQUIRED CONFIG)
target_link_libraries(myapp PRIVATE fmt::fmt)
```

### FetchContent (vendored at configure time)
```cmake
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.15.2
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(googletest)
target_link_libraries(my_test PRIVATE GTest::gtest_main)
```

### vcpkg manifest mode
```json
// vcpkg.json
{ "name": "myapp", "version-string": "0.1.0",
  "dependencies": ["fmt", "spdlog", { "name": "boost-asio", "version>=": "1.84.0" }] }
```
Configure with `-DCMAKE_TOOLCHAIN_FILE=/path/to/vcpkg/scripts/buildsystems/vcpkg.cmake`.

## Generator Expressions

```cmake
target_compile_options(mylib PRIVATE
    $<$<CONFIG:Debug>:-O0 -g3>
    $<$<CONFIG:Release>:-O3 -DNDEBUG>
    $<$<COMPILE_LANGUAGE:CXX>:-fno-rtti>
)

# Different include path at build vs install time
target_include_directories(mylib PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)
```

## Tests with CTest

```cmake
enable_testing()
add_executable(api_test tests/api_test.cpp)
target_link_libraries(api_test PRIVATE mylib GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(api_test)
```

Run: `ctest --output-on-failure -j$(nproc)`.

## Install + export package

```cmake
include(GNUInstallDirs)

install(TARGETS mylib EXPORT mylibTargets
    LIBRARY  DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE  DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME  DESTINATION ${CMAKE_INSTALL_BINDIR}
    INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

install(EXPORT mylibTargets
    FILE mylibTargets.cmake
    NAMESPACE mylib::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/mylib
)
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `file(GLOB ...)` for sources | Adds/removes invisible to CMake until reconfigure | List sources explicitly |
| Global `include_directories`, `add_definitions` | Leaks to all targets | `target_*` commands |
| `link_directories(...)` | Order-dependent, fragile | `target_link_libraries(... <imported target>)` |
| In-source build | Pollutes repo | Out-of-source: `cmake -S . -B build` |
| Hard-coded compiler flags | Breaks on other compilers | Generator expressions per `CXX_COMPILER_ID` |
| `set(CMAKE_BUILD_TYPE Release)` in CMakeLists | Overrides user choice | Set in preset or via `-DCMAKE_BUILD_TYPE=` |
| Copying `.cmake` files instead of `find_package` config mode | Versions drift | Install + export targets, consume with config-mode `find_package` |

## Common Commands

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build -j
ctest --test-dir build --output-on-failure
cmake --install build --prefix /opt/myapp
cmake --build build --target clean
cmake --build build --target package         # if CPack configured
```
