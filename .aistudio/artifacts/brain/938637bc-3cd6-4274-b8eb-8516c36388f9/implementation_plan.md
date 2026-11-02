# Implementation Plan: Restore Legacy Song Decoding & Fix Polyphonic Encoding

## Cause Analysis
1. **Shifted Note Pitches in Past Songs**: Modifying `readPitchInterval()` from `readLongTail(1, 3)` to `readLongTail(0, 3)` caused all positive pitch intervals in existing songs and recovery history to decode offset by -1 semitone per interval step, corrupting past song data.
2. **Value Out of Bounds Crash**: Calling `writePitchInterval(0)` on polyphonic note pins with no pitch bend (`pin.interval == 0`) triggered an out-of-bounds error in `writeLongTail(1, 3, 0)`.

## Proposed Fixes
1. **Restore Standard BeepBox Pitch Decoder**:
   - Revert `readPitchInterval()` and `writePitchInterval()` in `synth/synth.ts` to exact original BeepBox standard logic (`readLongTail(1, 3)` / `writeLongTail(1, 3)`).
   - This ensures 100% exact backward compatibility for all past song URL hashes, saved recovery states, and project files.

2. **Update Polyphonic Pin Interval Encoding**:
   - In `toBase64String()` for polyphonic sub-channel patterns, write pin intervals using fixed 8-bit offset notation (`polyBits.write(8, pin.interval + 128)`) instead of `writePitchInterval`.
   - In `fromBase64String()`, decode pin intervals using `bits.read(8) - 128`.
   - This cleanly supports pin intervals from -128 to +127 semitones (including `0`) without calling `writePitchInterval` or modifying legacy bitfield decoders.

## Verification
1. Build and verify applet with `compile_applet`.
2. Run `lint_applet` to confirm zero lint/type errors.
3. Restart dev server and verify past songs and newly created songs load correctly.
