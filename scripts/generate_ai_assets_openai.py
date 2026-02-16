from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image

PROMPTS_PATH = Path('scripts/ai_asset_prompts.json')
OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/generations'


def call_openai_image_api(
    api_key: str,
    prompt: str,
    size: str,
    transparent_background: bool,
) -> bytes:
    payload: dict[str, Any] = {
        'model': 'gpt-image-1',
        'prompt': prompt,
        'size': size,
        'output_format': 'png',
    }
    if transparent_background:
        payload['background'] = 'transparent'

    req = Request(
        OPENAI_IMAGE_API_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urlopen(req, timeout=120) as resp:
            body = resp.read().decode('utf-8')
    except HTTPError as err:
        detail = err.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'OpenAI API error {err.code}: {detail}') from err
    except URLError as err:
        raise RuntimeError(f'OpenAI API connection failed: {err}') from err

    data = json.loads(body)
    entries = data.get('data')
    if not isinstance(entries, list) or len(entries) == 0:
        raise RuntimeError(f'Unexpected response payload: {data}')
    b64_json = entries[0].get('b64_json')
    if not isinstance(b64_json, str):
        raise RuntimeError(f'No b64_json in response: {entries[0]}')
    return base64.b64decode(b64_json)


def maybe_resize(path: Path) -> None:
    if '/backgrounds/' in path.as_posix():
        # keep 1024 for tiled backgrounds
        return
    img = Image.open(path).convert('RGBA')
    resized = img.resize((256, 256), Image.Resampling.NEAREST)
    resized.save(path)


def main() -> None:
    api_key = os.getenv('OPENAI_API_KEY', '').strip()
    if not api_key:
        print('OPENAI_API_KEY is not set. Skipping GPT image generation.')
        print('Set OPENAI_API_KEY and run: npm run assets:ai')
        return

    prompts = json.loads(PROMPTS_PATH.read_text(encoding='utf-8'))
    if not isinstance(prompts, list):
        raise RuntimeError('scripts/ai_asset_prompts.json must be an array')

    for index, item in enumerate(prompts):
        if not isinstance(item, dict):
            continue
        out_path = Path(str(item.get('path', '')).strip())
        prompt = str(item.get('prompt', '')).strip()
        size = str(item.get('size', '1024x1024')).strip()
        transparent_background = bool(item.get('transparent_background', True))

        if not out_path or not prompt:
            print(f'[{index}] skipped invalid prompt item')
            continue

        print(f'[{index + 1}/{len(prompts)}] generating {out_path}')
        image_bytes = call_openai_image_api(
            api_key=api_key,
            prompt=prompt,
            size=size,
            transparent_background=transparent_background,
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(image_bytes)
        maybe_resize(out_path)

    print('AI asset generation completed.')


if __name__ == '__main__':
    main()
