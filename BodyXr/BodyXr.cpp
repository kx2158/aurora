// Aurora BodyXr: reads the Quest's body tracking (OpenXR XR_FB_body_tracking, and the full body extension when the
// headset offers it) and puts the joints into shared memory "Local\AuroraBodyXr" for Aurora to read.
//
// Written from the public OpenXR specification. It only ever reads; it never draws and never submits layers.
// Experimental: the Quest runtime may refuse a second OpenXR session while SteamVR is running. The state field says
// what happened, so Aurora can show it:
//   0 starting   1 no OpenXR runtime or headset   2 runtime has no body tracking   3 session failed
//   4 session up, no body data yet               5 tracking
#include <openxr/openxr.h>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <chrono>
#include <thread>
#include <vector>
#include <string>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <winreg.h>
#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#include <openxr/openxr_platform.h>
#endif

static const uint32_t kMagic = 0x52584241; // "ABXR"
static const int kMaxJoints = 84;
static_assert(4096 >= 2820 + 44, "fits the mapping");

struct SharedJoint
{
    float p[3];
    float q[4]; // x y z w
    uint32_t flags; // 1 position valid, 2 orientation valid, 4 position tracked, 8 orientation tracked
};

struct Shared
{
    uint32_t magic;
    uint32_t version;
    uint32_t state;
    uint32_t jointCount;
    uint64_t updatedMs;
    uint32_t seq;
    float confidence;
    uint32_t fullBody;
    char note[96];
    SharedJoint joints[kMaxJoints];
    float viewPos[3]; // the headset's own pose in the same space as the joints
    float viewRot[4];
    uint32_t viewValid;
};
static_assert(offsetof(Shared, updatedMs) == 16, "layout is read by Aurora");
static_assert(offsetof(Shared, note) == 36, "layout is read by Aurora");
static_assert(offsetof(Shared, joints) == 132, "layout is read by Aurora");
static_assert(sizeof(SharedJoint) == 32, "layout is read by Aurora");
static_assert(offsetof(Shared, viewPos) == 2820, "layout is read by Aurora");

static Shared* gShared = nullptr;
static Shared gLocal; // used when the mapping is not available (and on the Linux syntax check)

static uint64_t NowMs()
{
    using namespace std::chrono;
    return (uint64_t)duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

static void Publish(uint32_t state, const char* note)
{
    gShared->state = state;
    std::snprintf(gShared->note, sizeof(gShared->note), "%s", note ? note : "");
    gShared->updatedMs = NowMs();
    gShared->seq++;
}

static bool OpenShared()
{
#ifdef _WIN32
    HANDLE h = CreateFileMappingA(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, 4096, "Local\\AuroraBodyXr");
    if (h)
    {
        void* view = MapViewOfFile(h, FILE_MAP_ALL_ACCESS, 0, 0, 4096);
        if (view)
        {
            gShared = (Shared*)view;
            std::memset(gShared, 0, sizeof(Shared));
            gShared->magic = kMagic;
            gShared->version = 1;
            return true;
        }
    }
    return false;
#else
    gShared = &gLocal;
    gShared->magic = kMagic;
    gShared->version = 1;
    return true;
#endif
}

static bool HasExt(const std::vector<XrExtensionProperties>& list, const char* name)
{
    for (const auto& e : list)
        if (std::strcmp(e.extensionName, name) == 0) return true;
    return false;
}

#define OK(call) (XR_SUCCEEDED(call))

// One full attempt: instance, session, tracker, then the read loop. Returns when something goes wrong.
static void RunOnce()
{
    Publish(0, "starting");
    uint32_t count = 0;
    if (!OK(xrEnumerateInstanceExtensionProperties(nullptr, 0, &count, nullptr)) || count == 0)
    {
        Publish(1, "no OpenXR runtime found");
        return;
    }
    std::vector<XrExtensionProperties> exts(count, { XR_TYPE_EXTENSION_PROPERTIES });
    xrEnumerateInstanceExtensionProperties(nullptr, count, &count, exts.data());

    if (!HasExt(exts, XR_FB_BODY_TRACKING_EXTENSION_NAME))
    {
        Publish(2, "this OpenXR runtime has no body tracking");
        return;
    }
    const bool fullExt = HasExt(exts, XR_META_BODY_TRACKING_FULL_BODY_EXTENSION_NAME);
    const bool headless = HasExt(exts, XR_MND_HEADLESS_EXTENSION_NAME);
    std::vector<const char*> enable = { XR_FB_BODY_TRACKING_EXTENSION_NAME };
    if (fullExt) enable.push_back(XR_META_BODY_TRACKING_FULL_BODY_EXTENSION_NAME);
    bool d3d = false;
    if (headless) enable.push_back(XR_MND_HEADLESS_EXTENSION_NAME);
#ifdef _WIN32
    else if (HasExt(exts, XR_KHR_D3D11_ENABLE_EXTENSION_NAME))
    {
        enable.push_back(XR_KHR_D3D11_ENABLE_EXTENSION_NAME);
        d3d = true;
    }
#endif
    if (!headless && !d3d)
    {
        Publish(3, "runtime needs a graphics API this helper does not have");
        return;
    }

    XrInstanceCreateInfo ici = { XR_TYPE_INSTANCE_CREATE_INFO };
    std::snprintf(ici.applicationInfo.applicationName, XR_MAX_APPLICATION_NAME_SIZE, "Aurora BodyXr");
    ici.applicationInfo.applicationVersion = 1;
    std::snprintf(ici.applicationInfo.engineName, XR_MAX_ENGINE_NAME_SIZE, "Aurora");
    ici.applicationInfo.apiVersion = XR_MAKE_VERSION(1, 0, 0);
    ici.enabledExtensionCount = (uint32_t)enable.size();
    ici.enabledExtensionNames = enable.data();
    XrInstance instance = XR_NULL_HANDLE;
    if (!OK(xrCreateInstance(&ici, &instance)))
    {
        Publish(1, "could not start OpenXR (is the headset connected?)");
        return;
    }

    XrSystemGetInfo sgi = { XR_TYPE_SYSTEM_GET_INFO };
    sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    XrSystemId system = XR_NULL_SYSTEM_ID;
    if (!OK(xrGetSystem(instance, &sgi, &system)))
    {
        Publish(1, "no headset found by OpenXR");
        xrDestroyInstance(instance);
        return;
    }

    XrSystemPropertiesBodyTrackingFullBodyMETA fullProps = { XR_TYPE_SYSTEM_PROPERTIES_BODY_TRACKING_FULL_BODY_META };
    XrSystemBodyTrackingPropertiesFB bodyProps = { XR_TYPE_SYSTEM_BODY_TRACKING_PROPERTIES_FB };
    XrSystemProperties props = { XR_TYPE_SYSTEM_PROPERTIES };
    bodyProps.next = fullExt ? (void*)&fullProps : nullptr;
    props.next = &bodyProps;
    xrGetSystemProperties(instance, system, &props);
    if (!bodyProps.supportsBodyTracking)
    {
        Publish(2, "this headset does not support body tracking");
        xrDestroyInstance(instance);
        return;
    }
    const bool full = fullExt && fullProps.supportsFullBodyTracking;

    PFN_xrCreateBodyTrackerFB createTracker = nullptr;
    PFN_xrDestroyBodyTrackerFB destroyTracker = nullptr;
    PFN_xrLocateBodyJointsFB locateJoints = nullptr;
    xrGetInstanceProcAddr(instance, "xrCreateBodyTrackerFB", (PFN_xrVoidFunction*)&createTracker);
    xrGetInstanceProcAddr(instance, "xrDestroyBodyTrackerFB", (PFN_xrVoidFunction*)&destroyTracker);
    xrGetInstanceProcAddr(instance, "xrLocateBodyJointsFB", (PFN_xrVoidFunction*)&locateJoints);
    if (!createTracker || !destroyTracker || !locateJoints)
    {
        Publish(2, "body tracking functions are missing");
        xrDestroyInstance(instance);
        return;
    }

    XrSessionCreateInfo sci = { XR_TYPE_SESSION_CREATE_INFO };
    sci.systemId = system;
#ifdef _WIN32
    ID3D11Device* device = nullptr;
    XrGraphicsBindingD3D11KHR binding = { XR_TYPE_GRAPHICS_BINDING_D3D11_KHR };
    if (d3d)
    {
        PFN_xrGetD3D11GraphicsRequirementsKHR getReq = nullptr;
        xrGetInstanceProcAddr(instance, "xrGetD3D11GraphicsRequirementsKHR", (PFN_xrVoidFunction*)&getReq);
        XrGraphicsRequirementsD3D11KHR req = { XR_TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR };
        if (!getReq || !OK(getReq(instance, system, &req)))
        {
            Publish(3, "could not get the graphics requirements");
            xrDestroyInstance(instance);
            return;
        }
        IDXGIFactory1* factory = nullptr;
        IDXGIAdapter1* adapter = nullptr;
        if (SUCCEEDED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), (void**)&factory)))
        {
            for (UINT i = 0; factory->EnumAdapters1(i, &adapter) == S_OK; i++)
            {
                DXGI_ADAPTER_DESC1 d;
                adapter->GetDesc1(&d);
                if (std::memcmp(&d.AdapterLuid, &req.adapterLuid, sizeof(LUID)) == 0) break;
                adapter->Release();
                adapter = nullptr;
            }
            factory->Release();
        }
        D3D_FEATURE_LEVEL level = req.minFeatureLevel;
        HRESULT hr = D3D11CreateDevice(adapter, adapter ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE, nullptr, 0, &level, 1, D3D11_SDK_VERSION, &device, nullptr, nullptr);
        if (adapter) adapter->Release();
        if (FAILED(hr) || !device)
        {
            Publish(3, "could not create a graphics device");
            xrDestroyInstance(instance);
            return;
        }
        binding.device = device;
        sci.next = &binding;
    }
#endif
    XrSession session = XR_NULL_HANDLE;
    XrResult sr = xrCreateSession(instance, &sci, &session);
    if (!OK(sr))
    {
        char msg[96];
        std::snprintf(msg, sizeof(msg), "the runtime refused a second session (code %d)", (int)sr);
        Publish(3, msg);
#ifdef _WIN32
        if (device) device->Release();
#endif
        xrDestroyInstance(instance);
        return;
    }

    XrReferenceSpaceCreateInfo rsi = { XR_TYPE_REFERENCE_SPACE_CREATE_INFO };
    rsi.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_LOCAL;
    rsi.poseInReferenceSpace.orientation.w = 1.0f;
    XrSpace space = XR_NULL_HANDLE;
    xrCreateReferenceSpace(session, &rsi, &space);
    rsi.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_VIEW;
    XrSpace viewSpace = XR_NULL_HANDLE;
    xrCreateReferenceSpace(session, &rsi, &viewSpace);

    XrBodyTrackerFB tracker = XR_NULL_HANDLE;
    XrBodyTrackerCreateInfoFB tci = { XR_TYPE_BODY_TRACKER_CREATE_INFO_FB };
    tci.bodyJointSet = full ? XR_BODY_JOINT_SET_FULL_BODY_META : XR_BODY_JOINT_SET_DEFAULT_FB;
    const XrResult tr = createTracker(session, &tci, &tracker);
    if (!OK(tr))
    {
        char msg[96];
        std::snprintf(msg, sizeof(msg), "could not start body tracking (code %d)", (int)tr);
        Publish(3, msg);
    }

    const uint32_t jointCount = full ? (uint32_t)XR_FULL_BODY_JOINT_COUNT_META : (uint32_t)XR_BODY_JOINT_COUNT_FB;
    std::vector<XrBodyJointLocationFB> joints(jointCount);
    bool running = false;
    bool alive = OK(tr);
    uint32_t noData = 0;
    if (alive) Publish(4, "session created, waiting for the headset");

    while (alive)
    {
        XrEventDataBuffer ev = { XR_TYPE_EVENT_DATA_BUFFER };
        while (xrPollEvent(instance, &ev) == XR_SUCCESS)
        {
            if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED)
            {
                const auto* s = (const XrEventDataSessionStateChanged*)&ev;
                if (s->state == XR_SESSION_STATE_READY && !running)
                {
                    XrSessionBeginInfo bi = { XR_TYPE_SESSION_BEGIN_INFO };
                    bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
                    running = OK(xrBeginSession(session, &bi));
                }
                else if (s->state == XR_SESSION_STATE_STOPPING && running)
                {
                    xrEndSession(session);
                    running = false;
                }
                else if (s->state == XR_SESSION_STATE_EXITING || s->state == XR_SESSION_STATE_LOSS_PENDING)
                    alive = false;
            }
            else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING)
                alive = false;
            ev = { XR_TYPE_EVENT_DATA_BUFFER };
        }
        if (!alive) break;
        if (!running)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }

        // pace the loop with an empty frame (no layers: nothing is drawn)
        XrFrameWaitInfo wi = { XR_TYPE_FRAME_WAIT_INFO };
        XrFrameState fs = { XR_TYPE_FRAME_STATE };
        if (!OK(xrWaitFrame(session, &wi, &fs)))
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }
        XrFrameBeginInfo bi2 = { XR_TYPE_FRAME_BEGIN_INFO };
        xrBeginFrame(session, &bi2);

        XrBodyJointsLocateInfoFB li = { XR_TYPE_BODY_JOINTS_LOCATE_INFO_FB };
        li.baseSpace = space;
        li.time = fs.predictedDisplayTime;
        XrBodyJointLocationsFB loc = { XR_TYPE_BODY_JOINT_LOCATIONS_FB };
        loc.jointCount = jointCount;
        loc.jointLocations = joints.data();
        const bool got = OK(locateJoints(tracker, &li, &loc)) && loc.isActive;

        XrFrameEndInfo ei = { XR_TYPE_FRAME_END_INFO };
        ei.displayTime = fs.predictedDisplayTime;
        ei.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
        ei.layerCount = 0;
        ei.layers = nullptr;
        xrEndFrame(session, &ei);

        if (got)
        {
            noData = 0;
            XrSpaceLocation vl = { XR_TYPE_SPACE_LOCATION };
            gShared->viewValid = 0;
            if (viewSpace && OK(xrLocateSpace(viewSpace, space, fs.predictedDisplayTime, &vl)) &&
                (vl.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) && (vl.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT))
            {
                gShared->viewPos[0] = vl.pose.position.x; gShared->viewPos[1] = vl.pose.position.y; gShared->viewPos[2] = vl.pose.position.z;
                gShared->viewRot[0] = vl.pose.orientation.x; gShared->viewRot[1] = vl.pose.orientation.y; gShared->viewRot[2] = vl.pose.orientation.z; gShared->viewRot[3] = vl.pose.orientation.w;
                gShared->viewValid = 1;
            }
            gShared->jointCount = jointCount;
            gShared->fullBody = full ? 1 : 0;
            gShared->confidence = loc.confidence;
            for (uint32_t i = 0; i < jointCount && i < (uint32_t)kMaxJoints; i++)
            {
                const auto& j = joints[i];
                SharedJoint& o = gShared->joints[i];
                o.p[0] = j.pose.position.x; o.p[1] = j.pose.position.y; o.p[2] = j.pose.position.z;
                o.q[0] = j.pose.orientation.x; o.q[1] = j.pose.orientation.y; o.q[2] = j.pose.orientation.z; o.q[3] = j.pose.orientation.w;
                o.flags = 0;
                if (j.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) o.flags |= 1;
                if (j.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) o.flags |= 2;
                if (j.locationFlags & XR_SPACE_LOCATION_POSITION_TRACKED_BIT) o.flags |= 4;
                if (j.locationFlags & XR_SPACE_LOCATION_ORIENTATION_TRACKED_BIT) o.flags |= 8;
            }
            Publish(5, full ? "tracking (full body)" : "tracking");
        }
        else if (++noData == 90)
            Publish(4, "session is up but the headset sends no body data (is body tracking on in the Quest settings?)");
    }

    if (tracker) destroyTracker(tracker);
    if (viewSpace) xrDestroySpace(viewSpace);
    if (space) xrDestroySpace(space);
    if (session) xrDestroySession(session);
#ifdef _WIN32
    if (device) device->Release();
#endif
    xrDestroyInstance(instance);
}

// SteamVR is often the active OpenXR runtime, and it has no body tracking. The body tracking lives in the Meta (Oculus)
// runtime, so point this helper at it, for this process only. Skipped when XR_RUNTIME_JSON is already set.
static void PreferMetaRuntime()
{
#ifdef _WIN32
    char already[8];
    if (GetEnvironmentVariableA("XR_RUNTIME_JSON", already, sizeof(already)) > 0) return;
    char base[MAX_PATH] = {};
    DWORD size = sizeof(base) - 1;
    if (RegGetValueA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Oculus", "Base", RRF_RT_REG_SZ, nullptr, base, &size) != ERROR_SUCCESS) return;
    std::string path = base;
    if (!path.empty() && path.back() != '\\' && path.back() != '/') path += "\\";
    path += "Support\\oculus-runtime\\oculus_openxr_64.json";
    if (GetFileAttributesA(path.c_str()) != INVALID_FILE_ATTRIBUTES) SetEnvironmentVariableA("XR_RUNTIME_JSON", path.c_str());
#endif
}

int main()
{
    if (!OpenShared()) return 1;
    PreferMetaRuntime();
    for (;;)
    {
        RunOnce();
        // wait, then try again: SteamVR or the headset may not be up yet
        for (int i = 0; i < 30; i++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
