import { fragmentShaderSource, vertexShaderSource } from "./shaders.js";

const WHITE = [1, 1, 1, 1];

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Shader linking failed: ${message}`);
  }
  return program;
}

/** Immediate-mode WebGL2 renderer. Static sprites and the dynamic turf all stay on the GPU. */
export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("This game requires a browser with WebGL2 support.");

    this.gl = gl;
    canvas.width = width;
    canvas.height = height;
    this.program = createProgram(gl);
    gl.useProgram(this.program);
    this.uniforms = Object.fromEntries(
      ["u_resolution", "u_position", "u_size", "u_texture", "u_tint", "u_camera"].map(
        (name) => [name, gl.getUniformLocation(this.program, name)],
      ),
    );

    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 0, 0,  1, 0, 1, 0,  0, 1, 0, 1,
      0, 1, 0, 1,  1, 0, 1, 0,  1, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    const texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    gl.uniform2f(this.uniforms.u_resolution, width, height);
    gl.uniform2f(this.uniforms.u_camera, 0, 0);
    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.whiteTexture = this.createTexture(1, 1, new Uint8Array([255, 255, 255, 255]));
  }

  createTexture(width, height, pixels) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return texture;
  }

  updateTexture(texture, width, height, pixels) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }

  setCamera(x, y) {
    this.gl.uniform2f(this.uniforms.u_camera, x, y);
  }

  begin(clearColor = [0, 0, 0, 1]) {
    const gl = this.gl;
    gl.clearColor(...clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  drawSprite(sprite, x, y, tint = WHITE) {
    this.draw(sprite.texture, x, y, sprite.width, sprite.height, tint);
  }

  draw(texture, x, y, width, height, tint = WHITE) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform2f(this.uniforms.u_position, Math.round(x), Math.round(y));
    gl.uniform2f(this.uniforms.u_size, width, height);
    gl.uniform4fv(this.uniforms.u_tint, tint);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  drawRect(x, y, width, height, color) {
    this.draw(this.whiteTexture, x, y, width, height, color);
  }
}
