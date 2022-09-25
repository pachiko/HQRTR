#ifdef GL_ES
precision mediump float;
#endif

// PCSS Implementation paper:
// https://developer.download.nvidia.com/whitepapers/2008/PCSS_Integration.pdf

// Phong related variables
uniform sampler2D uSampler;
uniform vec3 uKd;
uniform vec3 uKs;
uniform vec3 uLightPos;
uniform vec3 uCameraPos;
uniform vec3 uLightIntensity;

varying highp vec2 vTextureCoord;
varying highp vec3 vFragPos;
varying highp vec3 vNormal;

// Shadow map related variables
#define NUM_SAMPLES 50
#define BLOCKER_SEARCH_NUM_SAMPLES NUM_SAMPLES
#define PCF_NUM_SAMPLES NUM_SAMPLES
#define NUM_RINGS 10
#define PCF_FILTER_SIZE 0.001 // For hard-coded PCF!

#define LIGHT_WORLD_SIZE 0.5 // Bigger lights, softer shadows; but not until it filters outside the shadow-map!
#define LIGHT_FRUSTUM_WIDTH 100.0 // Half-width
#define NEAR_PLANE 1.0
#define LIGHT_SIZE_UV (LIGHT_WORLD_SIZE / LIGHT_FRUSTUM_WIDTH)

#define EPS 1e-3
#define PI 3.141592653589793
#define PI2 6.283185307179586

uniform sampler2D uShadowMap;
varying vec4 vPositionFromLight;

/*
  PRNG
*/
highp float rand_1to1(highp float x ) { 
  // -1 -1
  return fract(sin(x)*10000.0);
}

highp float rand_2to1(vec2 uv ) { 
  // 0 - 1
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}

float unpack(vec4 rgbaDepth) {
    const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
    float res = dot(rgbaDepth, bitShift);
    if (res < float(EPS)) res = 1.0; // background is encoded as 0.0
    return res;
}

/*
  Disk sampling
*/
vec2 diskSamples[NUM_SAMPLES];

void poissonDiskSamples( const in vec2 randomSeed ) {
  float ANGLE_STEP = PI2 * float( NUM_RINGS ) / float( NUM_SAMPLES );
  float INV_NUM_SAMPLES = 1.0 / float( NUM_SAMPLES );

  float angle = rand_2to1( randomSeed ) * PI2;
  float radius = INV_NUM_SAMPLES;
  float radiusStep = radius;

  for( int i = 0; i < NUM_SAMPLES; i ++ ) {
    diskSamples[i] = vec2( cos( angle ), sin( angle ) ) * pow( radius, 0.75 );
    radius += radiusStep;
    angle += ANGLE_STEP;
  }
}

void uniformDiskSamples( const in vec2 randomSeed ) {

  float randNum = rand_2to1(randomSeed);
  float sampleX = rand_1to1( randNum ) ;
  float sampleY = rand_1to1( sampleX ) ;

  float angle = sampleX * PI2;
  float radius = sqrt(abs(sampleY));

  for( int i = 0; i < NUM_SAMPLES; i ++ ) {
    diskSamples[i] = vec2( radius * cos(angle) , radius * sin(angle)  );

    sampleX = rand_1to1( sampleY ) ;
    sampleY = rand_1to1( sampleX ) ;

    angle = sampleX * PI2;
    radius = sqrt(abs(sampleY));
  }
}

/*
  Returns the UV coordinates to lookup shadow map. [-1, +1]
*/
vec3 getShadowCoord() {
  vec3 res = vPositionFromLight.xyz/vPositionFromLight.w;
  res = (res + 1.0) / 2.0;
  return res;
}

/*
  Depth value using shadow map lookup.
*/
float shadowMapLookUp(sampler2D shadowMap, vec2 uv) {
  return unpack(texture2D(shadowMap, uv));
}

/*
  Hard Shadows.
*/
float useShadowMap(sampler2D shadowMap, vec4 shadowCoord){
  float depth = shadowMapLookUp(shadowMap, shadowCoord.xy);
  float z = shadowCoord.z;
  if (z - float(EPS) < depth) return 1.0;
  return 0.0;
}

/*
  Percentage-closer filtering (PCF). Also used by PCSS by varying the filter radius.
*/
float PCF(sampler2D shadowMap, vec4 coords, float filterRadius) {
  float numVis = float(PCF_NUM_SAMPLES);
  float total = numVis;

  poissonDiskSamples(coords.xy*PI);

  for( int i = 0; i < PCF_NUM_SAMPLES; i ++ ) {
    vec2 sample = diskSamples[i] * filterRadius; // scaling does not need squaring
    vec2 suv = sample + coords.xy;
    float depth = shadowMapLookUp(shadowMap, suv);
    float z = coords.z;
    if (z - float(EPS) >= depth) numVis -= 1.0;
  }

  return numVis/total;
}

/*
  Blocker search-radius. Uses law of similar triangles.
  We use LIGHT_UV because the search-radius is applied on the shadow map (UV space)
  Draw a triangle from light to shadow-map to receiver, with the base of triangle at light
  and tip of triangle at receiver.
*/
float blockerSearchRadius(float zReceiver) {
  return float(LIGHT_SIZE_UV) * (zReceiver - float(NEAR_PLANE)) / zReceiver;
}

/*
  Calculates the average blocker depth.
*/
float averageBlockerDepth(sampler2D shadowMap, vec2 uv, float zReceiver) {
  poissonDiskSamples(uv * uv);

  float blockerSearchSize = blockerSearchRadius(zReceiver);
  float totalD = 0.0;
  int numOccluded = 0;

  for( int i = 0; i < BLOCKER_SEARCH_NUM_SAMPLES; i ++ ) {
    vec2 sample = diskSamples[i] * blockerSearchSize; // scaling does not need squaring
    vec2 suv = sample + uv;
    float depth = shadowMapLookUp(shadowMap, suv);
    if (zReceiver - float(EPS) >= depth) {
      totalD += depth;
      numOccluded += 1;
    }
  }

  if (numOccluded == 0) return zReceiver + 1.0;
  return totalD/float(numOccluded);
}

/*
  Ratio of the penumbra. For the formula/diagram:
  see https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf
  But we won't use w_light here, hence it is just a ratio.
  Uses law of similar tangents.
  Draw two triangles pointing at each other:
  Top triangle -> light to blocker; bottom triangle -> blocker to receiver
*/
float penumbraRatio(float zReceiver, float avgBlockerD) {
  return (zReceiver - avgBlockerD) / avgBlockerD;
}

/*
  Radius for PCF. Note that it is wrong to use penumbraUV as filter size:
  The filter acts on shadow map whereas penumbra is on the receiver.
  Uses law of similar triangles. Draw a triangle with tip at light and base at receiver.
*/
float filterRadius(float penumbraRatio, float zReceiver) {
  float penumbraUV = penumbraRatio * float(LIGHT_SIZE_UV);
  return penumbraUV * float(NEAR_PLANE) / zReceiver;
}

/*
  Percentage closer soft-shadows
*/
float PCSS(sampler2D shadowMap, vec4 coords){
  // STEP 1: avgblocker depth
  float zReceiver = coords.z;
  float avgBlockerD = averageBlockerDepth(shadowMap, coords.xy, zReceiver);
  if (avgBlockerD > zReceiver) return 1.0;

  // STEP 2: penumbra size
  float penumbraR = penumbraRatio(zReceiver, avgBlockerD);
  float filterRadius = filterRadius(penumbraR, zReceiver);

  // STEP 3: filtering
  return PCF(shadowMap, coords, filterRadius);
}

/*
  Blinn-Phong shading
*/
vec3 blinnPhong() {
  vec3 color = texture2D(uSampler, vTextureCoord).rgb;
  color = pow(color, vec3(2.2));

  vec3 ambient = 0.05 * color;

  vec3 lightDir = normalize(uLightPos);
  vec3 normal = normalize(vNormal);
  float diff = max(dot(lightDir, normal), 0.0);
  vec3 light_atten_coff =
      uLightIntensity / pow(length(uLightPos - vFragPos), 2.0);
  vec3 diffuse = diff * light_atten_coff * color;

  vec3 viewDir = normalize(uCameraPos - vFragPos);
  vec3 halfDir = normalize((lightDir + viewDir));
  float spec = pow(max(dot(halfDir, normal), 0.0), 32.0);
  vec3 specular = uKs * light_atten_coff * spec;

  vec3 radiance = (ambient + diffuse + specular);
  vec3 phongColor = pow(radiance, vec3(1.0 / 2.2));
  return phongColor;
}

void main(void) {
  float visibility = 1.0;
  vec3 shadowCoord = getShadowCoord();

  // visibility = useShadowMap(uShadowMap, vec4(shadowCoord, 1.0));
  // visibility = PCF(uShadowMap, vec4(shadowCoord, 1.0), float(PCF_FILTER_SIZE));
  visibility = PCSS(uShadowMap, vec4(shadowCoord, 1.0));

  vec3 phongColor = blinnPhong();
  gl_FragColor = vec4(phongColor*visibility, 1.0);
}