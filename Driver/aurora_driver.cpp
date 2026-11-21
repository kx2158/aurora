// Aurora body trackers as a SteamVR driver.
//
// Eight virtual trackers (hips, chest, feet, knees, elbows) that SteamVR lists like Vive trackers, so every
// SteamVR game sees them, not only VRChat. Aurora's body estimator writes the poses into shared memory
// ("Local\AuroraTrackers"); this driver reads them and hands them to SteamVR. Poses are in SteamVR's raw
// tracking space, Aurora converts from standing space before it writes them.
//
// Written against Valve's public OpenVR driver API (BSD-3), following their simpletrackers sample.
#include "openvr_driver.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cmath>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#if defined( _WIN32 )
#define NOMINMAX
#include <windows.h>
#define HMD_DLL_EXPORT extern "C" __declspec( dllexport )
#else
#define HMD_DLL_EXPORT extern "C" __attribute__( ( visibility( "default" ) ) )
#endif

namespace
{
constexpr int kTrackerCount = 8;
constexpr uint32_t kMagic = 0x41555231; // "AUR1"
constexpr int kStaleMs = 500;

// The order is the same as Aurora's TRACKER_ORDER.
const char *const kRoles[ kTrackerCount ] = { "TrackerRole_Waist", "TrackerRole_Chest", "TrackerRole_LeftFoot",
	"TrackerRole_RightFoot", "TrackerRole_LeftKnee", "TrackerRole_RightKnee", "TrackerRole_LeftElbow",
	"TrackerRole_RightElbow" };
const char *const kControllerTypes[ kTrackerCount ] = { "vive_tracker_waist", "vive_tracker_chest",
	"vive_tracker_left_foot", "vive_tracker_right_foot", "vive_tracker_left_knee", "vive_tracker_right_knee",
	"vive_tracker_left_elbow", "vive_tracker_right_elbow" };
const char *const kNames[ kTrackerCount ] = { "hips", "chest", "left_foot", "right_foot", "left_knee", "right_knee",
	"left_elbow", "right_elbow" };

#pragma pack( push, 1 )
struct Slot
{
	uint32_t valid; // 1 when pos and rot are current
	double pos[ 3 ];
	double rot[ 4 ]; // x, y, z, w
};
struct Shared
{
	uint32_t magic;
	uint32_t reserved;
	uint64_t updatedMs; // GetTickCount64 of the last write, from Aurora
	Slot slots[ kTrackerCount ];
};
#pragma pack( pop )

// ---------- shared memory ----------
#if defined( _WIN32 )
HANDLE g_mapping = nullptr;
#endif
Shared *g_shared = nullptr;
Shared g_fallback{}; // used when the mapping fails, so the driver still loads

void OpenShared()
{
#if defined( _WIN32 )
	g_mapping = CreateFileMappingA( INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof( Shared ), "Local\\AuroraTrackers" );
	if ( g_mapping )
	{
		g_shared = static_cast< Shared * >( MapViewOfFile( g_mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof( Shared ) ) );
	}
#endif
	if ( !g_shared )
		g_shared = &g_fallback;
	g_shared->magic = kMagic;
}

void CloseShared()
{
#if defined( _WIN32 )
	if ( g_shared && g_shared != &g_fallback )
		UnmapViewOfFile( g_shared );
	if ( g_mapping )
		CloseHandle( g_mapping );
	g_mapping = nullptr;
#endif
	g_shared = nullptr;
}

uint64_t NowMs()
{
#if defined( _WIN32 )
	return GetTickCount64();
#else
	return std::chrono::duration_cast< std::chrono::milliseconds >( std::chrono::steady_clock::now().time_since_epoch() ).count();
#endif
}

void Log( const std::string &text )
{
	if ( vr::VRDriverLog() )
		vr::VRDriverLog()->Log( ( "aurora: " + text + "\n" ).c_str() );
}

// ---------- one tracker ----------
class AuroraTracker : public vr::ITrackedDeviceServerDriver
{
public:
	explicit AuroraTracker( int index ) : index_( index ), serial_( std::string( "AURORA-" ) + kNames[ index ] ) {}

	const std::string &Serial() const { return serial_; }

	vr::EVRInitError Activate( uint32_t objectId ) override
	{
		deviceIndex_ = objectId;
		vr::PropertyContainerHandle_t c = vr::VRProperties()->TrackedDeviceToPropertyContainer( objectId );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_ModelNumber_String, "Aurora Tracker" );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_ManufacturerName_String, "Aurora" );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_TrackingSystemName_String, "aurora" );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_SerialNumber_String, serial_.c_str() );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_RenderModelName_String, "{htc}vr_tracker_vive_1_0" );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_InputProfilePath_String, "{htc}/input/vive_tracker_profile.json" );
		vr::VRProperties()->SetStringProperty( c, vr::Prop_ControllerType_String, kControllerTypes[ index_ ] );
		vr::VRProperties()->SetInt32Property( c, vr::Prop_ControllerRoleHint_Int32, vr::TrackedControllerRole_Invalid );
		vr::VRProperties()->SetBoolProperty( c, vr::Prop_Identifiable_Bool, false );
		vr::VRDriverInput()->CreateBooleanComponent( c, "/input/system/click", &systemClick_ );

		// Pre-assign the role so the tracker shows up as hips, left foot and so on without the Manage Trackers step.
		const std::string path = "/devices/aurora/" + serial_;
		vr::VRSettings()->SetString( "trackers", path.c_str(), kRoles[ index_ ] );

		active_ = true;
		thread_ = std::thread( &AuroraTracker::PoseLoop, this );
		return vr::VRInitError_None;
	}

	void Deactivate() override
	{
		if ( active_.exchange( false ) && thread_.joinable() )
			thread_.join();
		deviceIndex_ = vr::k_unTrackedDeviceIndexInvalid;
	}

	void EnterStandby() override {}
	void *GetComponent( const char * ) override { return nullptr; }
	void DebugRequest( const char *, char *response, uint32_t size ) override
	{
		if ( size >= 1 )
			response[ 0 ] = 0;
	}
	vr::DriverPose_t GetPose() override { return MakePose(); }

private:
	vr::DriverPose_t MakePose()
	{
		vr::DriverPose_t pose = {};
		pose.qWorldFromDriverRotation.w = 1.0;
		pose.qDriverFromHeadRotation.w = 1.0;
		pose.qRotation.w = 1.0;
		pose.deviceIsConnected = true;
		pose.poseTimeOffset = 0.0;

		const Shared *s = g_shared;
		const bool fresh = s && s->magic == kMagic && s->slots[ index_ ].valid == 1 &&
			( NowMs() - s->updatedMs ) < static_cast< uint64_t >( kStaleMs );
		if ( !fresh )
		{
			pose.poseIsValid = false;
			pose.result = vr::TrackingResult_Running_OutOfRange;
			hasLast_ = false;
			return pose;
		}

		const Slot &slot = s->slots[ index_ ];
		const double len = std::sqrt( slot.rot[ 0 ] * slot.rot[ 0 ] + slot.rot[ 1 ] * slot.rot[ 1 ] +
			slot.rot[ 2 ] * slot.rot[ 2 ] + slot.rot[ 3 ] * slot.rot[ 3 ] );
		if ( len < 1e-6 )
		{
			pose.poseIsValid = false;
			pose.result = vr::TrackingResult_Running_OutOfRange;
			return pose;
		}
		pose.qRotation.x = slot.rot[ 0 ] / len;
		pose.qRotation.y = slot.rot[ 1 ] / len;
		pose.qRotation.z = slot.rot[ 2 ] / len;
		pose.qRotation.w = slot.rot[ 3 ] / len;
		for ( int i = 0; i < 3; i++ )
			pose.vecPosition[ i ] = slot.pos[ i ];

		// a velocity helps SteamVR predict between our updates
		const uint64_t now = NowMs();
		if ( hasLast_ && now > lastMs_ )
		{
			const double dt = static_cast< double >( now - lastMs_ ) / 1000.0;
			if ( dt < 0.2 )
				for ( int i = 0; i < 3; i++ )
					pose.vecVelocity[ i ] = ( slot.pos[ i ] - lastPos_[ i ] ) / dt;
		}
		for ( int i = 0; i < 3; i++ )
			lastPos_[ i ] = slot.pos[ i ];
		lastMs_ = now;
		hasLast_ = true;

		pose.poseIsValid = true;
		pose.result = vr::TrackingResult_Running_OK;
		return pose;
	}

	void PoseLoop()
	{
		while ( active_ )
		{
			if ( deviceIndex_ != vr::k_unTrackedDeviceIndexInvalid )
				vr::VRServerDriverHost()->TrackedDevicePoseUpdated( deviceIndex_, MakePose(), sizeof( vr::DriverPose_t ) );
			std::this_thread::sleep_for( std::chrono::milliseconds( 4 ) );
		}
	}

	int index_;
	std::string serial_;
	uint32_t deviceIndex_ = vr::k_unTrackedDeviceIndexInvalid;
	std::atomic< bool > active_{ false };
	std::thread thread_;
	vr::VRInputComponentHandle_t systemClick_ = vr::k_ulInvalidInputComponentHandle;
	double lastPos_[ 3 ] = { 0, 0, 0 };
	uint64_t lastMs_ = 0;
	bool hasLast_ = false;
};

// ---------- the provider ----------
class AuroraProvider : public vr::IServerTrackedDeviceProvider
{
public:
	vr::EVRInitError Init( vr::IVRDriverContext *context ) override
	{
		VR_INIT_SERVER_DRIVER_CONTEXT( context );
		OpenShared();
		for ( int i = 0; i < kTrackerCount; i++ )
		{
			auto tracker = std::make_unique< AuroraTracker >( i );
			if ( !vr::VRServerDriverHost()->TrackedDeviceAdded( tracker->Serial().c_str(), vr::TrackedDeviceClass_GenericTracker, tracker.get() ) )
			{
				Log( "could not add " + tracker->Serial() );
				return vr::VRInitError_Driver_Unknown;
			}
			trackers_.push_back( std::move( tracker ) );
		}
		Log( "8 trackers added" );
		return vr::VRInitError_None;
	}

	void Cleanup() override
	{
		trackers_.clear();
		CloseShared();
	}

	const char *const *GetInterfaceVersions() override { return vr::k_InterfaceVersions; }
	void RunFrame() override {}
	bool ShouldBlockStandbyMode() override { return false; }
	void EnterStandby() override {}
	void LeaveStandby() override {}

private:
	std::vector< std::unique_ptr< AuroraTracker > > trackers_;
};

AuroraProvider g_provider;
} // namespace

HMD_DLL_EXPORT void *HmdDriverFactory( const char *interfaceName, int *returnCode )
{
	if ( 0 == std::strcmp( vr::IServerTrackedDeviceProvider_Version, interfaceName ) )
		return &g_provider;
	if ( returnCode )
		*returnCode = vr::VRInitError_Init_InterfaceNotFound;
	return nullptr;
}
