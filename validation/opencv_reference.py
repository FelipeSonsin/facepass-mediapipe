"""Validação técnica do pipeline do FacePass contra a implementação oficial do OpenCV.

Requer: pip install opencv-python numpy playwright && python -m playwright install chromium
Uso (com o servidor de desenvolvimento rodando em http://localhost:5173):
    python validation/opencv_reference.py

O que é verificado:
  1. Equivalência da porta JS: com os MESMOS 5 pontos (do YuNet), o recorte e o embedding
     produzidos no navegador (warp em JS + ONNX Runtime Web) devem coincidir com
     FaceRecognizerSF.alignCrop + feature do OpenCV.
  2. Correspondência dos pontos: os 5 pontos derivados do MediaPipe são comparados aos do
     YuNet (o detector que o OpenCV usa com o SFace), para cada estratégia de centro do olho.
  3. Pipeline completo: embedding MediaPipe+SFace no navegador vs YuNet+SFace no OpenCV.
  4. Coerência: variações geométricas/fotométricas da mesma imagem vs outra identidade.

As imagens são as amostras públicas do OpenCV (samples/data). Elas servem para validar o
processamento, NÃO para medir taxa de acerto do reconhecimento.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

import cv2 as cv
import numpy as np

ROOT = Path(__file__).resolve().parent
IMAGES = ROOT / "images"
OUT = ROOT / "out"
PROJECT = ROOT.parent
SFACE = PROJECT / "public" / "models" / "face_recognition_sface_2021dec.onnx"
YUNET = OUT / "face_detection_yunet_2023mar.onnx"
YUNET_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
BASE_URL = "http://localhost:5173"
# Navegador do sistema (o Edge vem no Windows). Troque para "chrome" ou None se preferir.
BROWSER_CHANNEL = os.environ.get("FACEPASS_BROWSER", "msedge") or None
SOURCES = {
    "lena.jpg": "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg",
    "messi5.jpg": "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/messi5.jpg",
}


def ensure_inputs() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        if not (IMAGES / name).exists():
            urllib.request.urlretrieve(url, IMAGES / name)
    if not YUNET.exists():
        urllib.request.urlretrieve(YUNET_URL, YUNET)
    if not SFACE.exists():
        sys.exit("Modelo SFace ausente: rode `npm run models` antes.")


def make_variants() -> list[str]:
    """Variações da mesma foto (escala, rotação, deslocamento, brilho) e um quadro com 2 rostos."""
    names = []
    # O Face Landmarker usa um detector de curto alcance (rostos a até ~2 m da câmera).
    # Na messi5.jpg o rosto ocupa ~8% da largura; recortamos ao redor dele, como numa webcam.
    messi = cv.imread(str(IMAGES / "messi5.jpg"))
    det = cv.FaceDetectorYN.create(str(YUNET), "", (messi.shape[1], messi.shape[0]), 0.8, 0.3, 5000)
    _, faces = det.detect(messi)
    x, y, w, h = faces[0][:4]
    cx, cy, side = x + w / 2, y + h / 2, max(w, h) * 2.6
    x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
    crop = messi[y0:int(min(messi.shape[0], cy + side / 2)), x0:int(min(messi.shape[1], cx + side / 2))]
    cv.imwrite(str(IMAGES / "messi_face.png"), cv.resize(crop, (400, int(400 * crop.shape[0] / crop.shape[1])), interpolation=cv.INTER_CUBIC))
    for base in ("lena.jpg", "messi_face.png"):
        img = cv.imread(str(IMAGES / base))
        h, w = img.shape[:2]
        stem = Path(base).stem
        variants = {
            "rot8": cv.warpAffine(img, cv.getRotationMatrix2D((w / 2, h / 2), 8, 1.0), (w, h), borderMode=cv.BORDER_REFLECT),
            "scale80": cv.resize(img, None, fx=0.8, fy=0.8, interpolation=cv.INTER_AREA),
            "shift": cv.warpAffine(img, np.float32([[1, 0, 18], [0, 1, -12]]), (w, h), borderMode=cv.BORDER_REFLECT),
            "dark": cv.convertScaleAbs(img, alpha=0.75, beta=0),
        }
        names.append(base)
        for key, v in variants.items():
            name = f"{stem}_{key}.png"
            cv.imwrite(str(IMAGES / name), v)
            names.append(name)
    # Quadro 16:9 (como uma webcam) com duas pessoas lado a lado.
    a = cv.resize(cv.imread(str(IMAGES / "lena.jpg")), (360, 360))
    b = cv.imread(str(IMAGES / "messi_face.png"))
    b = cv.resize(b, (360, int(360 * b.shape[0] / b.shape[1])))[:360]
    frame = np.full((540, 960, 3), 40, np.uint8)
    frame[90:450, 100:460] = a
    frame[90:90 + b.shape[0], 500:860] = b
    cv.imwrite(str(IMAGES / "two_faces.png"), frame)
    names.append("two_faces.png")
    # Quadros de 2 pessoas em tamanhos/proporções diferentes, para o teste de multiplicidade.
    for size in (220, 300, 400):
        fa = cv.resize(cv.imread(str(IMAGES / "lena.jpg")), (size, size))
        fb = cv.imread(str(IMAGES / "messi_face.png"))
        fb = cv.resize(fb, (size, int(size * fb.shape[0] / fb.shape[1])))[:size]
        for W, H in ((960, 540), (640, 480)):
            if 2 * size + 40 > W:
                continue
            fr = np.full((H, W, 3), 40, np.uint8)
            y = (H - size) // 2
            fr[y:y + size, W // 2 - size - 10:W // 2 - 10] = fa
            fr[y:y + fb.shape[0], W // 2 + 10:W // 2 + 10 + size] = fb
            name = f"two_{size}_{W}.png"
            cv.imwrite(str(IMAGES / name), fr)
            names.append(name)
    return names


def opencv_reference(names: list[str]):
    det = cv.FaceDetectorYN.create(str(YUNET), "", (320, 320), 0.8, 0.3, 5000)
    rec = cv.FaceRecognizerSF.create(str(SFACE), "")
    ref = {}
    for name in names:
        img = cv.imread(str(IMAGES / name))
        det.setInputSize((img.shape[1], img.shape[0]))
        _, faces = det.detect(img)
        n = 0 if faces is None else len(faces)
        entry = {"faces": n}
        if n >= 1:
            face = faces[0]
            crop = rec.alignCrop(img, face)
            feat = rec.feature(crop).flatten()
            entry["points"] = face[4:14].reshape(5, 2).tolist()
            entry["embedding"] = (feat / np.linalg.norm(feat)).tolist()
            entry["crop_rgb"] = cv.cvtColor(crop, cv.COLOR_BGR2RGB)
        ref[name] = entry
    return ref, rec


def run_browser(names: list[str]) -> dict:
    from playwright.sync_api import sync_playwright

    url = f"{BASE_URL}/validacao.html?imgs={','.join(names)}&ext=yunet.json"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=BROWSER_CHANNEL)
        page = browser.new_page()
        console = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
        page.goto(url)
        page.wait_for_function("window.__VALIDATION__ !== undefined", timeout=180_000)
        data = page.evaluate("window.__VALIDATION__")
        page.screenshot(path=str(OUT / "validacao_pagina.png"), full_page=True)
        browser.close()
    if not data["ok"]:
        print("\n".join(console))
        sys.exit(f"Falha no navegador: {data.get('error')}")
    return data


def decode_crop(data_url: str) -> np.ndarray:
    raw = base64.b64decode(data_url.split(",", 1)[1])
    bgr = cv.imdecode(np.frombuffer(raw, np.uint8), cv.IMREAD_COLOR)
    return cv.cvtColor(bgr, cv.COLOR_BGR2RGB)


def cos(a, b) -> float:
    return float(np.dot(np.asarray(a), np.asarray(b)))


# Candidatos semanticamente equivalentes aos 5 pontos do YuNet, em índices do Face Mesh.
EYE_CANDIDATES = {
    "cantos": ((33, 133), (362, 263)),
    "iris": ((468,), (473,)),
    "palpebras": ((159, 145), (386, 374)),
    "cantos+iris": ((33, 133, 468, 468), (362, 263, 473, 473)),
}
NOSE_CANDIDATES = (1, 4, 5, 19, 94)
MOUTH_CANDIDATES = ((61, 291), (78, 308), (62, 292), (76, 306))


def mp_points(lm: np.ndarray, eye, nose: int, mouth) -> np.ndarray:
    return np.array([
        lm[list(eye[0])].mean(axis=0),
        lm[list(eye[1])].mean(axis=0),
        lm[nose],
        lm[mouth[0]],
        lm[mouth[1]],
    ], dtype=np.float32)


def mapping_search(names, reports, ref):
    """Avalia, com o SFace oficial do OpenCV, qual mapeamento MediaPipe→5 pontos gera o
    embedding mais próximo do pipeline oficial (YuNet + alignCrop). Possível porque a porta
    JS foi verificada como equivalente ao OpenCV (cosseno ≥ 0,9996 com os mesmos pontos)."""
    rec = cv.FaceRecognizerSF.create(str(SFACE), "")
    usable = [n for n in names if reports[n].get("landmarks") and "embedding" in ref[n]]
    imgs = {n: cv.imread(str(IMAGES / n)) for n in usable}
    results = []
    for eye_name, eye in EYE_CANDIDATES.items():
        for nose in NOSE_CANDIDATES:
            for mouth in MOUTH_CANDIDATES:
                cs, errs = [], []
                for n in usable:
                    lm = np.asarray(reports[n]["landmarks"], dtype=np.float32)
                    pts = mp_points(lm, eye, nose, mouth)
                    yp = np.asarray(ref[n]["points"], dtype=np.float32)
                    errs.append(float((np.linalg.norm(pts - yp, axis=1) / np.linalg.norm(yp[0] - yp[1])).mean()))
                    face = np.zeros((1, 15), np.float32)
                    face[0, 4:14] = pts.flatten()
                    f = rec.feature(rec.alignCrop(imgs[n], face)).flatten()
                    cs.append(cos(f / np.linalg.norm(f), ref[n]["embedding"]))
                results.append({"eyes": eye_name, "nose": nose, "mouth": list(mouth),
                                "mean_cos": float(np.mean(cs)), "min_cos": float(np.min(cs)), "mean_point_err": float(np.mean(errs))})
    results.sort(key=lambda r: -r["mean_cos"])
    print(f"\nBusca de mapeamento ({len(usable)} imagens) — 5 melhores:")
    for r in results[:5]:
        print(f"  olhos={r['eyes']:12} nariz={r['nose']:3} boca={r['mouth']}  cos médio {r['mean_cos']:.4f}  mín {r['min_cos']:.4f}  erro pts {r['mean_point_err']:.3f}")
    return results


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ensure_inputs()
    names = make_variants()
    ref, _ = opencv_reference(names)
    (OUT / "yunet.json").write_text(json.dumps({k: v["points"] for k, v in ref.items() if v.get("faces") == 1}))

    data = run_browser(names)
    reports = {r["image"]: r for r in data["reports"]}
    summary = {"delegate": data["delegate"], "sface_input_shape": data["inputShape"], "per_image": {}, "strategies": {}}
    strat_err: dict[str, list[float]] = {"corners": [], "iris": [], "blend": []}
    strat_cos: dict[str, list[float]] = {"corners": [], "iris": [], "blend": []}

    print(f"MediaPipe delegate: {data['delegate']}; entrada SFace: {data['inputShape']}")
    print(f"{'imagem':22} {'rostos MP/YuNet':>15} {'cos(JS,OpenCV) mesmos pts':>27} {'Δpix máx/médio':>15}")
    for name in names:
        r, o = reports[name], ref[name]
        row = {"faces_mediapipe": r["faces"], "faces_yunet": o["faces"]}
        if "external" in r["embeddings"] and "embedding" in o:
            row["same_points_cosine"] = cos(r["embeddings"]["external"], o["embedding"])
            diff = np.abs(decode_crop(r["crops"]["external"]).astype(int) - o["crop_rgb"].astype(int))
            row["crop_abs_diff_max"] = int(diff.max())
            row["crop_abs_diff_mean"] = float(diff.mean())
            row["norm_raw_js"] = r["rawNorms"]["external"]
            cv.imwrite(str(OUT / f"crop_opencv_{Path(name).stem}.png"), cv.cvtColor(o["crop_rgb"], cv.COLOR_RGB2BGR))
            cv.imwrite(str(OUT / f"crop_js_{Path(name).stem}.png"), cv.cvtColor(decode_crop(r["crops"]["external"]), cv.COLOR_RGB2BGR))
        if r.get("landmarks") and "points" in o:
            yp = np.asarray(o["points"])
            iod = np.linalg.norm(yp[0] - yp[1])
            for s in strat_err:
                mp = np.asarray(r["keypoints"][s])
                err = np.linalg.norm(mp - yp, axis=1) / iod
                strat_err[s].append(float(err.mean()))
                c = cos(r["embeddings"][f"mp_{s}"], o["embedding"])
                strat_cos[s].append(c)
                row[f"{s}_point_err_per_iod"] = err.round(3).tolist()
                row[f"{s}_cos_vs_opencv_pipeline"] = c
            crop = decode_crop(r["crops"]["mp_corners"])
            cv.imwrite(str(OUT / f"crop_mp_{Path(name).stem}.png"), cv.cvtColor(crop, cv.COLOR_RGB2BGR))
        summary["per_image"][name] = row
        same = f"{row['same_points_cosine']:.6f}" if "same_points_cosine" in row else "—"
        dpx = f"{row['crop_abs_diff_max']}/{row['crop_abs_diff_mean']:.3f}" if "crop_abs_diff_max" in row else "—"
        print(f"{name:22} {r['faces']:>7}/{o['faces']:<7} {same:>27} {dpx:>15}")

    print("\nPontos MediaPipe vs YuNet (erro médio / distância entre olhos) e cos(pipeline JS, pipeline OpenCV):")
    for s in strat_err:
        summary["strategies"][s] = {"mean_point_err": float(np.mean(strat_err[s])), "mean_cos": float(np.mean(strat_cos[s])), "min_cos": float(np.min(strat_cos[s]))}
        print(f"  {s:8} erro médio {np.mean(strat_err[s]):.4f}  cos médio {np.mean(strat_cos[s]):.4f}  cos mín {np.min(strat_cos[s]):.4f}")

    summary["mapping_search"] = mapping_search(names, reports, ref)

    # Matriz de similaridade do pipeline completo (MediaPipe + SFace no navegador).
    multi = {n: {"final": reports[n]["faces"], "landmarker": reports[n]["landmarkerFaces"], "guarda": reports[n]["guardFaces"], "yunet": ref[n]["faces"]} for n in names if n.startswith("two")}
    summary["multi_face"] = multi
    print("\nQuadros com 2 pessoas (rostos detectados: final = máx. dos detectores):")
    for n, m in multi.items():
        print(f"  {n:18} final {m['final']}  landmarker {m['landmarker']}  guarda {m['guarda']}  YuNet {m['yunet']}")

    usable = [n for n in names if "mp_corners" in reports[n]["embeddings"] and not n.startswith("two")]
    emb = np.array([reports[n]["embeddings"]["mp_corners"] for n in usable])
    sim = emb @ emb.T
    ident = [n.split("_")[0].split(".")[0].replace("messi5", "messi") for n in usable]
    same_id = [sim[i, j] for i in range(len(usable)) for j in range(i + 1, len(usable)) if ident[i] == ident[j]]
    diff_id = [sim[i, j] for i in range(len(usable)) for j in range(i + 1, len(usable)) if ident[i] != ident[j]]
    summary["matrix"] = {"images": usable, "cosine": sim.round(4).tolist()}
    if not diff_id:
        diff_id = [float("nan")]
    summary["same_image_variants"] = {"min": float(np.min(same_id)), "mean": float(np.mean(same_id))}
    summary["different_identity"] = {"max": float(np.max(diff_id)), "mean": float(np.mean(diff_id))}
    print(f"\nVariações da mesma foto: cos mín {np.min(same_id):.4f}, médio {np.mean(same_id):.4f}")
    print(f"Identidades diferentes:  cos máx {np.max(diff_id):.4f}, médio {np.mean(diff_id):.4f}")
    (OUT / "report.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nRelatório: {OUT / 'report.json'}")


if __name__ == "__main__":
    main()
