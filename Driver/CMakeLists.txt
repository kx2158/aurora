cmake_minimum_required(VERSION 3.10)
project(aurora_driver CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# SteamVR loads <driver folder>/bin/win64/driver_aurora.dll
add_library(driver_aurora SHARED aurora_driver.cpp)
target_include_directories(driver_aurora PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
set_target_properties(driver_aurora PROPERTIES
    PREFIX ""
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/out/aurora/bin/win64
    RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR}/out/aurora/bin/win64)

# manifest and resources next to the dll
add_custom_command(TARGET driver_aurora POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory ${CMAKE_CURRENT_SOURCE_DIR}/aurora ${CMAKE_BINARY_DIR}/out/aurora)
