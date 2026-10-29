"""Bounded-memory, incremental PCM WAV recording for the local Tangerine copy."""
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import secrets
import threading
import wave


class RecordingStore:
    def __init__(self, folder, segment_seconds=3600):
        self.folder = Path(folder)
        self.segment_seconds = segment_seconds
        self.sessions = {}
        self.lock = threading.RLock()

    def info(self, session):
        return {"id": session["id"], "folder": str(self.folder / session["id"]),
                "files": list(session["files"]), "frames": session["frames"],
                "sampleRate": session["rate"], "closed": session["closed"]}

    def reveal_path(self, sid=None):
        """The recordings folder, or one recording's folder: only folders this store made."""
        self.folder.mkdir(parents=True, exist_ok=True)
        if sid is None:
            return self.folder
        if not isinstance(sid, str) or sid not in self.sessions:
            raise KeyError(sid)
        return self.folder / sid

    def start(self, rate, source, seed=None, settings=None):
        if type(rate) is not int or not 8000 <= rate <= 192000:
            raise ValueError("Unsupported sample rate.")
        if settings is not None and (not isinstance(settings, str) or len(settings) > 200_000):
            raise ValueError("Invalid settings note.")
        with self.lock:
            self.folder.mkdir(parents=True, exist_ok=True)
            sid = datetime.now().strftime('%Y-%m-%d_%H-%M-%S_') + secrets.token_hex(6)
            (self.folder / sid).mkdir()
            session = dict(id=sid, rate=rate, frames=0, part_frames=0,
                           files=[], closed=False, sequence=0, last_hash=None,
                           stream=None, wav=None)
            self.sessions[sid] = session
            metadata = {"format": "tangerine-continuous-audio", "sampleRate": rate,
                        "channels": 2, "bits": 16, "source": source, "seed": seed,
                        "started": datetime.now().astimezone().isoformat(),
                        "segmentSeconds": self.segment_seconds,
                        "note": "Audio only. Consecutive WAV parts join without missing or duplicated PCM frames."}
            (self.folder / sid / 'session.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
            if settings is not None:
                (self.folder / sid / 'reglages.txt').write_text(settings, encoding='utf-8')
            return self.info(session)

    def _open_part(self, s):
        name = f'Tangerine_{len(s["files"]) + 1:03d}.wav'
        stream = (self.folder / s['id'] / name).open('w+b')
        wav = wave.open(stream, 'wb')
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(s['rate'])
        wav.writeframes(b'')
        s.update(stream=stream, wav=wav, part_frames=0)
        s['files'].append(name)

    def _close_part(self, s):
        if s['wav'] is not None:
            s['wav'].close()
            s['stream'].flush()
            os.fsync(s['stream'].fileno())
            s['stream'].close()
            s.update(wav=None, stream=None)

    def append(self, sid, sequence, data):
        if not data or len(data) % 4 or len(data) > 2_000_000:
            raise ValueError('Invalid stereo PCM block.')
        digest = hashlib.sha256(data).hexdigest()
        with self.lock:
            s = self.sessions[sid]
            # A lost HTTP response can be retried without duplicating audio.
            if sequence == s['sequence'] - 1 and digest == s['last_hash']:
                return self.info(s)
            if s['closed'] or sequence != s['sequence']:
                raise ValueError('Recording closed or audio block out of order.')
            offset = 0
            while offset < len(data):
                if s['wav'] is None: self._open_part(s)
                room = max(1, int(s['rate'] * self.segment_seconds)) - s['part_frames']
                frames = min(room, (len(data) - offset) // 4)
                s['wav'].writeframes(data[offset:offset + frames * 4])
                s['stream'].flush()
                os.fsync(s['stream'].fileno())
                s['part_frames'] += frames; s['frames'] += frames; offset += frames * 4
                if s['part_frames'] >= int(s['rate'] * self.segment_seconds): self._close_part(s)
            s['sequence'] += 1; s['last_hash'] = digest
            return self.info(s)

    def stop(self, sid):
        with self.lock:
            s = self.sessions[sid]
            self._close_part(s)
            s['closed'] = True
            result = self.info(s)
            (self.folder / sid / 'saved.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            return result

    def close(self):
        with self.lock:
            for sid in list(self.sessions): self.stop(sid)

    def download(self, sid, name):
        # Allow only files belonging to a known recording, never arbitrary paths.
        with self.lock:
            s = self.sessions[sid]
            if name not in s['files']: raise KeyError(name)
            return self.folder / sid / name
