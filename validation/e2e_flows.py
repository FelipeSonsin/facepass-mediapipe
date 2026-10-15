"""Testes de ponta a ponta dos fluxos do FacePass com câmera SIMULADA do Chromium/Edge.

Pré-requisitos:
    python validation/opencv_reference.py   (gera imagens de teste)
    python validation/make_fake_videos.py   (gera os vídeos .y4m)
Uso:
    npm run test:e2e   (build + servidor e banco isolados)

Os vídeos usam imagens públicas de amostra do OpenCV. Este teste valida os FLUXOS
(interface, estados, sessões, persistência), não a taxa de acerto do reconhecimento.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent
VIDEOS = ROOT / "out" / "videos"
OUT = ROOT / "out" / "e2e"
# Perfil descartável exclusivo destes testes; nunca usa o perfil pessoal do navegador.
PROFILE = OUT / f"profile-{os.getpid()}-{time.time_ns()}"
BASE = os.environ.get("FACEPASS_URL", "http://localhost:5173")
DATABASE_FILE = Path(os.environ["FACEPASS_DB_FILE"]).resolve() if os.environ.get("FACEPASS_DB_FILE") else None
CHANNEL = os.environ.get("FACEPASS_BROWSER", "msedge") or None
DESKTOP = {"width": 1366, "height": 900}
MOBILE = {"width": 390, "height": 844}

results: list[dict] = []
external: list[str] = []
open_contexts: list = []
legacy_fixture: dict | None = None


def bank_people() -> list[dict]:
    if DATABASE_FILE is None:
        raise RuntimeError("Use npm run test:e2e para criar um banco isolado.")
    return json.loads(DATABASE_FILE.read_text(encoding="utf-8"))["people"]


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append({"verificacao": name, "ok": ok, "detalhe": detail})
    print(f"{'✓' if ok else '✗'} {name}{' — ' + detail if detail else ''}")


def launch(p, video: str | None, viewport=DESKTOP, camera_allowed=True, init_script: str | None = None):
    args = ["--use-fake-device-for-media-stream"]
    if video:
        args.append(f"--use-file-for-fake-video-capture={VIDEOS / video}")
    if camera_allowed:
        args.append("--use-fake-ui-for-media-stream")
    ctx = p.chromium.launch_persistent_context(
        str(PROFILE), headless=True, channel=CHANNEL, args=args, viewport=viewport,
        permissions=["camera"] if camera_allowed else [],
    )
    open_contexts.append(ctx)
    if init_script:
        ctx.add_init_script(init_script)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    ctx.on("request", lambda r: external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith(("data:", "blob:")) else None)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    return ctx, page, errors


def shot(page: Page, name: str) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"))


def granted(page: Page) -> bool:
    return page.get_by_text("Acesso liberado", exact=True).count() > 0


def activate(page: Page) -> None:
    # A recuperação usa a ação do aviso de erro; não há um segundo botão repetido.
    page.get_by_role("button", name=re.compile(r"^(Ativar câmera|Tentar de novo)$")).first.click()


def timeline(page: Page, seconds: float, step=0.1) -> list[tuple[float, bool]]:
    out, t0 = [], time.time()
    while time.time() - t0 < seconds:
        out.append((round(time.time() - t0, 2), granted(page)))
        time.sleep(step)
    return out


def segments(tl):
    """Resume a linha do tempo em trechos [(liberado?, início, fim)]."""
    segs = []
    for t, g in tl:
        if segs and segs[-1][0] == g:
            segs[-1][2] = t
        else:
            segs.append([g, t, t])
    return [(g, a, b) for g, a, b in segs]


def wait_granted(page: Page, name: str, timeout=20.0) -> float | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if granted(page) and page.get_by_text(f"Olá, {name}", exact=True).count() > 0:
            return time.time() - t0
        time.sleep(0.05)
    return None


def enroll(page: Page, name: str) -> float | None:
    page.get_by_label("Nome", exact=True).fill(name)
    box = page.get_by_role("checkbox")
    if not box.is_checked():
        box.check()
    page.wait_for_selector("text=Rosto posicionado.", timeout=30000)
    page.get_by_role("button", name="Registrar rosto").click()
    t0 = time.time()
    try:
        page.wait_for_selector("text=/de 5 amostras/", timeout=10000)
        page.wait_for_selector("text=/^[2-4] de 5 amostras$/", timeout=20000)
        shot(page, "cadastro_captura_em_andamento")
    except Exception:
        pass
    return t0


def scenario_enroll_and_recognize(p) -> None:
    global legacy_fixture
    ctx, page, errors = launch(p, "lena.y4m")
    page.goto(f"{BASE}/#/cadastro")
    page.wait_for_load_state("networkidle")
    shot(page, "cadastro_inicial_desktop")

    page.get_by_role("button", name="Registrar rosto").click()
    record("Cadastro com nome vazio é bloqueado", page.get_by_text("Informe o nome da pessoa.").count() > 0)
    page.get_by_label("Nome", exact=True).fill("L")
    page.get_by_role("button", name="Registrar rosto").click()
    record("Nome curto demais é bloqueado", page.get_by_text("Use pelo menos 2 letras.").count() > 0)
    page.get_by_label("Nome", exact=True).fill("Lena Teste")
    page.get_by_role("button", name="Registrar rosto").click()
    record("Cadastro sem autorização é bloqueado", page.get_by_text("Marque a autorização para continuar.").count() > 0)
    page.get_by_role("checkbox").check()
    page.get_by_role("button", name="Registrar rosto").click()
    record("Cadastro com câmera desligada é bloqueado", page.get_by_text("Ative a câmera para registrar o rosto.").count() > 0)

    activate(page)
    t0 = enroll(page, "Lena Teste")
    page.wait_for_selector("text=Cadastro concluído", timeout=60000)
    record("Cadastro concluído com 5 amostras", True, f"{time.time() - t0:.1f} s da ação até a confirmação")
    shot(page, "cadastro_concluido")
    people = page.get_by_role("region", name="Pessoas cadastradas")
    record("Pessoa aparece na lista com data", people.get_by_text("Lena Teste").count() == 1 and people.get_by_text("Cadastrado em").count() == 1)
    saved = bank_people()
    legacy_fixture = next(person for person in saved if person["name"] == "Lena Teste")
    valid_samples = len(legacy_fixture["samples"]) == 5 and all(
        len(sample) == 128 and all(isinstance(n, (int, float)) and math.isfinite(n) for n in sample)
        for sample in legacy_fixture["samples"]
    )
    record("Nome e 5 assinaturas faciais reais foram gravados no banco.json", valid_samples)

    browser = p.chromium.launch(headless=True, channel=CHANNEL)
    try:
        other = browser.new_page()
        other.goto(f"{BASE}/#/cadastro")
        other.wait_for_selector("text=Lena Teste", timeout=10000)
        record("Outro perfil de navegador lê o mesmo cadastro do banco local", True)
    finally:
        browser.close()

    page.get_by_role("link", name="Testar acesso agora").click()
    page.wait_for_url("**/#/interacao")
    dt = wait_granted(page, "Lena Teste", timeout=30)
    record("Cadastro abre a página de teste pelo botão e reconhece sem reativar a câmera", dt is not None)
    page.get_by_role("link", name="Cadastrar rosto", exact=True).click()

    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("text=Lena Teste", timeout=10000)
    record("Cadastro persiste após atualizar a página", True)

    page.goto(f"{BASE}/#/interacao")
    activate(page)
    dt = wait_granted(page, "Lena Teste", timeout=30)
    record("Pessoa cadastrada é reconhecida (Acesso liberado + Olá, nome)", dt is not None, f"{dt:.1f} s após ativar a câmera" if dt else "não reconhecida")
    shot(page, "interacao_reconhecida_desktop")

    # Desligar a câmera remove a liberação imediatamente.
    page.get_by_role("button", name="Desligar câmera").click()
    time.sleep(0.15)
    record("Desligar a câmera remove a liberação", not granted(page))
    record("Câmera desligada não mostra acesso negado", page.get_by_text("Acesso negado", exact=True).count() == 0)

    # Mudar de aba e voltar: nada é herdado; precisa de novas confirmações.
    activate(page)
    wait_granted(page, "Lena Teste", timeout=30)
    page.goto(f"{BASE}/#/cadastro")
    page.goto(f"{BASE}/#/interacao")
    immediately = granted(page)
    dt = wait_granted(page, "Lena Teste", timeout=20)
    record("Após trocar de aba, a liberação não é herdada", not immediately and dt is not None, f"liberou de novo em {dt:.2f} s" if dt else "")

    # Interrupção do vídeo (trilha encerrada).
    page.evaluate("document.querySelector('video').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended'))")
    time.sleep(0.2)
    record("Interrupção do vídeo remove a liberação e explica", not granted(page) and page.get_by_text("O vídeo da câmera foi interrompido.").count() > 0)
    shot(page, "interacao_video_interrompido")

    # Edição de nome refletida na Interação.
    page.goto(f"{BASE}/#/cadastro")
    page.get_by_role("button", name="Editar nome de Lena Teste").click()
    page.get_by_label("Novo nome").fill("")
    page.get_by_role("button", name="Salvar nome").click()
    record("Edição com nome vazio é bloqueada", page.get_by_text("Informe o nome da pessoa.").count() > 0)
    page.get_by_label("Novo nome").fill("Lena Renomeada")
    page.get_by_role("button", name="Salvar nome").click()
    page.wait_for_selector("text=Lena Renomeada", timeout=5000)
    record("Editar o nome atualiza o banco.json", any(person["name"] == "Lena Renomeada" for person in bank_people()))
    page.goto(f"{BASE}/#/interacao")
    activate(page)
    dt = wait_granted(page, "Lena Renomeada", timeout=30)
    record("Nome editado aparece na Interação", dt is not None)

    # Recadastro do mesmo rosto: pede confirmação, não sobrescreve em silêncio.
    page.goto(f"{BASE}/#/cadastro")
    enroll(page, "Outra Lena")
    page.wait_for_selector("text=Este rosto já está cadastrado", timeout=60000)
    shot(page, "cadastro_rosto_duplicado")
    page.get_by_role("button", name="Atualizar cadastro").click()
    page.wait_for_selector("text=Cadastro atualizado", timeout=10000)
    count = page.get_by_role("region", name="Pessoas cadastradas").get_by_role("listitem").count()
    record("Recadastro do mesmo rosto pede confirmação e atualiza sem duplicar", count == 1, f"{count} cadastro(s) na lista")
    record("Recadastro preserva o identificador no arquivo", len(bank_people()) == 1 and bank_people()[0]["id"] == legacy_fixture["id"])

    # Celular.
    page.set_viewport_size(MOBILE)
    page.goto(f"{BASE}/#/cadastro")
    time.sleep(1.5)
    shot(page, "cadastro_celular")
    page.goto(f"{BASE}/#/interacao")
    dt = wait_granted(page, "Lena Renomeada", timeout=30)
    shot(page, "interacao_celular")
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    record("Celular: reconhece e não há rolagem horizontal", dt is not None and not overflow)
    record("Sem erros de página (cenário principal)", not errors, "; ".join(errors)[:300])
    ctx.close()


def scenario_unknown(p) -> None:
    ctx, page, errors = launch(p, "messi.y4m")
    page.goto(f"{BASE}/#/interacao")
    activate(page)
    page.wait_for_selector("video", timeout=10000)
    time.sleep(3)
    tl = timeline(page, 8)
    region = page.get_by_role("region", name="Resultado da identificação").inner_text().strip()
    record("Desconhecido: mostra Acesso negado sem liberar acesso", not any(g for _, g in tl) and "Acesso negado" in region,
           f"texto da área: {region!r}")
    record("Desconhecido: não exibe nome de pessoa cadastrada", "Olá," not in region and "Lena" not in region)
    shot(page, "interacao_desconhecido")
    page.set_viewport_size(MOBILE)
    shot(page, "interacao_negada_celular")
    record("Acesso negado no celular sem rolagem horizontal", page.get_by_text("Acesso negado", exact=True).count() == 1 and not page.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
    page.get_by_role("button", name="Desligar câmera").click()
    record("Desligar a câmera remove o acesso negado", page.get_by_text("Acesso negado", exact=True).count() == 0)
    ctx.close()


def scenario_two_faces(p) -> None:
    ctx, page, errors = launch(p, "two_faces.y4m")
    page.goto(f"{BASE}/#/cadastro")
    activate(page)
    page.get_by_label("Nome", exact=True).fill("Duas Pessoas")
    page.get_by_role("checkbox").check()
    page.wait_for_selector("text=Fique apenas uma pessoa diante da câmera.", timeout=30000)
    page.get_by_role("button", name="Registrar rosto").click()
    record("Cadastro com duas pessoas é bloqueado", page.get_by_text("Há mais de uma pessoa na câmera. Fique apenas você diante dela.").count() > 0)
    shot(page, "cadastro_duas_pessoas")
    page.goto(f"{BASE}/#/interacao")
    page.wait_for_selector("text=Fique apenas uma pessoa diante da câmera.", timeout=30000)
    tl = timeline(page, 4)
    record("Interação com duas pessoas: orientação discreta, sem liberação", not any(g for _, g in tl))
    record("Duas pessoas não são confundidas com um rosto desconhecido", page.get_by_text("Acesso negado", exact=True).count() == 0)
    shot(page, "interacao_duas_pessoas")
    ctx.close()


def scenario_no_face(p) -> None:
    ctx, page, errors = launch(p, "empty.y4m")
    page.goto(f"{BASE}/#/cadastro")
    activate(page)
    page.get_by_label("Nome", exact=True).fill("Sem Rosto")
    page.get_by_role("checkbox").check()
    page.wait_for_selector("text=Posicione o rosto dentro da moldura.", timeout=30000)
    page.get_by_role("button", name="Registrar rosto").click()
    record("Cadastro sem rosto é bloqueado", page.get_by_text("Nenhum rosto detectado. Posicione o rosto dentro da moldura.").count() > 0)
    page.goto(f"{BASE}/#/interacao")
    time.sleep(2)
    tl = timeline(page, 4)
    record("Interação sem rosto: nenhuma liberação", not any(g for _, g in tl))
    record("Sem rosto não exibe acesso negado", page.get_by_text("Acesso negado", exact=True).count() == 0)
    ctx.close()


def scenario_leave_and_switch(p) -> None:
    for video, label in (("lena_then_empty.y4m", "pessoa sai da câmera"), ("lena_then_messi.y4m", "desconhecido entra após reconhecida")):
        ctx, page, errors = launch(p, video)
        page.goto(f"{BASE}/#/interacao")
        activate(page)
        page.wait_for_selector("video", timeout=10000)
        tl = timeline(page, 26)
        segs = segments(tl)
        on = [s for s in segs if s[0]]
        off_after_on = [b - a for (g, a, b) in segs[1:] if not g]
        # Cada vídeo tem ~6 s de pessoa cadastrada seguidos de 5–6 s sem ela (em laço).
        ok = len(on) >= 2 and all(b - a < 7.0 for _, a, b in on) and any(d >= 4.0 for d in off_after_on)
        record(f"Liberação some quando {label}", ok,
               "trechos: " + ", ".join(f"{'liberado' if g else 'vazio'} {a:.1f}–{b:.1f}s" for g, a, b in segs))
        ctx.close()


def scenario_delete(p) -> None:
    ctx, page, errors = launch(p, "lena.y4m")
    page.goto(f"{BASE}/#/cadastro")
    page.wait_for_selector("text=Lena Renomeada", timeout=10000)
    page.get_by_role("button", name="Excluir cadastro de Lena Renomeada").click()
    shot(page, "cadastro_excluir_confirmacao")
    page.get_by_role("dialog").get_by_role("button", name="Excluir cadastro").click()
    page.wait_for_selector("text=Nenhuma pessoa cadastrada ainda.", timeout=5000)
    page.reload()
    page.wait_for_selector("text=Nenhuma pessoa cadastrada ainda.", timeout=10000)
    record("Exclusão com confirmação remove o cadastro persistido", True)
    record("Exclusão também remove as assinaturas do banco.json", bank_people() == [])
    page.goto(f"{BASE}/#/interacao")
    page.wait_for_selector("text=Nenhum rosto cadastrado", timeout=5000)
    activate(page)
    time.sleep(4)
    record("Sem cadastros: estado inicial com botão para Cadastrar rosto, sem liberação",
           not granted(page) and page.get_by_role("link", name="Cadastrar rosto").count() >= 1)
    shot(page, "interacao_sem_cadastros")
    ctx.close()


def scenario_errors(p) -> None:
    ctx, page, _ = launch(p, None, camera_allowed=False)
    page.goto(f"{BASE}/#/cadastro")
    activate(page)
    try:
        page.wait_for_selector("text=O acesso à câmera foi bloqueado.", timeout=10000)
        record("Permissão negada é explicada", True)
    except Exception:
        record("Permissão negada é explicada", False, page.inner_text("main")[:200])
    shot(page, "erro_permissao_negada")
    ctx.close()

    ctx, page, _ = launch(p, "lena.y4m")
    page.route("**/api/people", lambda route: route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "Banco local indisponível para o teste."})))
    page.goto(f"{BASE}/#/cadastro")
    try:
        page.wait_for_selector("text=/Os cadastros não puderam ser lidos/", timeout=10000)
        record("Falha no armazenamento é explicada", True)
    except Exception:
        record("Falha no armazenamento é explicada", False, page.inner_text("main")[:200])
    shot(page, "erro_armazenamento")
    ctx.close()

    ctx, page, _ = launch(p, "lena.y4m")
    page.route("**/api/people/*", lambda route: route.fulfill(status=507, content_type="application/json", body=json.dumps({"error": "Não há espaço em disco para salvar o cadastro."})))
    page.goto(f"{BASE}/#/cadastro")
    activate(page)
    enroll(page, "Falha Gravacao")
    page.get_by_text("Não há espaço em disco para salvar o cadastro.", exact=True).wait_for(timeout=30000)
    record("Falha na gravação não confirma cadastro nem altera banco.json", page.get_by_text("Cadastro concluído", exact=True).count() == 0 and bank_people() == [])
    page.unroute("**/api/people/*")
    enroll(page, "Falha Gravacao")
    page.get_by_text("Cadastro concluído", exact=True).wait_for(timeout=30000)
    record("É possível tentar novamente após falha na gravação", len(bank_people()) == 1)
    page.request.delete(f"{BASE}/api/people/{bank_people()[0]['id']}")
    ctx.close()


def scenario_migration(p) -> None:
    if legacy_fixture is None:
        raise RuntimeError("O cadastro real do cenário principal não foi concluído.")
    fixture = {**legacy_fixture, "name": "Pessoa Migrada"}
    ctx, page, _ = launch(p, "lena.y4m")
    page.goto(f"{BASE}/#/cadastro")
    page.wait_for_load_state("networkidle")
    page.evaluate("""person => new Promise((resolve, reject) => {
      const request = indexedDB.open('facepass', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('people', {keyPath: 'id'});
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('people', 'readwrite');
        tx.objectStore('people').put({...person, samples: person.samples.map(s => new Float32Array(s).buffer)});
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    })""", fixture)
    page.route("**/api/people/import", lambda route: route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": "Falha de importação simulada."})))
    page.reload()
    page.get_by_text("Os cadastros não puderam ser lidos:", exact=False).wait_for(timeout=10000)
    record("Falha na migração não apaga dados antigos nem grava parcialmente", bank_people() == [])
    page.unroute("**/api/people/import")
    page.reload()
    page.get_by_text("Pessoa Migrada", exact=True).wait_for(timeout=10000)
    record("Cadastro antigo do IndexedDB é migrado para banco.json", len(bank_people()) == 1 and bank_people()[0]["id"] == fixture["id"])
    original_count = page.evaluate("""() => new Promise(resolve => {
      const request = indexedDB.open('facepass', 2);
      request.onsuccess = () => {
        const db = request.result;
        const count = db.transaction('people').objectStore('people').count();
        count.onsuccess = () => { db.close(); resolve(count.result); };
      };
    })""")
    record("Migração preserva os registros originais no navegador", original_count == 1)
    page.get_by_role("link", name="Testar acesso", exact=True).click()
    activate(page)
    record("O rosto migrado continua sendo reconhecido", wait_granted(page, "Pessoa Migrada", timeout=30) is not None)
    page.goto(f"{BASE}/#/cadastro")
    page.get_by_role("button", name="Excluir cadastro de Pessoa Migrada").click()
    page.get_by_role("dialog").get_by_role("button", name="Excluir cadastro").click()
    page.get_by_text("Nenhuma pessoa cadastrada ainda.", exact=True).wait_for(timeout=10000)
    page.reload()
    page.get_by_text("Nenhuma pessoa cadastrada ainda.", exact=True).wait_for(timeout=10000)
    record("Cadastro migrado e excluído não reaparece ao atualizar", bank_people() == [])
    ctx.close()


def scenario_without_indexeddb(p) -> None:
    script = "Object.defineProperty(window, 'indexedDB', {value: undefined})"
    ctx, page, _ = launch(p, "lena.y4m", init_script=script)
    page.goto(f"{BASE}/#/cadastro")
    page.get_by_text("Nenhuma pessoa cadastrada ainda.", exact=True).wait_for(timeout=10000)
    record("O banco local funciona mesmo sem IndexedDB", page.get_by_text("Os cadastros não puderam ser lidos:", exact=False).count() == 0)
    response = page.request.get(f"{BASE}/banco.json")
    uppercase = page.request.get(f"{BASE}/BANCO.JSON")
    record("banco.json não é servido como arquivo público", response.status == 403 and uppercase.status == 403)
    ctx.close()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if DATABASE_FILE is None or not DATABASE_FILE.is_relative_to(ROOT / "out"):
        sys.exit("Use npm run test:e2e. Os testes exigem um banco separado em validation/out/.")
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        for fn in (scenario_enroll_and_recognize, scenario_unknown, scenario_two_faces, scenario_no_face, scenario_leave_and_switch, scenario_delete, scenario_migration, scenario_errors, scenario_without_indexeddb):
            try:
                fn(p)
            except Exception as e:  # registra e segue para os demais cenários
                record(f"{fn.__name__} executou sem exceção", False, str(e)[:300])
                for context in open_contexts:
                    for page in context.pages:
                        if not page.is_closed():
                            shot(page, f"falha_{fn.__name__}")
                            print(page.locator('main').inner_text()[:1500])
            finally:
                for c in open_contexts:
                    try:
                        c.close()
                    except Exception:
                        pass
                open_contexts.clear()
    record("Nenhuma requisição a serviços externos (cadastros são enviados apenas à API local)", not external, ", ".join(sorted(set(external)))[:300])
    (OUT / "resultados.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    failed = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(failed)}/{len(results)} verificações aprovadas. Capturas em {OUT}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
