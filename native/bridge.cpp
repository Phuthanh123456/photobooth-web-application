// Original application bridge. Nikon headers and binaries remain external.
// API signatures are supplied by Remote SDK v2.1.0 Maid3.h/Maid3d1.h.
#include <cstdint>
#if defined(__GNUC__) && !defined(_MSC_VER)
// Nikon's legacy stdint fallback predates modern MinGW. Use the standard types.
#define _NKSTDINT_H_INCLUDED
#endif
#include <windows.h>
#include <wincrypt.h>
#include "Maid3.h"
#include "Maid3d1.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
static_assert(sizeof(void*)==8 && sizeof(ULONG)==4 && sizeof(wchar_t)==2, "Windows x64 ABI required");
static_assert(sizeof(NkMAIDEnum)==26 && sizeof(NkMAIDCSCallback)==48, "Nikon SDK structure packing changed");
namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;
static std::mutex stateMutex, outputMutex, frameMutex;
static std::condition_variable changed;
static std::atomic<bool> running{true}, poisoned{false}, preview{false};
static fs::path transferDirectory, savedFile;
static std::string transferError;
static std::vector<unsigned char> latestFrame;
static Clock::time_point captureStarted, captureCompleted, imageSaved;
static bool capturing=false, exposureEvent=false;
static std::string quote(const std::string& text) {
  std::string result="\"";
  for (unsigned char c:text) { if(c=='"'||c=='\\') { result+='\\'; result+=c; } else if(c<32) result+=' '; else result+=c; }
  return result+'"';
}
static std::string utf8(const fs::path& value) { return value.u8string(); }
static std::string b64(const unsigned char* data, size_t size) {
  DWORD length=0; CryptBinaryToStringA(data,(DWORD)size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&length);
  std::string result(length,'\0');
  if(!CryptBinaryToStringA(data,(DWORD)size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,result.data(),&length)) throw std::runtime_error("Base64 encoding failed");
  result.resize(length); if(!result.empty() && result.back()=='\0') result.pop_back(); return result;
}
static std::string unb64(const std::string& value) {
  DWORD length=0;
  if(!CryptStringToBinaryA(value.data(),(DWORD)value.size(),CRYPT_STRING_BASE64,nullptr,&length,nullptr,nullptr)) throw std::runtime_error("Invalid path encoding");
  std::string result(length,'\0');
  if(!CryptStringToBinaryA(value.data(),(DWORD)value.size(),CRYPT_STRING_BASE64,(BYTE*)result.data(),&length,nullptr,nullptr)) throw std::runtime_error("Invalid path encoding");
  return result;
}
static void emit(const std::string& id,const std::string& kind,const std::string& value) {
  std::lock_guard<std::mutex> lock(outputMutex); std::cout<<id<<'\t'<<kind<<'\t'<<value<<std::endl;
}
static void* __stdcall allocateMemory(size_t length) { return std::malloc(length); }
static void __stdcall releaseMemory(void* memory) { std::free(memory); }
static ULONG CALLBACK uiRequest(NKREF,LPNkMAIDUIRequestInfo) { poisoned=true; return kNkMAIDUIRequestResult_Cancel; }
static void CALLBACK progress(ULONG,ULONG,NKREF,ULONG,ULONG) {}
static NKERROR CALLBACK imageData(NKREF,LPVOID,LPVOID) { return kNkMAIDResult_NoError; }
static void CALLBACK liveData(NKREF,LPNkMAIDLiveViewData data) {
  if(!data) return;
  // SDK uses our allocator. Copy at callback boundary, release delivered buffers.
  if(preview && data->pImageData && data->ulLvImageSize>4 && data->ulLvImageSize<4*1024*1024) {
    auto* bytes=(unsigned char*)data->pImageData;
    if(bytes[0]==0xff && bytes[1]==0xd8) { std::lock_guard<std::mutex> lock(frameMutex); latestFrame.assign(bytes,bytes+data->ulLvImageSize); }
  }
  std::free(data->pImageData); std::free(data);
}
static void CALLBACK eventProc(NKREF,ULONG event,NKPARAM data) {
  std::lock_guard<std::mutex> lock(stateMutex);
  if(event==kNkMAIDEvent_ImageSaved) {
    if(data) {
      fs::path file((wchar_t*)data);
      if(capturing) {
        auto candidate=file.is_absolute()?file:transferDirectory/file.filename();
        std::string ext=candidate.extension().string(); std::transform(ext.begin(),ext.end(),ext.begin(),::tolower);
        if(candidate.lexically_normal().parent_path()==transferDirectory.lexically_normal() && (ext==".jpg"||ext==".jpeg")) {
          if(!savedFile.empty()) transferError="More than one JPEG arrived for a single shutter";
          savedFile=candidate; imageSaved=Clock::now(); changed.notify_all();
        }
      }
      std::free((void*)data);
    }
  } else if(event==kNkMAIDEvent_CaptureComplete && capturing && !exposureEvent) { captureCompleted=Clock::now(); exposureEvent=true; }
  else if(event==kNkMAIDEvent_AcquireFailed_ImageNotSaved || event==kNkMAIDEvent_StorageFull_ImageNotSaved) { transferError="SDK reported image transfer/storage failure"; poisoned=true; changed.notify_all(); }
  else if((event==kNkMAIDEvent_CapChange || event==kNkMAIDEvent_CapChangeOperationOnly) && data) std::free((void*)data);
}
template<typename T> static T symbol(HMODULE dll,const char* name) {
  auto proc=GetProcAddress(dll,name); if(!proc) throw std::runtime_error(std::string("SDK export missing: ")+name); return reinterpret_cast<T>(proc);
}
static void check(long result,const char* operation) { if(result!=0) throw std::runtime_error(std::string(operation)+" failed (SDK code "+std::to_string(result)+")"); }

class Camera {
  friend struct NativeCameraRegression;
  HMODULE dll=nullptr;
  DLL_DIRECTORY_COOKIE dllDirectory=nullptr;
  bool initialized=false,connected=false;
  NkMAIDDeviceInfo device{};
  std::vector<NkMAIDCapInfo> capabilities;
  NkMAIDCSCallback callbacks{};
  LPMAIDInitializeSDKProc initialize=nullptr;
  LPMAIDFreeSDKProc release=nullptr;
  LPMAIDConnectDeviceProc connect=nullptr;
  LPMAIDDisconnectDeviceProc disconnect=nullptr;
  LPMAIDEnumDevices enumerate=nullptr;
  LPMAIDGetLiveViewStatus liveViewStatus=nullptr;
  LPMAIDStartShooting shoot=nullptr;
  LPMAIDGetShootingStatus shootingStatus=nullptr;
  LPMAIDStartOperation startOperation=nullptr;
  LPMAIDSetImageVideoSavePath setSavePath=nullptr;
  LPMAIDGetCapability getCapability=nullptr;
  LPMAIDSetCapability setCapability=nullptr;
  LPMAIDStartLiveView startPreview=nullptr;
  LPMAIDStopLiveView stopPreview=nullptr;
  static void freeDevices(LPNkMAIDEnumDevices list) { if(list) { std::free(list->pDeviceData); std::free(list); } }
  NkMAIDEnum getEnum(ULONG cap,eNkSDKGetSettingRequestType request) {
    LPVOID value=nullptr; eNkMAIDDataType type=kNkMAIDDataType_Null;
    check(getCapability(cap,request,value,type),"GetCapability");
    if(!value || type!=kNkMAIDDataType_EnumPtr) { std::free(value); throw std::runtime_error("Expected enumerated camera setting"); }
    NkMAIDEnum result=*(NkMAIDEnum*)value; std::free(value); return result;
  }
  ULONG unsignedValue(ULONG capability) {
    LPVOID value=nullptr; eNkMAIDDataType type=kNkMAIDDataType_Null;
    check(getCapability(capability,kNkSDKGetSettingValue,value,type),"GetCapability unsigned");
    if(!value || type!=kNkMAIDDataType_UnsignedPtr) {std::free(value);throw std::runtime_error("Unexpected unsigned capability type");}
    ULONG result=*(ULONG*)value;std::free(value);return result;
  }
  std::string setJpegSetting(ULONG cap,bool quality) {
    auto values=getEnum(cap,kNkSDKGetSettingSupportedValueArray);
    std::vector<std::string> labels;
    if(values.ulType==kNkMAIDArrayType_PackedString && values.pData && values.ulElements<65536) {
      auto* bytes=(char*)values.pData; size_t offset=0;
      while(offset<values.ulElements) { size_t len=strnlen(bytes+offset,values.ulElements-offset); if(len==0) break; labels.emplace_back(bytes+offset,len); offset+=len+1; }
    }
    std::free(values.pData);
    int chosen=-1; long long largest=0;
    for(size_t i=0;i<labels.size();i++) {
      auto label=labels[i]; std::transform(label.begin(),label.end(),label.begin(),::tolower);
      if(quality) { if(label.find("fine")!=std::string::npos && label.find("raw")==std::string::npos && label.find("nef")==std::string::npos) chosen=(int)i; }
      else {
        std::smatch match;
        if(label=="l" || label.find("large")!=std::string::npos || label.find("size l")!=std::string::npos) {chosen=(int)i;break;}
        if(std::regex_search(label,match,std::regex("([0-9]{3,5})[ x]+([0-9]{3,5})"))) { long long area=std::stoll(match[1])*std::stoll(match[2]); if(area>largest) {largest=area;chosen=(int)i;} }
      }
    }
    if(chosen<0) throw std::runtime_error("Cannot identify JPEG Fine/Large in SDK-supported settings; inspect camera settings instead of guessing indices");
    auto setting=getEnum(cap,kNkSDKGetSettingValue); std::free(setting.pData); setting.pData=nullptr; setting.ulValue=chosen;
    check(setCapability(cap,&setting,kNkMAIDDataType_EnumPtr),"SetCapability");
    auto verified=getEnum(cap,kNkSDKGetSettingValue); bool matches=verified.ulValue==(ULONG)chosen; std::free(verified.pData);
    if(!matches) throw std::runtime_error("Camera setting verification failed"); return labels[chosen];
  }
  bool hardwareReady() {
    eNkMAIDShootingStatus status=kNkMAIDShootingInvalidStatus;
    auto result=shootingStatus(status);
    if(result==S_OK && status!=kNkSDKShootingFinishedOrNotStarted) return false;
    // On this Z30, the SDK returns S_FALSE with FinishedOrNotStarted before a
    // shooting job exists. Do not equate that with readiness: query the body's
    // explicitly advertised DeviceReady process instead.
    const auto capability=std::find_if(capabilities.begin(),capabilities.end(),[](const auto& cap) {
      return cap.ulID==kNkMAIDCapability_DeviceReady && cap.ulType==kNkMAIDCapType_Process && (cap.ulOperations&kNkMAIDCapOperation_Start);
    });
    if(capability!=capabilities.end()) {
      if(result!=S_OK && result!=S_FALSE) check(result,"GetShootingStatus");
      auto readyResult=startOperation(kNkMAIDCapability_DeviceReady,nullptr,nullptr);
      if(readyResult==kNkMAIDResult_DeviceBusy) return false;
      check(readyResult,"DeviceReady"); return true;
    }
    check(result,"GetShootingStatus (DeviceReady capability unavailable)");
    return status==kNkSDKShootingFinishedOrNotStarted;
  }
 public:
  ~Camera() { try {close();} catch(...) {} }
  void close() {
    long disconnectResult=0,freeResult=0;
    if(connected) { if(preview) stopPreview(nullptr,nullptr); preview=false; disconnectResult=disconnect(); connected=false; }
    if(initialized) { freeResult=release(); initialized=false; }
    if(dll) { FreeLibrary(dll);dll=nullptr; }
    if(dllDirectory) {RemoveDllDirectory(dllDirectory);dllDirectory=nullptr;}
    check(disconnectResult,"DisconnectDevice");check(freeResult,"FreeSDK");
  }
  std::string open(const fs::path& sdk) {
    if(initialized) throw std::runtime_error("SDK already initialized");
    fs::path bin=sdk/L"Module"/L"Win"/L"BinaryFile";
    // Nikon loads its transport DLLs lazily during discovery, after the main DLL load.
    // Retain the scoped SDK search directory until FreeSDK/FreeLibrary have completed.
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS); dllDirectory=AddDllDirectory(bin.c_str());
    if(!dllDirectory) throw std::runtime_error("Unable to register the Nikon SDK DLL directory");
    dll=LoadLibraryExW((bin/L"ControlServiceLayer.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if(!dll) throw std::runtime_error("Unable to load Nikon SDK/dependencies; Windows error "+std::to_string(GetLastError()));
#define BIND(field,type,name) field=symbol<type>(dll,name)
    BIND(initialize,LPMAIDInitializeSDKProc,"InitializeSDK"); BIND(release,LPMAIDFreeSDKProc,"FreeSDK");
    BIND(connect,LPMAIDConnectDeviceProc,"ConnectDevice"); BIND(disconnect,LPMAIDDisconnectDeviceProc,"DisconnectDevice");
    BIND(enumerate,LPMAIDEnumDevices,"EnumDevices"); BIND(shoot,LPMAIDStartShooting,"StartShooting");
    BIND(shootingStatus,LPMAIDGetShootingStatus,"GetShootingStatus"); BIND(getCapability,LPMAIDGetCapability,"GetCapability"); BIND(setCapability,LPMAIDSetCapability,"SetCapability");
    BIND(startOperation,LPMAIDStartOperation,"StartOperation");
    BIND(setSavePath,LPMAIDSetImageVideoSavePath,"SetImageVideoSavePath");
    BIND(startPreview,LPMAIDStartLiveView,"StartLiveView"); BIND(stopPreview,LPMAIDStopLiveView,"StopLiveView");
    BIND(liveViewStatus,LPMAIDGetLiveViewStatus,"GetLiveViewStatus");
#undef BIND
    callbacks.pUIReqProc=(LPNKFUNC)uiRequest; callbacks.pfnEventProc=(LPNKFUNC)eventProc; callbacks.pProgressProc=(LPNKFUNC)progress;
    callbacks.pDataProc=(LPNKFUNC)imageData; callbacks.pLiveViewDataProc=(LPNKFUNC)liveData;
    LPNkMAIDEnumDevices devices=nullptr;
    check(initialize(allocateMemory,releaseMemory,&callbacks,&devices,nullptr),"InitializeSDK"); initialized=true;
    // Device discovery may be asynchronous. Enumeration alone never triggers a shutter.
    auto deadline=Clock::now()+std::chrono::seconds(5); bool found=false;
    std::string observed="No devices enumerated";
    do {
      observed="Enumerated "+std::to_string(devices?devices->ulElements:0)+" device(s)";
      if(devices && devices->pDeviceData) for(ULONG i=0;i<devices->ulElements;i++) {
        auto& d=devices->pDeviceData[i]; std::string name(d.Name,strnlen(d.Name,64));
        observed+="; "+name+" available="+(d.Availability?std::string("true"):std::string("false"))+" ownerPID="+std::to_string(d.ulConnectedPID);
        if(d.Availability && (name.find("Z30")!=std::string::npos || name.find("Z 30")!=std::string::npos)) {device=d;found=true;break;}
      }
      freeDevices(devices);devices=nullptr; if(found) break;
      std::this_thread::sleep_for(std::chrono::milliseconds(200)); check(enumerate(devices,nullptr,nullptr),"EnumDevices");
    } while(Clock::now()<deadline);
    freeDevices(devices);
    if(!found) throw std::runtime_error("No available Nikon Z30 detected. "+observed+". Close NX Tether and check USB.");
    LPNkMAIDEnumCapInfo info=nullptr;
    check(connect(device.ID,&info),"ConnectDevice"); connected=true;
    if(info) {if(info->pCapArray) capabilities.assign(info->pCapArray,info->pCapArray+info->ulCapCount);std::free(info->pCapArray);std::free(info);}
    return "{\"id\":"+std::to_string(device.ID)+",\"name\":"+quote(std::string(device.Name,strnlen(device.Name,64)))+",\"version\":"+quote(std::string(device.Version,strnlen(device.Version,64)))+"}";
  }
  void ready() {
    if(poisoned || !connected) throw std::runtime_error("Camera state is uncertain/disconnected; restart and validate manually");
    if(!hardwareReady()) throw std::runtime_error("Camera busy");
    // DeviceReady talks to the connected body and propagates disconnect errors.
    // EnumDevices is discovery, not readiness. Refreshing USB discovery here
    // races the SDK Live View/event thread (observed DeviceFailed/-108).
    // Discover once in open(); never rediscover during READY/LIVE/CAPTURE.
  }
  std::string configure() {
    ready(); auto quality=setJpegSetting(kNkMAIDCapability_CompressionLevel,true); auto size=setJpegSetting(kNkMAIDCapability_ImageSize,false);
    // Card-only (0) captures successfully but never transfers a JPEG to the PC.
    // Retain the on-card original while explicitly enabling host/SDRAM transfer.
    ULONG media=kNkMAIDSaveMedia_Card_SDRAM;
    check(setCapability(kNkMAIDCapability_SaveMedia,&media,kNkMAIDDataType_UnsignedPtr),"Set SaveMedia Card + SDRAM");
    if(unsignedValue(kNkMAIDCapability_SaveMedia)!=media) throw std::runtime_error("PC image transfer target was not verified");
    return "{\"quality\":"+quote(quality)+",\"size\":"+quote(size)+",\"saveMedia\":"+std::to_string(media)+"}";
  }
  void live(bool enable) {
    ready();
    eNkMAIDLVStatus status=eNkMAIDLVStatus_OFF;
    check(liveViewStatus(status),"GetLiveViewStatus");
    // A former SDK process may have left remote LV enabled. Reclaim only remote
    // preview, never camera/menu live view, and never issue a shutter here.
    if(enable && preview && status==eNkMAIDLVStatus_ON_RemoteLV) return;
    if(preview || status==eNkMAIDLVStatus_ON_RemoteLV) {
      check(stopPreview(nullptr,nullptr),"StopLiveView");preview=false;
      std::lock_guard<std::mutex> lock(frameMutex);latestFrame.clear();
    }
    if(enable) {
      LPVOID value=nullptr; eNkMAIDDataType type=kNkMAIDDataType_Null;
      check(getCapability(kNkMAIDCapability_LiveViewProhibit,kNkSDKGetSettingValue,value,type),"LiveViewProhibit");
      if(!value || type!=kNkMAIDDataType_UnsignedPtr) {std::free(value);throw std::runtime_error("Unknown Live View prohibition data type");}
      ULONG prohibit=*(ULONG*)value; std::free(value); if(prohibit) throw std::runtime_error("Camera prohibits Live View");
      check(startPreview(nullptr,nullptr),"StartLiveView"); preview=true;
    }
  }
  std::string capture(const fs::path& directory) {
    ready(); const bool resume=preview; if(resume) live(false);
    fs::create_directories(directory);
    if(!fs::is_empty(directory)) throw std::runtime_error("Capture transfer directory must be empty");
    MAIDShootingStructure request{}; request.ShootingType=kNkSDKShootingTypeSingle; request.bAutoFocus=true;
    auto location=fs::absolute(directory).lexically_normal();
    if(location.native().size()>=1024) throw std::runtime_error("Capture path too long");
    wcscpy_s(request.ImageSavePath,1024,location.c_str());
    if(unsignedValue(kNkMAIDCapability_SaveMedia)!=kNkMAIDSaveMedia_Card_SDRAM) throw std::runtime_error("SaveMedia changed; refusing card-only capture");
    check(setSavePath(location.c_str(),L""),"SetImageVideoSavePath");
    {std::lock_guard<std::mutex> lock(stateMutex);transferDirectory=location;savedFile.clear();transferError.clear();capturing=true;exposureEvent=false;captureStarted=Clock::now();}
    // No retry: any error after this point is an uncertain physical shutter.
    try {
      check(shoot(request,nullptr,nullptr),"StartShooting");
      auto deadline=Clock::now()+std::chrono::seconds(30);
      while(Clock::now()<deadline) {
        std::unique_lock<std::mutex> lock(stateMutex);
        changed.wait_for(lock,std::chrono::milliseconds(50));
        if(!transferError.empty()) throw std::runtime_error(transferError);
        const bool saved=!savedFile.empty(); lock.unlock();
        if(saved && hardwareReady()) break;
      }
      std::string result;
      { std::lock_guard<std::mutex> lock(stateMutex);
        if(savedFile.empty() || Clock::now()>=deadline) throw std::runtime_error(std::string("JPEG transfer timeout; shutter outcome uncertain; CaptureComplete observed=")+(exposureEvent?"true":"false"));
        if(!fs::exists(savedFile) || fs::file_size(savedFile)==0) throw std::runtime_error("SDK saved event did not produce a nonempty file");
        auto total=std::chrono::duration_cast<std::chrono::milliseconds>(imageSaved-captureStarted).count();
        result="{\"path\":"+quote(utf8(savedFile))+",\"totalMs\":"+std::to_string(total)+",\"captureMs\":";
        result+=exposureEvent?std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(captureCompleted-captureStarted).count()):"null";
        result+=",\"transferMs\":";
        result+=exposureEvent && captureCompleted<=imageSaved?std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(imageSaved-captureCompleted).count()):"null";
        result+="}";capturing=false;
      }
      if(resume) { try {live(true);} catch(const std::exception& e) {emit("0","PREVIEW_ERROR",quote(e.what()));} }
      return result;
    } catch(...) {poisoned=true;std::lock_guard<std::mutex> lock(stateMutex);capturing=false;throw;}
  }
};
int main(int argc,char** argv) {
  if(argc!=2) {std::cerr<<"Usage: nikon-bridge <external-sdk-root>\n";return 2;}
  // Let Node handle terminal interruption and send CLOSE. Otherwise Windows
  // terminates this child before StopLiveView/DisconnectDevice can run.
  SetConsoleCtrlHandler([](DWORD event)->BOOL {
    return event==CTRL_C_EVENT || event==CTRL_BREAK_EVENT;
  },TRUE);
  // One input command at a time. Callback frames are coalesced into one bounded slot.
  std::thread sender([] {while(running) {std::this_thread::sleep_for(std::chrono::milliseconds(120));std::vector<unsigned char> frame;{std::lock_guard<std::mutex> lock(frameMutex);frame.swap(latestFrame);}if(!frame.empty()) emit("0","FRAME",b64(frame.data(),frame.size()));}});
  Camera camera;
  for(std::string line;std::getline(std::cin,line);) {
    if(line.size()>16*1024) break;
    std::istringstream input(line); std::string id,command,arg;std::getline(input,id,'\t');std::getline(input,command,'\t');std::getline(input,arg);
    if(!std::regex_match(id,std::regex("[1-9][0-9]{0,9}"))) break;
    try {
      std::string result="{}";
      if(command=="INIT") result=camera.open(fs::u8path(argv[1]));
      else if(command=="READY") camera.ready();
      else if(command=="CONFIGURE") result=camera.configure();
      else if(command=="CAPTURE") result=camera.capture(fs::u8path(unb64(arg)));
      else if(command=="LIVE_START") camera.live(true);
      else if(command=="LIVE_STOP") camera.live(false);
      else if(command=="CLOSE") {camera.close();emit(id,"OK",result);break;}
      else throw std::runtime_error("Unknown command");
      emit(id,"OK",result);
    } catch(const std::exception& e) {emit(id,"ERROR",quote(e.what()));}
  }
  try {camera.close();} catch(...) {} running=false;sender.join();return 0;
}
