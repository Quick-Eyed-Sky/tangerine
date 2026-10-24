"""Real PCM round-trips: rotation, retry, progressive WAV headers and ordering."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import wave

spec = importlib.util.spec_from_file_location('recording_store', Path(__file__).resolve().parents[1] / 'scripts/recording_store.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RecordingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = module.RecordingStore(self.tmp.name, segment_seconds=0.01)
        self.info = self.store.start(8000, 'test', 7)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def pcm(self, frames):
        return b''.join(struct.pack('<hh', i, -i) for i in range(frames))

    def read(self, info):
        out = b''
        for name in info['files']:
            with wave.open(str(Path(info['folder']) / name), 'rb') as wav:
                self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate()), (2, 2, 8000))
                out += wav.readframes(wav.getnframes())
        return out

    def test_rotation_preserves_every_stereo_frame(self):
        data = self.pcm(235)
        self.store.append(self.info['id'], 0, data[:400])
        self.store.append(self.info['id'], 1, data[400:])
        info = self.store.stop(self.info['id'])
        self.assertEqual(len(info['files']), 3)
        self.assertEqual(info['frames'], 235)
        self.assertEqual(self.read(info), data)

    def test_retry_does_not_duplicate_audio(self):
        data = self.pcm(50)
        self.store.append(self.info['id'], 0, data)
        info = self.store.append(self.info['id'], 0, data)
        self.assertEqual(info['frames'], 50)
        self.assertEqual(self.read(info), data)

    def test_progressive_file_readable_before_stop(self):
        data = self.pcm(45)
        info = self.store.append(self.info['id'], 0, data)
        self.assertFalse(info['closed'])
        self.assertEqual(self.read(info), data)

    def test_out_of_order_or_changed_retry_rejected(self):
        data = self.pcm(50)
        with self.assertRaises(ValueError): self.store.append(self.info['id'], 1, data)
        self.store.append(self.info['id'], 0, data)
        with self.assertRaises(ValueError): self.store.append(self.info['id'], 0, self.pcm(51))

    def test_reject_invalid_frames_and_download_paths(self):
        with self.assertRaises(ValueError): self.store.append(self.info['id'], 0, b'abc')
        with self.assertRaises(KeyError): self.store.download(self.info['id'], '../session.json')
        with self.assertRaises(ValueError): self.store.start(0, 'test')

    def test_stop_is_idempotent_and_new_data_rejected(self):
        self.store.append(self.info['id'], 0, self.pcm(50))
        one = self.store.stop(self.info['id'])
        self.assertEqual(one, self.store.stop(self.info['id']))
        with self.assertRaises(ValueError): self.store.append(self.info['id'], 1, self.pcm(20))


if __name__ == '__main__': unittest.main()
