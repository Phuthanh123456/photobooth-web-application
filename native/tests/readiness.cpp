// Tests execute the production Camera implementation with injected SDK functions.
// They never load Nikon DLLs, enumerate USB devices, or trigger a physical shutter.
#define main photobooth_bridge_entry
#include "../bridge.cpp"
#undef main

static int discoveries=0,readyChecks=0,shutters=0;
static NKERROR readyResult=0;
static HRESULT shootingResult=S_FALSE;
static eNkMAIDLVStatus liveStatus=eNkMAIDLVStatus_OFF;
static int previewStarts=0,previewStops=0;
static NKERROR WINAPI fakeLiveStatus(eNkMAIDLVStatus& status) {status=liveStatus;return 0;}
static NKERROR WINAPI fakePreviewStart(LPMAIDAsyncCompletionProc,NKREF) {
  previewStarts++;liveStatus=eNkMAIDLVStatus_ON_RemoteLV;return 0;
}
static NKERROR WINAPI fakePreviewStop(LPMAIDAsyncCompletionProc,NKREF) {
  previewStops++;liveStatus=eNkMAIDLVStatus_OFF;return 0;
}
static NKERROR WINAPI fakeCapability(ULONG,eNkSDKGetSettingRequestType,LPVOID& value,eNkMAIDDataType& type) {
  value=std::malloc(sizeof(ULONG));*(ULONG*)value=0;type=kNkMAIDDataType_UnsignedPtr;return 0;
}
static HRESULT WINAPI fakeStatus(eNkMAIDShootingStatus& status) {
  status=kNkSDKShootingFinishedOrNotStarted;return shootingResult;
}
static NKERROR WINAPI fakeReady(ULONG cap,LPMAIDAsyncCompletionProc,NKREF) {
  if(cap!=kNkMAIDCapability_DeviceReady) throw std::runtime_error("Wrong readiness capability");
  readyChecks++;return readyResult;
}
static NKERROR WINAPI failedDiscovery(LPNkMAIDEnumDevices&,LPMAIDAsyncCompletionProc,NKREF) {
  discoveries++;return kNkMAIDAPIResult_DeviceFailed;
}
static NKERROR WINAPI fakeShutter(MAIDShootingStructure&,LPMAIDAsyncCompletionProc,NKREF) {
  shutters++;return kNkMAIDResult_NoError;
}
static void require(bool condition,const char* message) {if(!condition) throw std::runtime_error(message);}
template<typename F> static void rejects(F operation,const char* message) {
  bool failed=false;try {operation();} catch(const std::exception&) {failed=true;}
  require(failed,message);
}
struct NativeCameraRegression {
  static void run() {
    Camera camera;camera.connected=true;camera.shootingStatus=fakeStatus;
    camera.startOperation=fakeReady;camera.enumerate=failedDiscovery;camera.shoot=fakeShutter;
    camera.liveViewStatus=fakeLiveStatus;camera.startPreview=fakePreviewStart;
    camera.stopPreview=fakePreviewStop;camera.getCapability=fakeCapability;
    NkMAIDCapInfo capability{};capability.ulID=kNkMAIDCapability_DeviceReady;
    capability.ulType=kNkMAIDCapType_Process;capability.ulOperations=kNkMAIDCapOperation_Start;
    camera.capabilities.push_back(capability);
    try {
      // Four-photo lifecycle repeatedly checks READY before/after preview/capture.
      for(int photo=1;photo<=4;photo++) for(int check=0;check<20;check++) camera.ready();
      require(discoveries==0,"Connected camera must never rediscover devices");
      require(readyChecks==80,"Every readiness check must reach the body");
      liveStatus=eNkMAIDLVStatus_ON_RemoteLV;preview=false;
      camera.live(true);
      require(previewStops==1 && previewStarts==1,"Orphan remote preview must stop before restart");
      camera.live(true);require(previewStarts==1,"Running preview must not restart repeatedly");
      camera.live(false);require(previewStops==2 && !preview,"Preview must stop cleanly");
      readyResult=kNkMAIDResult_DeviceBusy;
      rejects([&]{camera.capture(fs::path(L"unused"));},"Busy camera must block capture");
      readyResult=kNkMAIDAPIResult_DeviceNotAvailable;
      rejects([&]{camera.ready();},"Disconnected body must fail readiness");
      rejects([&]{camera.capture(fs::path(L"unused"));},"Disconnected body must block capture");
      readyResult=0;shootingResult=E_FAIL;
      rejects([&]{camera.ready();},"Shooting-status failures must propagate");
      require(shutters==0,"Preflight failure must never issue a shutter");
      shootingResult=S_FALSE;poisoned=true;
      rejects([&]{camera.ready();},"Uncertain camera must stay locked");poisoned=false;
      camera.connected=false;rejects([&]{camera.ready();},"Closed camera must stay locked");
    } catch(...) {camera.connected=false;poisoned=false;preview=false;throw;}
  }
};
int main() {
  try {NativeCameraRegression::run();std::cout<<"PASS: native readiness, discovery isolation, busy/disconnected/error gates; zero shutters\n";return 0;}
  catch(const std::exception& error) {std::cerr<<"FAIL: "<<error.what()<<'\n';return 1;}
}
