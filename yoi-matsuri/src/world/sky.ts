import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three'
import { PALETTE } from './palette'
import type { WorldObject } from './types'

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
varying vec3 vWorldPosition;
void main() {
  // 地平線(h=0)から天頂(h=1)へのグラデーション
  float h = clamp(normalize(vWorldPosition).y, 0.0, 1.0);
  float t = pow(h, 0.6);
  gl_FragColor = vec4(mix(uHorizonColor, uTopColor, t), 1.0);
  // ShaderMaterialには自動付与されないため明示的にトーンマッピングとsRGB変換を適用する
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * 夜空ドーム: 内側を向いた大球に上下グラデーションのシェーダを貼る。フォグの影響は受けない。
 * 上端 #0a0e2e → 地平線 #1a2348(ART §2)。
 */
export function createSky(): WorldObject {
  const geometry = new SphereGeometry(300, 24, 12)
  const material = new ShaderMaterial({
    uniforms: {
      uTopColor: { value: new Color(PALETTE.skyTop) },
      uHorizonColor: { value: new Color(PALETTE.skyHorizon) },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'sky'

  return {
    object: mesh,
    dispose(): void {
      geometry.dispose()
      material.dispose()
    },
  }
}
