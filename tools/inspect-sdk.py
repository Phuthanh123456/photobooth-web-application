"""Read-only PE export/dependency inspection. No proprietary contents are copied."""
import os
import struct
from pathlib import Path

def inspect(file):
    data = file.read_bytes()
    u16 = lambda at: struct.unpack_from('<H', data, at)[0]
    u32 = lambda at: struct.unpack_from('<I', data, at)[0]
    pe = u32(0x3c)
    if data[pe:pe+4] != b'PE\0\0' or u16(pe+24) != 0x20b:
        raise RuntimeError(f'{file.name} is not PE32+ (Windows x64)')
    sections = pe+24+u16(pe+20)
    def offset(rva):
        for i in range(u16(pe+6)):
            at = sections+i*40
            size, virtual, raw_size, raw = struct.unpack_from('<IIII', data, at+8)
            if virtual <= rva < virtual+max(size, raw_size):
                return raw+rva-virtual
        raise RuntimeError('PE RVA is outside all sections')
    def string(rva):
        at=offset(rva)
        return data[at:data.index(b'\0',at)].decode('ascii')
    dependencies=[]
    imports=u32(pe+24+120)
    if imports:
        at=offset(imports)
        while u32(at+12):
            dependencies.append(string(u32(at+12))); at+=20
    exports=[]
    export=u32(pe+24+112)
    if export:
        at=offset(export); names=offset(u32(at+32))
        exports=[string(u32(names+i*4)) for i in range(u32(at+24))]
    print(file.name, 'machine=', hex(u16(pe+4)), 'imports=', ', '.join(dependencies))
    if file.name=='ControlServiceLayer.dll':
        required=['InitializeSDK','FreeSDK','EnumDevices','ConnectDevice','DisconnectDevice','StartShooting','GetShootingStatus','GetCapability','SetCapability','StartOperation','SetImageVideoSavePath','StartLiveView','StopLiveView','GetLiveViewStatus']
        print('Required API exports:', {name:name in exports for name in required})
        if not all(name in exports for name in required): raise RuntimeError('Required SDK exports missing')

root=Path(os.environ['NIKON_SDK_ROOT'])/'Module/Win/BinaryFile'
for file in root.glob('*.dll'): inspect(file)
