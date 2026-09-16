export const BASIC_PITCH_GUITAR_PROFILE_VERSION = '0.2.0';
export const BASIC_PITCH_GUITAR_ONSET_THRESHOLD = 0.5;
export const BASIC_PITCH_GUITAR_FRAME_THRESHOLD = 0.3;
export const BASIC_PITCH_GUITAR_MIN_NOTE_LENGTH_FRAMES = 11;

export function basicPitchGuitarAdmissionProfile() {
  return Object.freeze({
    version: BASIC_PITCH_GUITAR_PROFILE_VERSION,
    onsetThreshold: BASIC_PITCH_GUITAR_ONSET_THRESHOLD,
    frameThreshold: BASIC_PITCH_GUITAR_FRAME_THRESHOLD,
    minimumNoteLengthFrames: BASIC_PITCH_GUITAR_MIN_NOTE_LENGTH_FRAMES,
    authority: 'REPO_LOCAL_GUITAR_ADMISSION_PROFILE',
    sourceProvider: '@spotify/basic-pitch',
  });
}
