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
#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#if defined( _WIN32 )
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>
#pragma comment( lib, "winmm.lib" )
#define HMD_DLL_EXPORT extern "C" __declspec( dllexport )
#else
#define HMD_DLL_EXPORT extern "C" __attribute__( ( visibility( "default" ) ) )
#endif

namespace
{
constexpr int kTrackerCount = 8;
constexpr uint32_t kMagic = 0x41555231; // "AUR1"
constexpr int kStaleMs = 500;
constexpr double kFollowSeconds = 0.02; // how long the shown pose takes to glide to where the tracker is heading

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

// A clock with sub-millisecond resolution (GetTickCount64 only moves every 15 ms).
double NowSec()
{
	return std::chrono::duration< double >( std::chrono::steady_clock::now().time_since_epoch() ).count();
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
			have_ = false;
			return pose;
		}

		// Aurora can be writing while this reads. Read the slot twice and only trust it when both reads agree,
		// otherwise keep the last good pose for this round (a torn read would show as a one-frame spike).
		Slot slot;
		{
			Slot again;
			std::memcpy( &slot, &s->slots[ index_ ], sizeof( Slot ) );
			std::memcpy( &again, &s->slots[ index_ ], sizeof( Slot ) );
			if ( std::memcmp( &slot, &again, sizeof( Slot ) ) != 0 && have_ )
			{
				std::memcpy( slot.pos, samplePos_, sizeof( samplePos_ ) );
				std::memcpy( slot.rot, sampleRot_, sizeof( sampleRot_ ) );
			}
		}
		const double len = std::sqrt( slot.rot[ 0 ] * slot.rot[ 0 ] + slot.rot[ 1 ] * slot.rot[ 1 ] +
			slot.rot[ 2 ] * slot.rot[ 2 ] + slot.rot[ 3 ] * slot.rot[ 3 ] );
		if ( len < 1e-6 )
		{
			pose.poseIsValid = false;
			pose.result = vr::TrackingResult_Running_OutOfRange;
			return pose;
		}
		// Aurora hands over a new pose about 30 to 90 times a second, SteamVR asks for one far more often. Showing
		// the latest pose until the next one arrives would look like stepping, so this builds a continuous motion:
		// it learns how fast the tracker moves from consecutive poses (timed with a fine clock), aims a little ahead
		// along that motion (never past the next pose, so a stop does not overshoot) and glides to that aim with a
		// short smoothing. The velocity SteamVR gets is the one of the gliding pose, so its own prediction agrees.
		const double now = NowSec();
		const bool changed = !have_ || std::memcmp( slot.pos, samplePos_, sizeof( samplePos_ ) ) != 0 ||
			std::memcmp( slot.rot, sampleRot_, sizeof( sampleRot_ ) ) != 0;
		if ( changed )
		{
			const double since = now - sampleT_;
			double jump = 0;
			if ( have_ )
				for ( int i = 0; i < 3; i++ )
					jump += ( slot.pos[ i ] - samplePos_[ i ] ) * ( slot.pos[ i ] - samplePos_[ i ] );
			jump = std::sqrt( jump );
			if ( !have_ || jump > 1.0 || since > 0.5 )
			{
				// first pose, a teleport or a long gap: take it as it is
				for ( int i = 0; i < 3; i++ )
				{
					outPos_[ i ] = slot.pos[ i ];
					vel_[ i ] = 0;
					outVel_[ i ] = 0;
				}
				for ( int i = 0; i < 4; i++ )
					outRot_[ i ] = slot.rot[ i ] / len;
				outT_ = now;
				sampleT_ = now;
			}
			else if ( since > 0.002 )
			{
				interval_ += ( std::min( std::max( since, 0.004 ), 0.1 ) - interval_ ) * 0.2;
				for ( int i = 0; i < 3; i++ )
				{
					const double raw = ( slot.pos[ i ] - samplePos_[ i ] ) / since;
					vel_[ i ] += ( std::min( std::max( raw, -8.0 ), 8.0 ) - vel_[ i ] ) * 0.6;
				}
				sampleT_ = now;
			}
			std::memcpy( samplePos_, slot.pos, sizeof( samplePos_ ) );
			std::memcpy( sampleRot_, slot.rot, sizeof( sampleRot_ ) );
			have_ = true;
		}

		const double ahead = std::min( now - sampleT_, interval_ * 0.8 );
		double dt = now - outT_;
		outT_ = now;
		dt = std::min( std::max( dt, 0.0005 ), 0.05 );
		const double k = 1.0 - std::exp( -dt / kFollowSeconds );
		for ( int i = 0; i < 3; i++ )
		{
			const double aim = samplePos_[ i ] + vel_[ i ] * ahead;
			const double before = outPos_[ i ];
			outPos_[ i ] += ( aim - outPos_[ i ] ) * k;
			outVel_[ i ] += ( ( outPos_[ i ] - before ) / dt - outVel_[ i ] ) * 0.25;
			pose.vecPosition[ i ] = outPos_[ i ];
			pose.vecVelocity[ i ] = outVel_[ i ];
		}
		{
			// the same glide for the rotation (a normalised blend, shortest way round)
			const double sign = ( outRot_[ 0 ] * slot.rot[ 0 ] + outRot_[ 1 ] * slot.rot[ 1 ] + outRot_[ 2 ] * slot.rot[ 2 ] +
				outRot_[ 3 ] * slot.rot[ 3 ] ) < 0 ? -1.0 : 1.0;
			double q[ 4 ], n = 0;
			for ( int i = 0; i < 4; i++ )
			{
				q[ i ] = outRot_[ i ] + ( sign * slot.rot[ i ] / len - outRot_[ i ] ) * k;
				n += q[ i ] * q[ i ];
			}
			n = std::sqrt( n );
			if ( n < 1e-9 )
				n = 1;
			for ( int i = 0; i < 4; i++ )
				outRot_[ i ] = q[ i ] / n;
			pose.qRotation.x = outRot_[ 0 ];
			pose.qRotation.y = outRot_[ 1 ];
			pose.qRotation.z = outRot_[ 2 ];
			pose.qRotation.w = outRot_[ 3 ];
		}

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
	// the last pose Aurora wrote, how fast it is moving, and the pose that is shown (see MakePose)
	bool have_ = false;
	double samplePos_[ 3 ] = { 0, 0, 0 };
	double sampleRot_[ 4 ] = { 0, 0, 0, 1 };
	double sampleT_ = 0;
	double interval_ = 0.033; // seconds between poses from Aurora
	double vel_[ 3 ] = { 0, 0, 0 };
	double outPos_[ 3 ] = { 0, 0, 0 };
	double outRot_[ 4 ] = { 0, 0, 0, 1 };
	double outVel_[ 3 ] = { 0, 0, 0 };
	double outT_ = 0;
};

// ---------- the provider ----------
class AuroraProvider : public vr::IServerTrackedDeviceProvider
{
public:
	vr::EVRInitError Init( vr::IVRDriverContext *context ) override
	{
		VR_INIT_SERVER_DRIVER_CONTEXT( context );
#if defined( _WIN32 )
		timeBeginPeriod( 1 ); // without this the pose loop below only runs about 64 times a second
#endif
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
#if defined( _WIN32 )
		timeEndPeriod( 1 );
#endif
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
