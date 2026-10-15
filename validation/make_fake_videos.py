"""Gera vídeos .y4m para a câmera simulada do Chromium/Edge (--use-file-for-fake-video-capture).

Os vídeos usam as imagens públicas de amostra do OpenCV, com pequenos movimentos naturais
(deslocamento e escala suaves), e servem apenas para testar os FLUXOS do aplicativo sem
webcam. Não substituem a validação com pessoas reais e autorizadas.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2 as cv
import numpy as np

ROOT = Path(__file__).resolve().parent
IMAGES = ROOT / "images"
OUT = ROOT / "out" / "videos"
W, H, FPS = 640, 480, 15


def canvas_with(img: np.ndarray, t: float, size: int = 470, amp: float = 1.0) -> np.ndarray:
    """Imagem centralizada num quadro 640×480 com movimento suave (cabeça 'viva')."""
    frame = np.full((H, W, 3), 38, np.uint8)
    s = int(size * (1 + 0.025 * amp * math.sin(t * 1.3)))
    dx = int(10 * amp * math.sin(t * 0.9))
    dy = int(6 * amp * math.sin(t * 1.7 + 0.5))
    face = cv.resize(img, (s, int(s * img.shape[0] / img.shape[1])), interpolation=cv.INTER_AREA)
    fh, fw = face.shape[:2]
    x0 = (W - fw) // 2 + dx
    y0 = (H - fh) // 2 + dy
    xs, ys = max(0, x0), max(0, y0)
    xe, ye = min(W, x0 + fw), min(H, y0 + fh)
    frame[ys:ye, xs:xe] = face[ys - y0:ye - y0, xs - x0:xe - x0]
    return frame


def empty(t: float) -> np.ndarray:
    rng = np.random.default_rng(int(t * FPS))
    return np.clip(np.full((H, W, 3), 38, np.int16) + rng.integers(-6, 7, (H, W, 3)), 0, 255).astype(np.uint8)


def write_y4m(path: Path, frames) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n".encode())
        for bgr in frames:
            yuv = cv.cvtColor(bgr, cv.COLOR_BGR2YUV_I420)
            f.write(b"FRAME\n")
            f.write(yuv.tobytes())


def seconds(n: float):
    return [i / FPS for i in range(int(n * FPS))]


def main() -> None:
    lena = cv.imread(str(IMAGES / "lena.jpg"))
    messi = cv.imread(str(IMAGES / "messi_face.png"))
    two = cv.imread(str(IMAGES / "two_300_640.png"))
    if lena is None or messi is None or two is None:
        sys.exit("Rode antes: python validation/opencv_reference.py (gera as imagens de teste).")
    videos = {
        "lena.y4m": [canvas_with(lena, t) for t in seconds(8)],
        "messi.y4m": [canvas_with(messi, t, size=430) for t in seconds(8)],
        "two_faces.y4m": [cv.resize(two, (W, H)) for _ in seconds(2)],
        "empty.y4m": [empty(t) for t in seconds(2)],
        # Pessoa cadastrada por 6 s e depois sai da câmera por 5 s.
        "lena_then_empty.y4m": [canvas_with(lena, t) for t in seconds(6)] + [empty(t) for t in seconds(5)],
        # Pessoa cadastrada por 6 s e depois um desconhecido por 6 s.
        "lena_then_messi.y4m": [canvas_with(lena, t) for t in seconds(6)] + [canvas_with(messi, t, size=430) for t in seconds(6)],
    }
    for name, frames in videos.items():
        write_y4m(OUT / name, frames)
        print(f"✓ {name} ({len(frames)} quadros)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
