/** Nikon preview delivery can include a fixed-capacity buffer with stale bytes after
 * the main JPEG's EOI. Walk JPEG markers (including progressive scans and stuffed
 * entropy bytes) rather than searching blindly inside EXIF/thumbnail segments. */
export function previewJpeg(bytes:Buffer):Buffer|null {
  if(bytes.length<4 || bytes[0]!==0xff || bytes[1]!==0xd8) return null;
  let offset=2, scan=false, sawScan=false;
  while(offset<bytes.length) {
    if(scan) {
      while(offset<bytes.length && bytes[offset]!==0xff) offset++;
      const markerStart=offset++;
      while(offset<bytes.length && bytes[offset]===0xff) offset++;
      if(offset>=bytes.length) return null;
      const marker=bytes[offset];
      if(marker===0 || (marker>=0xd0 && marker<=0xd7)) {offset++;continue;}
      scan=false;offset=markerStart;continue;
    }
    if(bytes[offset++]!==0xff) return null;
    while(offset<bytes.length && bytes[offset]===0xff) offset++;
    if(offset>=bytes.length) return null;
    const marker=bytes[offset++];
    if(marker===0xd9) return sawScan?bytes.subarray(0,offset):null;
    if(marker===0xd8 || marker===0) return null;
    if(marker===1 || (marker>=0xd0 && marker<=0xd7)) continue;
    if(offset+2>bytes.length) return null;
    const length=bytes.readUInt16BE(offset);
    if(length<2 || offset+length>bytes.length) return null;
    offset+=length;
    if(marker===0xda) {scan=true;sawScan=true;}
  }
  return null;
}
