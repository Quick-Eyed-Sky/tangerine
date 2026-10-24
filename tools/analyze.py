import sys, wave, numpy as np
w = wave.open(sys.argv[1]); n = w.getnframes(); sr = w.getframerate()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768
m = x.mean(1)
peak = np.abs(x).max(); rms = np.sqrt((x**2).mean())
print(f"{n/sr:.1f}s peak {20*np.log10(peak+1e-12):.1f} dBFS  rms {20*np.log10(rms+1e-12):.1f} dBFS")
sec = [20*np.log10(np.sqrt((m[i*sr:(i+1)*sr]**2).mean())+1e-9) for i in range(int(n/sr))]
print("rms/5s:", " ".join(f"{np.mean(sec[i:i+5]):.0f}" for i in range(0, len(sec), 5)))
spec = np.abs(np.fft.rfft(m[: (len(m)//sr)*sr ] * 1.0)) ** 2
f = np.fft.rfftfreq((len(m)//sr)*sr, 1/sr); tot = spec.sum()
for lo, hi in [(20,120),(120,500),(500,2000),(2000,4000),(4000,8000),(8000,16000)]:
    print(f"  {lo:>5}-{hi:<5} Hz {10*np.log10(spec[(f>=lo)&(f<hi)].sum()/tot):6.1f} dB")
c = np.corrcoef(x[:,0], x[:,1])[0,1]; print(f"L/R correlation {c:.2f}")
