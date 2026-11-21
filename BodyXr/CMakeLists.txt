cmake_minimum_required(VERSION 3.15)
project(aurora_bodyxr CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# no Visual C++ runtime to install: link it statically, for this helper and for the OpenXR loader below
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded")

# The Khronos OpenXR SDK (Apache-2.0): headers and the loader, built into the exe
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(BUILD_API_LAYERS OFF CACHE BOOL "" FORCE)
set(BUILD_CONFORMANCE_TESTS OFF CACHE BOOL "" FORCE)
set(DYNAMIC_LOADER OFF CACHE BOOL "" FORCE)
include(FetchContent)
FetchContent_Declare(openxr
    URL https://github.com/KhronosGroup/OpenXR-SDK/archive/refs/tags/release-1.1.65.zip)
FetchContent_MakeAvailable(openxr)

add_executable(Aurora.BodyXr BodyXr.cpp)
target_link_libraries(Aurora.BodyXr PRIVATE OpenXR::openxr_loader)
if(WIN32)
    target_link_libraries(Aurora.BodyXr PRIVATE d3d11 dxgi advapi32)
endif()
set_target_properties(Aurora.BodyXr PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/out
    RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR}/out)
