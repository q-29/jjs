/**
 * jjs — Image/Video to JJS custom moveset converter
 * Client-side moveset generator for Jujutsu Shenanigans (Roblox)
 */

const mediaInput = document.getElementById('mediaInput');
const resolutionInput = document.getElementById('resolution');
const blockSizeInput = document.getElementById('blockSize');
const gapInput = document.getElementById('gap');
const thresholdInput = document.getElementById('threshold');
const colorModeInput = document.getElementById('colorMode');
const singleColorRow = document.getElementById('singleColorRow');
const singleColorInput = document.getElementById('singleColor');
const effectTypeInput = document.getElementById('effectType');
const durationInput = document.getElementById('duration');
const fpsInput = document.getElementById('fps');
const videoSettingsRow = document.getElementById('videoSettingsRow');
const regenBtn = document.getElementById('regenBtn');
const origCanvas = document.getElementById('origCanvas');
const blockCanvas = document.getElementById('blockCanvas');
const blockCountEl = document.getElementById('blockCount');
const mediaInfoEl = document.getElementById('mediaInfo');
const exportFormat = document.getElementById('exportFormat');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const importInput = document.getElementById('importInput');
const decodeBtn = document.getElementById('decodeBtn');
const zstdStatus = document.getElementById('zstdStatus');
const zstdProgressRow = document.getElementById('zstdProgressRow');
const zstdProgress = document.getElementById('zstdProgress');
const zstdProgressText = document.getElementById('zstdProgressText');
const errorMsg = document.getElementById('errorMsg');

const resNum = document.getElementById('resNum');
const sizeNum = document.getElementById('sizeNum');
const gapNum = document.getElementById('gapNum');
const threshNum = document.getElementById('threshNum');
const durNum = document.getElementById('durNum');
const fpsNum = document.getElementById('fpsNum');
const videoPreview = document.getElementById('videoPreview');

let media = null;
let mediaType = null;
let blocks = [];
let zstdReady = false;
let getZstdCodec = null;
let isGenerating = false;

// ---- Color Helpers ----

function hexToRgbStr(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const bigint = parseInt(clean, 16);
  if (isNaN(bigint)) return '255, 255, 255';
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

function parseColorToRgbStr(color) {
  if (!color) return '255, 255, 255';
  if (color.startsWith('#')) return hexToRgbStr(color);
  const parts = color.replace(/rgba?\(|\)/g, '').split(',');
  if (parts.length >= 3) {
    return parts.slice(0, 3).map(s => Math.round(parseFloat(s.trim())) || 0).join(', ');
  }
  return '255, 255, 255';
}

// ---- UI Wiring ----

function bindSliderNum(sliderId, numId) {
  const slider = document.getElementById(sliderId);
  const num = document.getElementById(numId);
  if (!slider || !num) return;
  slider.addEventListener('input', () => { num.value = slider.value; });
  num.addEventListener('input', () => { slider.value = num.value; });
  num.addEventListener('change', () => {
    const min = parseFloat(num.min) || 0;
    const max = parseFloat(num.max) || 100;
    let v = parseFloat(num.value);
    if (isNaN(v)) v = min;
    v = Math.min(Math.max(v, min), max);
    num.value = v;
    slider.value = v;
  });
}

bindSliderNum('resolution', 'resNum');
bindSliderNum('blockSize', 'sizeNum');
bindSliderNum('gap', 'gapNum');
bindSliderNum('threshold', 'threshNum');
bindSliderNum('duration', 'durNum');
bindSliderNum('fps', 'fpsNum');

if (colorModeInput && singleColorRow) {
  colorModeInput.addEventListener('change', () => {
    singleColorRow.style.display = colorModeInput.value === 'single' ? 'flex' : 'none';
  });
}

mediaInput.addEventListener('change', handleMediaSelect);
regenBtn.addEventListener('click', generateMoveset);
copyBtn.addEventListener('click', copyOutput);
downloadBtn.addEventListener('click', downloadOutput);
decodeBtn.addEventListener('click', decodeExistingCode);

exportFormat.addEventListener('change', async () => {
  if (!output.value) return;
  try {
    setGenerating(true);
    if (exportFormat.value === 'code') {
      const parsed = JSON.parse(output.value);
      const code = await encodeCode(parsed.slots || parsed);
      if (code) output.value = code;
    } else {
      const decoded = await decodeCode(output.value);
      if (decoded) output.value = JSON.stringify({ slots: decoded }, null, 2);
    }
  } catch (e) {
    showError('Conversion failed: ' + (e.message || e.toString()));
  } finally {
    setGenerating(false);
  }
});

function showError(msg) {
  if (!errorMsg) return;
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  if (errorMsg) errorMsg.style.display = 'none';
}

function setGenerating(gen) {
  isGenerating = gen;
  regenBtn.disabled = gen || !zstdReady || !media;
  regenBtn.textContent = gen ? 'Generating…' : 'Regenerate Moveset';
  copyBtn.disabled = gen || !output.value;
  downloadBtn.disabled = gen || !output.value;
  if (!gen) {
    if (!media) regenBtn.title = 'Upload an image or video first';
    else if (!zstdReady) regenBtn.title = 'zstd library still loading…';
    else regenBtn.title = '';
  }
}

// ---- zstd Library Loader ----

function updateZstdStatus(ready, message, progress) {
  zstdReady = ready;
  if (progress !== undefined && progress !== null && zstdProgressRow) {
    zstdProgressRow.style.display = 'block';
    if (zstdProgress) zstdProgress.style.width = progress + '%';
    if (zstdProgressText) zstdProgressText.textContent = message || '';
  }
  if (ready && zstdStatus) {
    zstdStatus.textContent = 'zstd ready — generating real JJS import codes.';
    zstdStatus.style.color = '#00ff9d';
    if (zstdProgressRow) zstdProgressRow.style.display = 'none';
    regenBtn.disabled = !media;
    regenBtn.textContent = 'Regenerate Moveset';
    if (media) generateMoveset();
  } else if (message && !ready && zstdStatus) {
    zstdStatus.textContent = message;
    zstdStatus.style.color = '#ff6b6b';
    regenBtn.disabled = true;
    regenBtn.textContent = 'zstd not loaded';
  }
}

async function loadZstdLibrary() {
  const init = () => {
    const zstdClass = window.ZstdCodec?.ZstdCodec || window.ZstdCodec;
    if (zstdClass && typeof zstdClass.run === 'function') {
      getZstdCodec = new Promise((resolve) => {
        zstdClass.run((zstd) => {
          resolve(zstd);
          updateZstdStatus(true, null, 100);
        });
      });
      return true;
    }
    return false;
  };

  if (init()) return;

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (init()) {
      clearInterval(poll);
    } else if (attempts > 50) {
      clearInterval(poll);
      updateZstdStatus(false, 'Failed to initialize zstd. Check that js/zstd-codec.bundle.js exists.', 100);
    }
  }, 100);
}

loadZstdLibrary();

// ---- Compression / Decompression ----

async function withCodec(fn) {
  const zstd = await getZstdCodec;
  return fn(zstd);
}

// Level 3 prevents WebAssembly OOM memory crashes
async function zstdCompress(data, level = 3) {
  return withCodec((zstd) => {
    const codec = new zstd.Simple();
    try {
      const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      return codec.compress(input, level);
    } finally {
      if (codec.delete) codec.delete();
    }
  });
}

async function zstdDecompress(data) {
  return withCodec((zstd) => {
    const codec = new zstd.Simple();
    try {
      return codec.decompress(data);
    } finally {
      if (codec.delete) codec.delete();
    }
  });
}

async function encodeCode(slots) {
  if (!zstdReady) throw new Error('zstd library not ready');

  const encodeSlots = slots.map(s => ({
    ...s,
    DATA: typeof s.DATA === 'string' ? s.DATA : JSON.stringify(s.DATA),
  }));

  const json = JSON.stringify(encodeSlots);
  const compressed = await zstdCompress(json, 3);

  const bytes = new Uint8Array(compressed);
  let binary = '';
  const chunkSize = 16384;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function decodeCode(code) {
  if (!zstdReady) throw new Error('zstd library not ready');

  let b64 = code.trim().replace(/\s+/g, '');
  if (b64.startsWith('jjs:')) b64 = b64.slice(4);

  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const decompressed = await zstdDecompress(bytes);
  const json = new TextDecoder().decode(decompressed);
  const slots = JSON.parse(json);

  return slots.map(slot => {
    const expanded = { ...slot };
    if (typeof expanded.DATA === 'string') {
      try {
        expanded.DATA = JSON.parse(expanded.DATA);
      } catch {}
    }
    return expanded;
  });
}

// ---- Media Handling ----

function handleMediaSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');
  mediaType = isVideo ? 'video' : 'image';

  if (videoSettingsRow) {
    videoSettingsRow.style.display = isVideo ? 'flex' : 'none';
  }

  if (isVideo) {
    media = videoPreview;
    media.src = url;
    media.onloadedmetadata = () => {
      mediaInfoEl.textContent = `Video: ${media.videoWidth}×${media.videoHeight}, ${media.duration.toFixed(2)}s`;
      drawOriginalFrame(0);
      videoPreview.style.display = 'block';
      origCanvas.style.display = 'none';
      setGenerating(false);
      if (zstdReady) generateMoveset();
    };
    media.onerror = () => showError('Failed to load video file.');
  } else {
    const img = new Image();
    img.onload = () => {
      media = img;
      mediaInfoEl.textContent = `Image: ${img.width}×${img.height}`;
      drawOriginal();
      if (videoPreview) videoPreview.style.display = 'none';
      origCanvas.style.display = 'block';
      URL.revokeObjectURL(url);
      setGenerating(false);
      if (zstdReady) generateMoveset();
    };
    img.onerror = () => showError('Failed to load image file.');
    img.src = url;
  }
}

function drawOriginal() {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');
  const maxDisp = 400;
  const scale = Math.min(maxDisp / media.width, maxDisp / media.height, 1);
  canvas.width = media.width * scale;
  canvas.height = media.height * scale;
  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
}

function drawOriginalFrame(time) {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');
  const vid = videoPreview;
  vid.currentTime = time;
  vid.onseeked = () => {
    const maxDisp = 400;
    const scale = Math.min(maxDisp / vid.videoWidth, maxDisp / vid.videoHeight, 1);
    canvas.width = vid.videoWidth * scale;
    canvas.height = vid.videoHeight * scale;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
  };
}

// ---- Sampling & Generation ----

async function generateMoveset() {
  if (!media || !zstdReady || isGenerating) return;

  setGenerating(true);
  hideError();

  try {
    const res = parseInt(resolutionInput.value, 10);
    const blockSize = parseFloat(blockSizeInput.value);
    const gap = parseFloat(gapInput.value);
    const threshold = parseInt(thresholdInput.value, 10);
    const colorMode = colorModeInput.value;
    const singleColor = singleColorInput ? singleColorInput.value : '#00ff9d';
    const duration = parseFloat(durationInput.value);
    const fps = fpsInput ? parseInt(fpsInput.value, 10) : 10;

    if (mediaType === 'image') {
      blocks = sampleImageToBlocks(media, res, blockSize, threshold, colorMode, singleColor, duration);
    } else {
      blocks = await sampleVideoToBlocks(media, res, blockSize, threshold, colorMode, singleColor, duration, fps);
    }

    drawBlockPreview(blocks, res, gap, mediaType === 'video' ? media.duration : duration);
    blockCountEl.textContent = `Blocks: ${blocks.length}`;

    const effectType = effectTypeInput ? effectTypeInput.value : 'Block';
    const moveset = buildMoveset(blocks, res, blockSize, gap, duration, effectType, fps);

    const json = JSON.stringify(moveset, null, 2);
    const code = await encodeCode(moveset.slots);

    output.value = exportFormat.value === 'code' ? code : json;
  } catch (e) {
    console.error(e);
    showError('Generation failed: ' + (e.message || e.toString()));
  } finally {
    setGenerating(false);
  }
}

function sampleImageToBlocks(image, res, blockSize, threshold, colorMode, singleColor, duration) {
  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const octx = off.getContext('2d');
  octx.drawImage(image, 0, 0, res, res);

  const { data } = octx.getImageData(0, 0, res, res);
  const blocks = [];

  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      const i = (gy * res + gx) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

      if (a < threshold) continue;

      let color;
      if (colorMode === 'single') {
        color = singleColor;
      } else if (colorMode === 'grayscale') {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        color = `rgb(${gray},${gray},${gray})`;
      } else {
        color = `rgb(${r},${g},${b})`;
      }

      blocks.push({
        gx, gy,
        color,
        size: blockSize,
        opacity: a / 255,
        time: duration,
      });
    }
  }
  return blocks;
}

async function sampleVideoToBlocks(video, res, blockSize, threshold, colorMode, singleColor, duration, fps) {
  const blocks = [];
  const effectiveDuration = Math.min(duration, video.duration || duration);
  const frameInterval = 1.0 / fps;
  const numFrames = Math.ceil(effectiveDuration / frameInterval);

  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const octx = off.getContext('2d');

  for (let f = 0; f < numFrames; f++) {
    const t = f * frameInterval;
    if (t > effectiveDuration) break;

    await seekAndDrawFrame(video, t, octx, res, res);
    const { data } = octx.getImageData(0, 0, res, res);

    for (let gy = 0; gy < res; gy++) {
      for (let gx = 0; gx < res; gx++) {
        const i = (gy * res + gx) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

        if (a < threshold) continue;

        let color;
        if (colorMode === 'single') {
          color = singleColor;
        } else if (colorMode === 'grayscale') {
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          color = `rgb(${gray},${gray},${gray})`;
        } else {
          color = `rgb(${r},${g},${b})`;
        }

        blocks.push({
          gx, gy,
          color,
          size: blockSize,
          opacity: a / 255,
          time: t,
        });
      }
    }
  }
  return blocks;
}

function seekAndDrawFrame(video, time, ctx, width, height) {
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('seeked', onSeeked);
      ctx.drawImage(video, 0, 0, width, height);
      resolve();
    };
    const onSeeked = () => cleanup();
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
    setTimeout(cleanup, 500);
  });
}

function drawBlockPreview(blocks, res, gap, totalTime) {
  const canvas = blockCanvas;
  const ctx = canvas.getContext('2d');
  const size = 400;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, size, size);

  const stride = size / res;
  const tileSize = Math.max(1, stride - gap);
  const previewTime = totalTime / 2;

  blocks.forEach(b => {
    if (mediaType === 'video' && Math.abs(b.time - previewTime) > 0.5) return;
    const px = Math.round(b.gx * stride);
    const py = Math.round(b.gy * stride);
    ctx.globalAlpha = b.opacity;
    ctx.fillStyle = b.color;
    ctx.fillRect(px, py, tileSize, tileSize);
  });
  ctx.globalAlpha = 1.0;
}

// ---- JJS Moveset Builder ----

const ART_DISTANCE = 8;
const ART_HEIGHT = 4;
const fmt = (n) => String(Math.round(n * 1000) / 1000);

function blockPosition(b, res, pitch) {
  const half = (res - 1) / 2;
  const x = (b.gx - half) * pitch;
  const y = (half - b.gy) * pitch + ART_HEIGHT;
  return `${fmt(x)}, ${fmt(y)}, ${fmt(ART_DISTANCE)}`;
}

function buildVISUALot(b, blockSize, effectType, pos, life) {
  const c = parseColorToRgbStr(b.color);
  const transp = Math.round((1 - b.opacity) * 1000) / 1000;
  return {
    K_NAME: 'VISUAL',
    EFFECT: effectType,
    COLOR: c,
    'ALT COLOR': c,
    SIZE: blockSize,
    'ALT SIZE': 1, // 1.0x size multiplier keeps blocks frozen at original scale
    'SIZE 2': '-1, -1, -1',
    'ALT SIZE 2': '-1, -1, -1',
    OPACITY: transp,
    'ALT OPACITY': transp,
    POSITION: pos,
    'ALT POSITION': pos,
    ROTATION: '0, 0, 0',
    'ALT ROTATION': '0, 0, 0',
    TIME: life,
    AMOUNT: 1,
    TEXTURE: 0,
    'BODY PART': 'HumanoidRootPart',
    'EASING STYLE': 'Linear',
    'EASING DIRECTION': 'InOut',
    'LAST HIT': -1,
    'CAN COLLIDE': false,
    'CLIENT SIDED': true, // Renders locally to avoid server visual limit culling
    'RUN ON SERVER': false,
    'CANCEL ON INTERRUPT': false,
    'RELATIVE FROM BRANCH': false,
  };
}

function buildMoveset(blocks, res, blockSize, gap, duration, effectType, fps) {
  const pitch = blockSize + gap;
  const life = mediaType === 'video' ? Math.round((1 / (fps || 10)) * 1000) / 1000 : duration;

  const groups = new Map();
  blocks.forEach(b => {
    const k = b.time.toFixed(3);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  });
  const times = [...groups.keys()].map(Number).sort((a, b) => a - b);

  const line = [];

  // Stop character velocity so walking doesn't drag the visual art
  line.push({
    K_NAME: 'VELO',
    FORCE: '0, 0, 0',
    TIME: life,
  });

  let prev = null;
  times.forEach(t => {
    if (prev !== null && t > prev) {
      line.push({ K_NAME: 'WAIT', TIME: Math.round((t - prev) * 1000) / 1000 });
    }
    prev = t;
    groups.get(t.toFixed(3)).forEach(b => {
      const pos = blockPosition(b, res, pitch);
      line.push(buildVISUALot(b, blockSize, effectType, pos, life));
    });
  });

  const label = mediaType === 'video' ? 'Video' : 'Image';

  // Keep entire moveset on Move 1 (Key 1)
  const slots = [{
    ADD: false,
    NAME: `${label} Moveset`,
    K_NAME: 'SKILL',
    KEY: 1,
    COOLDOWN: mediaType === 'video' ? Math.ceil(duration) : 5,
    DATA: { Line: line, Req: [], Prop: [] },
    'TOOL TIP': '',
  }];

  return {
    name: `${mediaType}-moveset`,
    slots,
  };
}

// ---- Clipboard & Download ----

async function copyOutput() {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = orig; }, 1200);
  } catch {
    output.select();
    document.execCommand('copy');
  }
}

function downloadOutput() {
  if (!output.value) return;
  const ext = exportFormat.value === 'code' ? 'jjsmoveset' : 'json';
  const blob = new Blob([output.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jjs-moveset.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function decodeExistingCode() {
  const code = importInput.value.trim();
  if (!code) return;

  if (!zstdReady) {
    showError('zstd library is still loading. Please wait.');
    return;
  }

  try {
    setGenerating(true);
    const decoded = await decodeCode(code);
    exportFormat.value = 'json';
    output.value = JSON.stringify({ slots: decoded }, null, 2);
    output.scrollTop = 0;
  } catch (e) {
    showError('Failed to decode: ' + (e.message || e.toString()));
  } finally {
    setGenerating(false);
  }
}
