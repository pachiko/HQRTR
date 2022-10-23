#ifdef GL_ES
precision highp float;
#endif

uniform vec3 uLightDir;
uniform vec3 uCameraPos;
uniform vec3 uLightRadiance;
uniform sampler2D uGDiffuse;
uniform sampler2D uGDepth;
uniform sampler2D uGNormalWorld;
uniform sampler2D uGShadow;
uniform sampler2D uGPosWorld;

varying mat4 vWorldToScreen;
varying highp vec4 vPosWorld;

#define M_PI 3.1415926535897932384626433832795
#define TWO_PI 6.283185307
#define INV_PI 0.31830988618
#define INV_TWO_PI 0.15915494309

#define SAMPLE_NUM 2

float Rand1(inout float p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 Rand2(inout float p) {
  return vec2(Rand1(p), Rand1(p));
}

float InitRand(vec2 uv) {
	vec3 p3  = fract(vec3(uv.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 SampleHemisphereUniform(inout float s, out float pdf) {
  vec2 uv = Rand2(s);
  float z = uv.x;
  float phi = uv.y * TWO_PI;
  float sinTheta = sqrt(1.0 - z*z);
  vec3 dir = vec3(sinTheta * cos(phi), sinTheta * sin(phi), z);
  pdf = INV_TWO_PI;
  return dir;
}

vec3 SampleHemisphereCos(inout float s, out float pdf) {
  vec2 uv = Rand2(s);
  float z = sqrt(1.0 - uv.x);
  float phi = uv.y * TWO_PI;
  float sinTheta = sqrt(uv.x);
  vec3 dir = vec3(sinTheta * cos(phi), sinTheta * sin(phi), z);
  pdf = z * INV_PI;
  return dir;
}

void LocalBasis(vec3 n, out vec3 b1, out vec3 b2) {
  float sign_ = sign(n.z);
  if (n.z == 0.0) {
    sign_ = 1.0;
  }
  float a = -1.0 / (sign_ + n.z);
  float b = n.x * n.y * a;
  b1 = vec3(1.0 + sign_ * n.x * n.x * a, sign_ * b, -sign_ * n.x);
  b2 = vec3(b, sign_ + n.y * n.y * a, -n.y);
}

vec4 Project(vec4 a) {
  return a / a.w;
}

float GetDepth(vec3 posWorld) {
  float depth = (vWorldToScreen * vec4(posWorld, 1.0)).w;
  return depth;
}

/*
 * Transform point from world space to screen space([0, 1] x [0, 1])
 */
vec2 GetScreenCoordinate(vec3 posWorld) {
  vec2 uv = Project(vWorldToScreen * vec4(posWorld, 1.0)).xy * 0.5 + 0.5;
  return uv;
}

float GetGBufferDepth(vec2 uv) {
  float depth = texture2D(uGDepth, uv).x;
  if (depth < 1e-2) {
    depth = 1000.0;
  }
  return depth;
}

vec3 GetGBufferNormalWorld(vec2 uv) {
  vec3 normal = texture2D(uGNormalWorld, uv).xyz;
  return normal;
}

vec3 GetGBufferPosWorld(vec2 uv) {
  vec3 posWorld = texture2D(uGPosWorld, uv).xyz;
  return posWorld;
}

float GetGBufferuShadow(vec2 uv) {
  float visibility = texture2D(uGShadow, uv).x;
  return visibility;
}

vec3 GetGBufferDiffuse(vec2 uv) {
  vec3 diffuse = texture2D(uGDiffuse, uv).xyz;
  diffuse = pow(diffuse, vec3(2.2));
  return diffuse;
}

/*
 * Evaluate diffuse bsdf value.
 *
 * wi, wo are all in world space.
 * uv is in screen space, [0, 1] x [0, 1].
 */
vec3 EvalDiffuse(vec3 wi, vec3 wo, vec2 uv) {
  vec3 diffuse = GetGBufferDiffuse(uv);
  vec3 normal_world = normalize(GetGBufferNormalWorld(uv));
  vec3 L = diffuse*max(0.0, dot(normal_world, wi))*INV_PI; // rho/pi*cos(theta)
  return L;
}

/*
 * Evaluate directional light with shadow map
 * uv is in screen space, [0, 1] x [0, 1].
 */
vec3 EvalDirectionalLight(vec2 uv) {
  float viz = GetGBufferuShadow(uv);
  vec3 Le = viz*uLightRadiance;
  return Le;
}

/*
 * Ray-Marching. Ori and Dir are ray parameters in world-space
 */
bool RayMarch(vec3 ori, vec3 dir, out vec3 hitPos) {
  bool res = false;
  const int max_iter = 200;
  float step_size = 0.04;
  float eps = 1e-3;
  dir = normalize(dir);

  for (int i = 1; i <= max_iter; i++) {
    vec3 next = ori + float(i)*step_size*dir;
    vec2 uv = GetScreenCoordinate(next);
    float gd = GetGBufferDepth(uv); // depth of z-buffer (closest point from camera's POV)
    float d = GetDepth(next); // depth of ray at this point

    if (gd + eps < d) { // ray is behind object
      res = true;
      hitPos = GetGBufferPosWorld(uv);
      return res;
    }
  }

  return res;
}

void main() {
  float s = InitRand(gl_FragCoord.xy);

  vec3 L = vec3(0.0);
  vec2 uv = GetScreenCoordinate(vPosWorld.xyz);
  vec3 wo = uCameraPos - vPosWorld.xyz; // hit point to camera
  vec3 wi = uLightDir; // hit point to light
  L = EvalDiffuse(wi, wo, uv)*EvalDirectionalLight(uv);

  vec3 normal_world = normalize(GetGBufferNormalWorld(uv));
  vec3 tangent_world, bitangent_world;
  LocalBasis(normal_world, tangent_world, bitangent_world);
  tangent_world = normalize(tangent_world);
  bitangent_world = normalize(bitangent_world);
  mat3 local_to_world = mat3(tangent_world, bitangent_world, normal_world);

  vec3 L_ind = vec3(0.0);
  const int n = SAMPLE_NUM;
  for (int i = 0; i < n; i++) {
    float pdf;

    vec3 dir = SampleHemisphereCos(s, pdf);
    dir = normalize(local_to_world*dir);

    vec3 hitPos;
    bool hit = RayMarch(vPosWorld.xyz, dir, hitPos);

    if (hit) {
      vec3 L_i;
      vec2 i_uv = GetScreenCoordinate(hitPos);
      L_i = EvalDiffuse(dir, wo, uv)/pdf*EvalDiffuse(wi, -dir, i_uv)*EvalDirectionalLight(i_uv);
      L_ind += L_i;
    }
  }

  L_ind /= float(n);
  L += L_ind;

  vec3 color = pow(clamp(L, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2));
  gl_FragColor = vec4(color, 1.0);
}
