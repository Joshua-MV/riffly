cmake_minimum_required(VERSION 3.20)
project(riffly_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_library(riffly_engine STATIC
  src/engine.cpp
  src/analysis.cpp
  src/dsp.cpp
  src/audio_io.cpp)
target_include_directories(riffly_engine PUBLIC include)
if(MSVC)
  target_compile_options(riffly_engine PRIVATE /W3 /O2 /utf-8)
  target_compile_definitions(riffly_engine PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

add_executable(riffly_cli tools/riffly_cli.cpp)
target_link_libraries(riffly_cli PRIVATE riffly_engine)

enable_testing()
add_executable(engine_tests tests/engine_tests.cpp)
target_link_libraries(engine_tests PRIVATE riffly_engine)
target_include_directories(engine_tests PRIVATE src)
add_test(NAME engine_tests COMMAND engine_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/data)
