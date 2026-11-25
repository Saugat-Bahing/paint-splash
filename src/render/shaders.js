export const vertexShaderSource = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform vec2 u_resolution;
uniform vec2 u_position;
uniform vec2 u_size;
uniform vec2 u_camera;

out vec2 v_texCoord;

void main() {
  vec2 pixelPosition = u_position + a_position * u_size + u_camera;
  vec2 clipPosition = pixelPosition / u_resolution * 2.0 - 1.0;

  gl_Position = vec4(clipPosition.x, -clipPosition.y, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const fragmentShaderSource = `#version 300 es
precision mediump float;

uniform sampler2D u_texture;
uniform vec4 u_tint;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord) * u_tint;
  if (color.a < 0.01) discard;
  outColor = color;
}
`;
