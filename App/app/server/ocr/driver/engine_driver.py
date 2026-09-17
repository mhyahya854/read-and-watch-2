#!/usr/bin/env python3
"""Read & Watch OCR engine driver (Phase 17).

This file is owned by Read & Watch. It is the ONLY place in the project that
touches upstream OCR Python APIs. It deliberately contains no product logic: no
routing, no storage, no provenance, no user interface. Those belong to the
application, which speaks to this process over newline-delimited JSON on
stdin/stdout.

Privacy contract
----------------
* No network call is ever made from this process. Downloading engine/model files
  is the job of the provisioning step in Read & Watch, never a recognition call.
* Recognised text is returned to the parent process only. Nothing is uploaded,
  no telemetry is emitted, and no filename from model output is ever used as a
  path.
* Temporary artefacts are written only inside the directory supplied by the
  parent (`--temp-dir`), or a fresh `mkdtemp` when it is omitted.

Protocol
--------
Ready banner:      {"type": "ready", "protocol": 1, "provider": ...}
Request:           {"id": N, "op": "...", "token": "...", "payload": {...}}
Success response:  {"id": N, "ok": true,  "result": {...}}
Failure response:  {"id": N, "ok": false, "error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

import argparse
import base64
import binascii
import io
import json
import os
import platform
import sys
import tempfile
import threading
import traceback

PROTOCOL_VERSION = 1

ENGINE_NOT_INSTALLED = "ENGINE_NOT_INSTALLED"
MODEL_NOT_INSTALLED = "MODEL_NOT_INSTALLED"
UNSUPPORTED_HARDWARE = "UNSUPPORTED_HARDWARE"
RUNTIME_UNAVAILABLE = "RUNTIME_UNAVAILABLE"
OCR_FAILED = "OCR_FAILED"
CANCELLED = "CANCELLED"
INVALID_INPUT = "INVALID_INPUT"

_CANCEL_LOCK = threading.Lock()
_CANCELLED_IDS = set()


class DriverError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _packages():
    found = {}
    for name in ("paddleocr", "paddle", "torch", "transformers", "PIL", "numpy"):
        try:
            module = __import__(name)
            found[name] = str(getattr(module, "__version__", "unknown"))
        except Exception:
            continue
    return found


def _accelerator():
    info = {"cuda": False, "cuda_devices": 0, "device_name": None}
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            info["cuda"] = True
            info["cuda_devices"] = int(torch.cuda.device_count())
            info["device_name"] = str(torch.cuda.get_device_name(0))
    except Exception:
        pass
    return info


def _runtime_report(provider):
    return {
        "provider": provider,
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "machine": platform.machine(),
        "packages": _packages(),
        "accelerator": _accelerator(),
        "tempDirActive": bool(TEMP_DIR),
    }


def _decode_image(payload):
    """Returns a numpy array for the page image. Never trusts a caller path."""
    import numpy as np  # type: ignore
    from PIL import Image  # type: ignore

    raw_b64 = payload.get("imageBase64")
    path = payload.get("imagePath")
    if isinstance(raw_b64, str) and raw_b64:
        try:
            data = base64.b64decode(raw_b64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise DriverError(INVALID_INPUT, "imageBase64 is not valid base64: %s" % error) from error
        with Image.open(io.BytesIO(data)) as image:
            return np.array(image.convert("RGB"))
    if isinstance(path, str) and path:
        if not os.path.isabs(path):
            raise DriverError(INVALID_INPUT, "imagePath must be absolute")
        real = os.path.realpath(path)
        if not os.path.isfile(real):
            raise DriverError(INVALID_INPUT, "imagePath does not point at a regular file")
        with Image.open(real) as image:
            return np.array(image.convert("RGB"))
    raise DriverError(INVALID_INPUT, "A page image must be supplied as imageBase64 or imagePath")


def _polygon_to_box(polygon):
    if polygon is None:
        return None
    try:
        points = [[float(value) for value in point] for point in polygon]
    except Exception:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


# --------------------------------------------------------------------------- #
# PaddleOCR PP-OCRv5 (Arabic script: Arabic + Urdu)
# --------------------------------------------------------------------------- #

_PADDLE_CACHE = {}


def _paddle_pipeline(language):
    if language in _PADDLE_CACHE:
        return _PADDLE_CACHE[language]
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except Exception as error:  # pragma: no cover - depends on host runtime
        raise DriverError(ENGINE_NOT_INSTALLED, "paddleocr is not importable: %s" % error) from error

    models = (PAYLOAD_MODELS or {}).get(language) or {}
    kwargs = {
        "lang": models.get("apiLang", language),
        "ocr_version": models.get("ocrVersion", "PP-OCRv5"),
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": True,
    }
    if models.get("detectionModelDir"):
        kwargs["text_detection_model_dir"] = models["detectionModelDir"]
    if models.get("recognitionModelDir"):
        kwargs["text_recognition_model_dir"] = models["recognitionModelDir"]
    try:
        pipeline = PaddleOCR(**kwargs)
    except Exception as error:  # pragma: no cover - depends on host runtime
        raise DriverError(RUNTIME_UNAVAILABLE, "Could not initialise PP-OCRv5: %s" % error) from error
    _PADDLE_CACHE[language] = pipeline
    return pipeline


def _paddle_predict(pipeline, image):
    """Normalises PP-OCRv5 output across the documented result shapes."""
    if hasattr(pipeline, "predict"):
        return list(pipeline.predict(image))
    legacy = pipeline.ocr(image)
    return list(legacy) if legacy is not None else []


def _normalise_paddle_result(results):
    lines = []
    texts = []
    scores = []

    for entry in results:
        payload = entry
        if hasattr(payload, "json"):
            try:
                candidate = payload.json
                payload = candidate.get("res", candidate) if isinstance(candidate, dict) else candidate
            except Exception:
                payload = entry

        if isinstance(payload, dict) and "rec_texts" in payload:
            rec_texts = payload.get("rec_texts") or []
            rec_scores = payload.get("rec_scores") or []
            rec_polys = payload.get("rec_polys") or payload.get("dt_polys") or []
            for index, text in enumerate(rec_texts):
                score = float(rec_scores[index]) if index < len(rec_scores) else None
                polygon = rec_polys[index] if index < len(rec_polys) else None
                lines.append({"text": text, "confidence": score, "box": _polygon_to_box(polygon)})
                texts.append(text)
                if score is not None:
                    scores.append(score)
            continue

        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    box, text_info = item
                    if isinstance(text_info, (list, tuple)):
                        text = text_info[0]
                        score = text_info[1] if len(text_info) > 1 else None
                    else:
                        text, score = text_info, None
                    lines.append(
                        {
                            "text": text,
                            "confidence": float(score) if isinstance(score, (int, float)) else None,
                            "box": _polygon_to_box(box),
                        }
                    )
                    texts.append(text)
                    if isinstance(score, (int, float)):
                        scores.append(float(score))

    raw_text = "\n".join(line["text"] for line in lines)
    return raw_text, lines, (sum(scores) / len(scores) if scores else None)


# --------------------------------------------------------------------------- #
# Baidu Unlimited-OCR (English)
# --------------------------------------------------------------------------- #

_UNLIMITED_CACHE = {}


def _unlimited_model():
    if "model" in _UNLIMITED_CACHE:
        return _UNLIMITED_CACHE["model"], _UNLIMITED_CACHE["tokenizer"]
    accelerator = _accelerator()
    if not accelerator.get("cuda"):
        raise DriverError(
            UNSUPPORTED_HARDWARE,
            "Unlimited-OCR upstream documents Transformers inference on NVIDIA GPUs/CUDA only; "
            "no CUDA device was detected on this machine.",
        )
    try:
        import torch  # type: ignore
        from transformers import AutoModel, AutoTokenizer  # type: ignore
    except Exception as error:  # pragma: no cover - depends on host runtime
        raise DriverError(ENGINE_NOT_INSTALLED, "transformers/torch are not importable: %s" % error) from error

    model_id = (PAYLOAD_MODELS or {}).get("modelId", "baidu/Unlimited-OCR")
    cache_dir = os.path.join(MODELS_ROOT, "unlimited-ocr") if MODELS_ROOT else None
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True, cache_dir=cache_dir)
        model = AutoModel.from_pretrained(
            model_id,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=torch.bfloat16,
            cache_dir=cache_dir,
        )
        model = model.eval().cuda()
    except Exception as error:  # pragma: no cover - depends on host runtime
        raise DriverError(MODEL_NOT_INSTALLED, "Could not load Unlimited-OCR weights: %s" % error) from error
    _UNLIMITED_CACHE["model"] = model
    _UNLIMITED_CACHE["tokenizer"] = tokenizer
    return model, tokenizer


def _unlimited_recognize(image):
    model, tokenizer = _unlimited_model()
    from PIL import Image  # type: ignore

    out_dir = tempfile.mkdtemp(prefix="unlimited-", dir=TEMP_DIR)
    image_path = os.path.join(out_dir, "page.png")
    Image.fromarray(image).save(image_path)
    try:
        produced = model.infer(
            tokenizer,
            prompt="<image>document parsing.",
            image_file=image_path,
            output_path=out_dir,
            base_size=1024,
            image_size=1024,
            crop_mode=False,
            max_length=32768,
            no_repeat_ngram_size=35,
            ngram_window=1024,
            save_results=True,
        )
    except Exception as error:  # pragma: no cover - depends on host runtime
        raise DriverError(OCR_FAILED, "Unlimited-OCR inference failed: %s" % error) from error

    text = produced if isinstance(produced, str) else ""
    if not text:
        # Only files inside the directory we created are ever considered.
        for name in sorted(os.listdir(out_dir)):
            if name.lower().endswith((".txt", ".mmd", ".md")):
                with open(os.path.join(out_dir, name), "r", encoding="utf-8", errors="replace") as handle:
                    text = handle.read()
                break
    blocks = [{"text": line, "confidence": None, "box": None} for line in text.splitlines() if line.strip()]
    return text, blocks, None


# --------------------------------------------------------------------------- #
# Operation dispatch
# --------------------------------------------------------------------------- #

PROVIDER = "paddleocr"
MODELS_ROOT = ""
TEMP_DIR = ""
PAYLOAD_MODELS = {}
TOKEN = ""


def _default_language():
    return "ar" if PROVIDER == "paddleocr" else "en"


def op_health(_payload, _request_id):
    return {"ok": True, **_runtime_report(PROVIDER)}


def op_smoke(payload, _request_id):
    """Small, synthetic, non-private fixture. Never user material."""
    import numpy as np  # type: ignore

    languages = payload.get("languages") or [_default_language()]
    results = []
    # A white canvas is enough to prove the pipeline executes end to end; the
    # fixture deliberately asserts nothing about recognition accuracy.
    canvas = np.full((64, 256, 3), 255, dtype=np.uint8)
    for language in languages:
        if PROVIDER == "paddleocr":
            pipeline = _paddle_pipeline(language)
            raw, blocks, confidence = _normalise_paddle_result(_paddle_predict(pipeline, canvas))
        else:
            raw, blocks, confidence = _unlimited_recognize(canvas)
        results.append(
            {
                "language": language,
                "executed": True,
                "lineCount": len(blocks),
                "characterCount": len(raw),
                "confidence": confidence,
            }
        )
    return {
        "ok": True,
        "provider": PROVIDER,
        "fixture": "synthetic-white-canvas",
        "results": results,
        "hardware": _accelerator(),
        "runtime": _runtime_report(PROVIDER),
    }


def op_recognize_page(payload, request_id):
    image = _decode_image(payload)
    if _is_cancelled(request_id):
        raise DriverError(CANCELLED, "Request cancelled before inference")
    language = payload.get("language") or _default_language()
    if PROVIDER == "paddleocr":
        pipeline = _paddle_pipeline(language)
        raw, blocks, confidence = _normalise_paddle_result(_paddle_predict(pipeline, image))
    else:
        raw, blocks, confidence = _unlimited_recognize(image)
    if _is_cancelled(request_id):
        raise DriverError(CANCELLED, "Request cancelled during inference")
    return {
        "ok": True,
        "provider": PROVIDER,
        "language": language,
        "rawText": raw,
        "blocks": blocks,
        "confidence": confidence,
        "region": None,
    }


def op_recognize_region(payload, request_id):
    region = payload.get("region")
    if region:
        import numpy as np  # noqa: F401  (ensures numpy availability early)
        from PIL import Image  # type: ignore

        image = _decode_image(payload)
        x = max(0, int(region.get("x", 0)))
        y = max(0, int(region.get("y", 0)))
        width = max(1, int(region.get("width", image.shape[1])))
        height = max(1, int(region.get("height", image.shape[0])))
        cropped = image[y : y + height, x : x + width]
        buffer = io.BytesIO()
        Image.fromarray(cropped).save(buffer, format="PNG")
        payload = dict(payload)
        payload["imagePath"] = None
        payload["imageBase64"] = base64.b64encode(buffer.getvalue()).decode("ascii")
    result = op_recognize_page(payload, request_id)
    result["region"] = region or None
    return result


def op_cancel(payload, _request_id):
    target = payload.get("targetId")
    if isinstance(target, int):
        with _CANCEL_LOCK:
            _CANCELLED_IDS.add(target)
    return {"ok": True, "cancelled": target if isinstance(target, int) else None}


def _is_cancelled(request_id):
    with _CANCEL_LOCK:
        return request_id in _CANCELLED_IDS


OPERATIONS = {
    "health": op_health,
    "smoke": op_smoke,
    "recognize_page": op_recognize_page,
    "recognize_region": op_recognize_region,
    "cancel": op_cancel,
}


def _emit(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _handle(request):
    request_id = request.get("id")
    op = request.get("op")
    payload = request.get("payload") or {}
    if request.get("token") != TOKEN:
        _emit(
            {
                "id": request_id,
                "ok": False,
                "error": {"code": RUNTIME_UNAVAILABLE, "message": "Bad session token"},
            }
        )
        return
    handler = OPERATIONS.get(op)
    if handler is None:
        _emit(
            {"id": request_id, "ok": False, "error": {"code": INVALID_INPUT, "message": "Unknown op: %s" % op}}
        )
        return
    try:
        result = handler(payload, request_id)
        _emit({"id": request_id, "ok": True, "result": result})
    except DriverError as error:
        _emit({"id": request_id, "ok": False, "error": {"code": error.code, "message": error.message}})
    except Exception as error:  # noqa: BLE001 - the parent must always get a structured failure
        _emit(
            {
                "id": request_id,
                "ok": False,
                "error": {
                    "code": OCR_FAILED,
                    "message": "%s: %s" % (type(error).__name__, error),
                    "trace": traceback.format_exc()[-1500:],
                },
            }
        )


def main():
    global PROVIDER, MODELS_ROOT, TEMP_DIR, TOKEN, PAYLOAD_MODELS

    parser = argparse.ArgumentParser(description="Read & Watch OCR engine driver")
    parser.add_argument("--provider", required=True, choices=["paddleocr", "unlimited-ocr"])
    parser.add_argument("--models-root", default="")
    parser.add_argument("--temp-dir", default="")
    parser.add_argument("--token", required=True)
    parser.add_argument("--protocol", type=int, default=PROTOCOL_VERSION)
    parser.add_argument("--model-json", default="")
    args = parser.parse_args()

    if args.protocol != PROTOCOL_VERSION:
        sys.stderr.write("unsupported protocol %s\n" % args.protocol)
        return 2

    PROVIDER = args.provider
    TOKEN = args.token
    MODELS_ROOT = os.path.realpath(args.models_root) if args.models_root else ""
    if MODELS_ROOT:
        os.makedirs(MODELS_ROOT, exist_ok=True)
    if args.temp_dir:
        TEMP_DIR = os.path.realpath(args.temp_dir)
        os.makedirs(TEMP_DIR, exist_ok=True)
    else:
        TEMP_DIR = tempfile.mkdtemp(prefix="read-watch-ocr-")
    if args.model_json:
        try:
            PAYLOAD_MODELS = json.loads(args.model_json)
        except Exception:
            PAYLOAD_MODELS = {}

    _emit({"type": "ready", "protocol": PROTOCOL_VERSION, "provider": PROVIDER, "pid": os.getpid()})

    for line in sys.stdin:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            request = json.loads(stripped)
        except Exception:
            sys.stderr.write("unparsable request line\n")
            continue
        if not isinstance(request, dict):
            continue
        _handle(request)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
