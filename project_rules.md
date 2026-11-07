# Project operating and implementation rules

- Discover Nikon devices only when establishing the SDK connection. Do not call EnumDevices from connected-body readiness, preview transitions or capture: use DeviceReady and propagate its busy/disconnected errors. Preview recovery may restart remote Live View, never replay a shutter. Run the native SDK regression after native changes, and revalidate changed fingerprints before enabling real sessions.

- Record device evidence precisely: Safari iPhone confirmation and WebKit tablet-viewport tests do not establish physical iPad acceptance. Actual iPad testing remains pending until that device is available.
- Stream only the valid main JPEG from Nikon preview buffers. Ignore padding/stale trailer data without recompression; preserve original captured JPEGs and final deliverables unchanged.

- Continue the existing monorepo and history. M0/M1 are preserved. M2A–M2G are now authorized by the supplied master request; hardware-dependent acceptance remains separate from source completion.
- Exactly four photographs; each shutter follows its own full 10,000ms server-monotonic countdown. OS/I/O scheduling can delay a shutter, never shorten its deadline.
- Backend owns state, readiness and timing. Browser timers only monitor connection/reconnect; they never advance a countdown or trigger capture.
- Never overlap camera commands/captures. Never automatically retry an uncertain shutter. Native faults/timeouts latch the real adapter until manual reconciliation/restart.
- Save, full JPEG decode/hash verification and camera readiness precede the next countdown. Only verified images fill frame slots. COMPLETE additionally requires verified final JPG, PDF and output manifest.
- Use the supplied Frame CAP PDF and extracted geometry, not a generic replacement. Each photo appears in both columns of its corresponding row. No stretching; preserve original artwork and print page dimensions.
- MOCK and REAL_NIKON are explicit startup modes. Mock emits labeled valid JPEGs. Never silently fall back from real to mock or present fake SDK data as hardware evidence.
- Real four-photo sessions require a passed, fingerprint-matching single-photo hardware report. The single-photo CLI requires the operator’s exact interactive confirmation before any shutter command. Do not execute physical shutters based on preselected/unanswered UI options.
- Close NX Tether/other camera clients before SDK access. Keep SDK files external, respect Nikon licensing, never commit or redistribute proprietary binaries, headers, samples or manuals.
- iPad is display-only. Controls require the operator capability cookie and localhost Origin. Operator bootstrap is loopback-only. Redact technical errors/paths from display snapshots; do not publicly serve temporary capture directories.
- UUID session IDs and fixed filename routes only; never accept arbitrary filesystem/deletion paths from a browser.
- Reset marks cancellation, waits for in-flight capture/save/finalization, then cleans current temporary data. Late callbacks cannot restore reset state. Completed finals survive new sessions. Deleting the current completed output requires explicit retake confirmation; earlier sessions are preserved.
- Cleanup verifies directory boundaries and rejects symlink/redirection escapes. Storage/deletion failures remain visible; do not silently claim reset succeeded.
- Interruptions/restarts enter ERROR and do not auto-resume. Uncertain native-transfer folders remain for operator inspection until an explicit reset can release the SDK process and safely clean the current registered transfer. Orphans from earlier processes require manual inspection.
- Keep captures, outputs, native binaries, hardware reports, secrets and local build/SDK compatibility files out of Git. Never reset history or push without a request.
- Commit each completed main milestone after applicable tests. Incomplete physical milestones must remain explicitly blocked/not tested; do not claim mock tests establish hardware acceptance.
