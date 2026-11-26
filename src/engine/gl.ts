import { evicted } from './bitmaps'

export type Rect = [number, number, number, number]
// Backing-pixel rect [x, y, w, h] (y down) as clip space [left, top, w, h] (y up): the vertex shader maps the unit quad to left + a.x * w, top - a.y * h.
export const clipRect = ([x, y, w, h]: Rect, W: number, H: number): Rect => [(x / W) * 2 - 1, 1 - (y / H) * 2, (w / W) * 2, (h / H) * 2]
// The visible world rect [x0, y0, x1, y1] as [u, v, du, dv] of a texture that repeats every `period` world units.
export const paperUV = (r: Rect, period = 1024): Rect => [r[0] / period, r[1] / period, (r[2] - r[0]) / period, (r[3] - r[1]) / period]

export interface GL {
  readonly lost: boolean
  begin(w: number, h: number): void
  // One textured quad; the texture is uploaded on first use and kept until its bitmap is evicted.
  draw(bmp: ImageBitmap, clip: Rect, uv?: Rect, repeat?: boolean): void
  alpha(): number // centre pixel alpha of what was just drawn (e2e probe)
  destroy(): void
}

const VS = `#version 300 es
in vec2 a; uniform vec4 u_rect, u_uv; out vec2 v;
void main() { v = u_uv.xy + a * u_uv.zw; gl_Position = vec4(u_rect.xy + vec2(a.x * u_rect.z, -a.y * u_rect.w), 0.0, 1.0); }`
const FS = `#version 300 es
precision highp float; uniform sampler2D t; in vec2 v; out vec4 o;
void main() { o = texture(t, v); }`

// WebGL2 backend of the tile layer, or null when unavailable. Each bitmap is uploaded once (mipmapped); a frame is one draw call per quad.
export function createGL(canvas: HTMLCanvasElement, on: { lost(): void; restored(): void }): GL | null {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) return null
  let tex = new Map<ImageBitmap, WebGLTexture>(), rect: WebGLUniformLocation | null = null, uv: WebGLUniformLocation | null = null, lost = false
  const init = () => {
    const prog = gl.createProgram()!
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(prog, s) }
    gl.linkProgram(prog)
    gl.useProgram(prog)
    rect = gl.getUniformLocation(prog, 'u_rect'); uv = gl.getUniformLocation(prog, 'u_uv')
    gl.bindVertexArray(gl.createVertexArray())
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const a = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // premultiplied
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.clearColor(0, 0, 0, 0)
  }
  init()
  const upload = (bmp: ImageBitmap, repeat: boolean) => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
    return t
  }
  const drop = (b: ImageBitmap) => { const t = tex.get(b); if (t) { gl.deleteTexture(t); tex.delete(b) } }
  evicted.add(drop)
  const onLost = (e: Event) => { e.preventDefault(); lost = true; tex = new Map(); on.lost() } // textures are gone with the context; draw() uploads again from the bitmaps
  const onRestored = () => { init(); lost = false; on.restored() }
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored)
  return {
    get lost() { return lost },
    begin(w, h) { gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT) },
    draw(bmp, clip, uvr = [0, 0, 1, 1], repeat = false) {
      let t = tex.get(bmp)
      if (!t) tex.set(bmp, (t = upload(bmp, repeat)))
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.uniform4fv(rect, clip); gl.uniform4fv(uv, uvr)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    alpha() { const p = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p[3] },
    destroy() { evicted.delete(drop); canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); tex.forEach((t) => gl.deleteTexture(t)); tex.clear() },
  }
}
