"""Rebuild the game's edited firecracker-only track from the supplied video.

Optional asset-preparation tool: Python + NumPy + SciPy + FFmpeg are needed
only to regenerate the MP3, never to run or deploy the game.
"""
import argparse
import io
import json
import pathlib
import subprocess
import sys
import wave

import numpy as np
from scipy import ndimage, signal

root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=pathlib.Path)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--output', type=pathlib.Path, default=root/'sounds/double_skyshot.mp3')
args = parser.parse_args()
if args.source is None:
    videos = list((root/'sounds').glob('*.mp4'))
    if len(videos) != 1:
        parser.error('Pass --source with the reference video path.')
    args.source = videos[0]
ffmpeg = str(pathlib.Path(args.ffmpeg).resolve()) if pathlib.Path(args.ffmpeg).exists() else args.ffmpeg
flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
rate = 44100
decoded = subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(args.source),
                          '-vn', '-ac', '1', '-ar', str(rate), '-f', 'f32le', 'pipe:1'],
                         stdout=subprocess.PIPE, check=True, creationflags=flags).stdout
original = np.frombuffer(decoded, dtype='<f4').astype(np.float64)
if len(original) < rate*9:
    raise ValueError('This recipe expects the supplied 17-second display-shell video.')
frequency, times, spectrum = signal.stft(original, fs=rate, nperseg=1024, noverlap=896)
magnitude = np.abs(spectrum)
background = (times < 1.35) | ((times > 2.5) & (times < 6.1)) | (times > 8.65)
profile = np.percentile(magnitude[:, background], 75, axis=1)[:, None]
harmonic = ndimage.median_filter(magnitude, size=(1, 41))
percussive = ndimage.median_filter(magnitude, size=(17, 1))
transient_mask = percussive**3/(percussive**3 + (harmonic*1.4)**3 + 1e-18)
noise_mask = np.clip(1-(profile*1.7/(magnitude+1e-12))**1.6, 0, 1)
_, clean = signal.istft(spectrum*transient_mask*noise_mask, fs=rate, nperseg=1024, noverlap=896)
clean = clean[:len(original)]
envelope = np.zeros(len(clean))
for start, hold, end in [(1.405, 1.51, 1.615), (7.585, 8.14, 8.62)]:
    first, middle, last = [round(value*rate) for value in (start, hold, end)]
    envelope[first:last] = 1
    attack = round(.003*rate)
    envelope[first:first+attack] = np.linspace(0, 1, attack)
    envelope[middle:last] = np.cos(np.linspace(0, np.pi/2, last-middle))**2
clean *= envelope
low = signal.sosfiltfilt(signal.butter(4, 190, fs=rate, output='sos'), clean)
high = signal.sosfiltfilt(signal.butter(4, 2900, btype='highpass', fs=rate, output='sos'), clean)
clean = (low+high*.8)*envelope
clean *= .91/max(float(np.max(np.abs(clean))), 1e-8)
# Keep the original timing between the launch and booms, but remove one second
# of lead-in and the long conversation-only tail. Gates are silent between cues.
clean = clean[rate:rate*9]
pcm = (np.clip(clean, -1, 1)*32767).astype('<i2')
wav = io.BytesIO()
with wave.open(wav, 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(pcm.tobytes())
args.output.parent.mkdir(parents=True, exist_ok=True)
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0',
                '-codec:a', 'libmp3lame', '-b:a', '128k', str(args.output)],
               input=wav.getvalue(), check=True, creationflags=flags)
print(json.dumps({'output': str(args.output), 'duration': len(clean)/rate,
                  'retainedCueWindows': [[.405, .615], [6.585, 7.62]],
                  'launchAt': .42, 'burstAt': 6.6, 'secondAt': 7.03,
                  'speechOnlyRegionsMuted': True}))
